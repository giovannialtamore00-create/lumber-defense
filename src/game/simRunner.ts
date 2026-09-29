// Runs the sim at its fixed tick rate for the game layer, and remembers previous positions for smooth rendering.
// Single player acts as its own host: commands go through the transport and are stepped on the next tick.
// Lockstep scheduling with input delay and hash checks replaces this in M4.
import type { Transport } from '../net/transport';
import { type SimContext, createContext } from '../sim/context';
import type { MapData } from '../sim/map';
import { createInitialState } from '../sim/state';
import { step } from '../sim/tick';
import type { Command, Config, GameState } from '../sim/types';

const MAX_CATCH_UP_TICKS = 10;

export class SimRunner {
  readonly ctx: SimContext;
  readonly state: GameState;
  /** Carrier q positions (milli-hex) before the last tick, by entity id, for interpolation. */
  readonly prevCarrierQ = new Map<number, number>();
  private pending: Command[] = [];
  private acc = 0;
  private readonly tickMs: number;

  constructor(
    map: MapData,
    config: Config,
    playerCount: number,
    seed: number,
    private readonly transport: Transport,
    allowDevCommands: boolean,
  ) {
    this.ctx = createContext(map, config, allowDevCommands);
    this.state = createInitialState(this.ctx, playerCount, seed);
    this.tickMs = 1000 / config.tickRate;
    transport.onMessage((msg) => {
      if (msg.type === 'command') this.pending.push(msg.command);
    });
  }

  submit(command: Command): void {
    this.transport.send({ type: 'command', command });
  }

  update(dtMs: number): void {
    this.acc += dtMs;
    for (let n = 0; this.acc >= this.tickMs && n < MAX_CATCH_UP_TICKS; n++) {
      this.prevCarrierQ.clear();
      for (const e of this.state.entities) if (e.type === 'carrier') this.prevCarrierQ.set(e.id, e.posQ);
      const commands = this.pending;
      this.pending = [];
      step(this.state, this.ctx, commands);
      this.acc -= this.tickMs;
    }
    if (this.acc > this.tickMs) this.acc = this.tickMs; // don't spiral after a long pause
  }

  /** How far we are between the last tick and the next one, 0..1. */
  get alpha(): number {
    return this.acc / this.tickMs;
  }
}
