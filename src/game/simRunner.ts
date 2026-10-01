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

export class SimRunner {
  readonly ctx: SimContext;
  readonly state: GameState;
  /** Carrier q positions (milli-hex) before the last tick, by entity id, for interpolation. */
  readonly prevCarrierQ = new Map<number, number>();
  private clock = 0;
  private lastNow: number | null = null;
  private sinceStep = 0;
  private readonly tickMs: number;

  constructor(
    map: MapData,
    config: Config,
    readonly session: LockstepSession,
  ) {
    this.ctx = createContext(map, config);
    const { slots, seed } = session.info;
    this.state = createInitialState(
      this.ctx,
      slots.length,
      seed,
      slots.map((s) => s.name === null),
    );
    this.tickMs = 1000 / config.tickRate;
  }

  /** Our player slot. */
  get localPlayer(): number {
    return this.session.info.you;
  }

  submit(command: Command): void {
    this.session.submit(command);
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
    if (this.session.isHost) {
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
      step(this.state, this.ctx, commands);
      this.sinceStep = 0;
      if (this.state.tick % HASH_EVERY_TICKS === 0) this.session.reportHash(this.state.tick, hashState(this.state));
    }
  }

  /** How far we are between the last tick and the next one, 0..1. */
  get alpha(): number {
    return Math.min(1, this.sinceStep / this.tickMs);
  }
}
