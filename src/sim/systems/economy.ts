// Factory intake (DESIGN §6.7): wood reaching a factory becomes its owner's, added to one shared wood count.
// A neutral factory keeps working, but its wood piles up as a stack on its hex for any carrier (DESIGN §9).
import { type SimContext, idx } from '../context';
import { NEUTRAL, type GameState, type Structure } from '../types';
import { isWater } from '../water';
import { spawnPile } from './river';

export function deliverToFactory(state: GameState, ctx: SimContext, factory: Structure, amount: number): void {
  const p = factory.owner === NEUTRAL ? undefined : state.players[factory.owner];
  if (!p) {
    state.stacks[idx(ctx, factory)!]! += amount;
    return;
  }
  p.wood += amount;
  p.stats.woodCollected += amount;
}

/** Leaves wood on a hex: a stack on land, a floating pile on water. */
export function dropWood(state: GameState, ctx: SimContext, q: number, r: number, amount: number): void {
  const i = idx(ctx, { q, r });
  if (i === undefined || amount <= 0) return;
  if (isWater(state, ctx, i)) spawnPile(state, ctx, q, r, amount);
  else state.stacks[i]! += amount;
}
