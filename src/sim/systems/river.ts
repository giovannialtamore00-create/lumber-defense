// Floating piles (DESIGN §6.5): each pile floats downstream at the float speed, never merges, takes a random 50/50
// branch at a fork (seeded), and disappears past the southern edge. The waterfall changes nothing for piles.
import { MILLI } from '../fixed';
import { type SimContext, idx } from '../context';
import { nextInt } from '../rng';
import { addEntity, removeEntity } from '../state';
import type { GameState, Pile } from '../types';
import { catchPile } from './docks';

/** Drops a load into river hex (q, r). Docks beside that hex get the first chance to catch it. */
export function spawnPile(state: GameState, ctx: SimContext, q: number, r: number, amount: number): void {
  const pile = addEntity<Pile>(state, { type: 'pile', q, r, amount, progress: 0 });
  catchPile(state, ctx, pile);
  if (pile.amount === 0) removeEntity(state, pile.id);
}

export function riverSystem(state: GameState, ctx: SimContext): void {
  const piles = state.entities.filter((e): e is Pile => e.type === 'pile');
  for (const pile of piles) {
    pile.progress += ctx.rates.floatSpeed;
    while (pile.progress >= MILLI && pile.amount > 0) {
      pile.progress -= MILLI;
      const down = ctx.down[idx(ctx, pile)!]!;
      if (down === 'exit') {
        pile.amount = 0;
        break;
      }
      const next = down.length > 1 ? down[nextInt(state.rng, down.length)]! : down[0]!;
      const h = ctx.map.hexes[next]!;
      pile.q = h.q;
      pile.r = h.r;
      catchPile(state, ctx, pile);
    }
    if (pile.amount === 0) removeEntity(state, pile.id);
  }
}
