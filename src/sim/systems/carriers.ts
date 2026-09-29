// Carriers (DESIGN §6.4): go to A, take whatever is there (≥ 1 wood, up to capacity), go to B, drop, repeat.
// They move only along their row. At a river drop-off the load falls into the river; at a factory it becomes the
// owner's wood.
import { MILLI } from '../fixed';
import { type SimContext, idx } from '../context';
import { structureAt } from '../state';
import type { Carrier, GameState } from '../types';
import { deliverToFactory } from './economy';
import { spawnPile } from './river';

/** Moves the carrier towards `targetQ`; true once it's there. */
function moveTo(c: Carrier, targetQ: number, speed: number): boolean {
  const target = targetQ * MILLI;
  const delta = target - c.posQ;
  if (Math.abs(delta) <= speed) {
    c.posQ = target;
    return true;
  }
  c.posQ += Math.sign(delta) * speed;
  return false;
}

export function carriersSystem(state: GameState, ctx: SimContext): void {
  const carriers = state.entities.filter((e): e is Carrier => e.type === 'carrier');
  for (const c of carriers) {
    if (c.phase === 'toA') {
      if (!moveTo(c, c.aQ, ctx.rates.carrierSpeed)) continue;
      const a = idx(ctx, { q: c.aQ, r: c.r })!;
      if (state.stacks[a]! < MILLI) continue; // wait for at least 1 wood
      const take = Math.min(ctx.rates.carrierCapacity, state.stacks[a]!);
      state.stacks[a]! -= take;
      c.load = take;
      c.phase = 'toB';
    }
    if (c.phase === 'toB') {
      if (!moveTo(c, c.bQ, ctx.rates.carrierSpeed)) continue;
      if (c.riverQ !== null) {
        spawnPile(state, ctx, c.riverQ, c.r, c.load);
      } else {
        const factory = structureAt(state, c.bQ, c.r);
        if (factory?.kind !== 'factory') continue; // factory gone: wait with the load (M5 decides more)
        deliverToFactory(state, factory, c.load);
      }
      c.load = 0;
      c.phase = 'toA';
    }
  }
}
