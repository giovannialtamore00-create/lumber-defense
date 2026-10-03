// Runs the sim for the game layer through a lockstep session: the host's clock closes one bundle per tick, and every
// client steps each tick once its bundle has arrived. Remembers previous positions for smooth rendering.
import type { LockstepSession } from '../net/lockstep';
import { HASH_EVERY_TICKS } from '../net/lockstep';
import { type SimContext, createContext } from '../sim/context';
import { hashState } from '../sim/hash';
import type { MapData } from '../sim/map';
import { createInitialState } from '../sim/state';
import { step } from '../sim/tick';
import type { Command, Config, GameState } from '../sim/types';

const MAX_STEPS_PER_UPDATE = 10;
const LOG_SNAPSHOT_TICKS = 100;

export class SimRunner {
  readonly ctx: SimContext;
  readonly state: GameState;
  /** Carrier q positions (milli-hex) before the last tick, by entity id, for interpolation. */
  readonly prevCarrierQ = new Map<number, number>();
  private clock = 0;
  private lastNow: number | null = null;
  private sinceStep = 0;
  private readonly tickMs: number;
  /** Match record for analysis (DESIGN §11): every command bundle, and the players' numbers every 10 s. */
  readonly log: {
    seed: number;
    slots: { name: string | null }[];
    commands: { tick: number; commands: Command[] }[];
    snapshots: { tick: number; players: Record<string, number | boolean>[] }[];
  };

  constructor(
    map: MapData,
    config: Config,
    readonly session: LockstepSession,
    /** A match already in progress (rejoining): the host's state, instead of a new match. */
    initial?: GameState,
  ) {
    this.ctx = createContext(map, config);
    const { slots, seed } = session.info;
    this.state =
      initial ??
      createInitialState(
        this.ctx,
        slots.length,
        seed,
        slots.map((s) => s.name === null),
      );
    this.tickMs = 1000 / config.tickRate;
    this.log = { seed, slots, commands: [], snapshots: [] };
  }

  /** Our player slot. */
  get localPlayer(): number {
    return this.session.info.you;
  }

  /**
   * Host only: a player knocking on the door mid-match. If they had a slot (same name, or the only slot whose player
   * dropped), they get it back with the match as it is now.
   */
  rejoin(peer: string, name: string): boolean {
    const { slots } = this.session.info;
    const left = [...this.session.left];
    let slot = slots.findIndex((s, i) => i !== this.localPlayer && s.name !== null && s.name === name.slice(0, 16));
    if (slot < 0 && left.length === 1) slot = left[0]!;
    if (slot < 0) return false;
    this.session.rejoin(peer, slot, this.state);
    return true;
  }

  submit(command: Command): void {
    if (this.session.paused) return; // nothing happens while paused
    this.session.submit(command);
  }

  get paused(): boolean {
    return this.session.paused;
  }

  setPaused(paused: boolean): void {
    this.session.setPaused(paused);
  }

  /**
   * Advances by real time (measured here, so the host's clock doesn't depend on the frame rate or on Phaser's smoothed
   * frame delta), or by `dtMs` when given (tests, fast-forward). Safe to call from several drivers.
   */
  update(dtMs?: number): void {
    if (dtMs === undefined) {
      const now = performance.now();
      dtMs = this.lastNow === null ? 0 : now - this.lastNow;
      this.lastNow = now;
    }
    if (this.session.isHost && this.session.paused) {
      this.clock = 0;
    } else if (this.session.isHost) {
      this.clock += dtMs;
      for (let n = 0; this.clock >= this.tickMs && n < MAX_STEPS_PER_UPDATE; n++) {
        this.session.hostTick();
        this.clock -= this.tickMs;
      }
      if (this.clock > this.tickMs) this.clock = this.tickMs; // don't spiral after a long pause
    }

    this.sinceStep += dtMs;
    for (let n = 0; n < MAX_STEPS_PER_UPDATE; n++) {
      const commands = this.session.takeBundle(this.state.tick);
      if (!commands) break;
      this.prevCarrierQ.clear();
      for (const e of this.state.entities) if (e.type === 'carrier') this.prevCarrierQ.set(e.id, e.posQ);
      if (commands.length) this.log.commands.push({ tick: this.state.tick, commands });
      step(this.state, this.ctx, commands);
      if (this.state.tick % LOG_SNAPSHOT_TICKS === 0 || this.state.phase === 'over') this.snapshot();
      this.sinceStep = 0;
      if (this.state.tick % HASH_EVERY_TICKS === 0) this.session.reportHash(this.state.tick, hashState(this.state));
    }
  }

  private snapshot(): void {
    const { state } = this;
    if (this.log.snapshots.at(-1)?.tick === state.tick) return;
    this.log.snapshots.push({
      tick: state.tick,
      players: state.players.map((p) => ({
        id: p.id,
        wood: p.wood,
        stone: p.stone,
        defeated: p.defeated,
        territory: state.coverage.filter((c) => c & (1 << p.id)).length,
        ...p.stats,
      })),
    });
  }

  /** The match record as a JSON file (DESIGN §11): kept in memory only, so it's gone when the tab closes. */
  downloadLog(): void {
    const { state } = this;
    const data = { ...this.log, endTick: state.tick, phase: state.phase, winner: state.winner };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `match-${this.session.info.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** How far we are between the last tick and the next one, 0..1. */
  get alpha(): number {
    return Math.min(1, this.sinceStep / this.tickMs);
  }
}
