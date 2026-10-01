// Floating piles (DESIGN §6.5): each pile floats downstream at the float speed, never merges, takes a random 50/50
// branch at a fork (seeded), and disappears past the southern edge. The waterfall changes nothing for piles.
// Dams (DESIGN §8.4b): a dammed fork branch is skipped; otherwise a pile waits behind the dam and tries again every
// second, each try giving the docks beside it another chance to catch.
import { MILLI } from '../fixed';
import { type SimContext, idx } from '../context';
import { nextInt } from '../rng';
import { addEntity, removeEntity, structureAt } from '../state';
import type { GameState, Pile } from '../types';
import { upgradeValue } from '../upgrades';
import { downstream } from '../water';
import { catchPile } from './docks';

/** Drops a load into river hex (q, r). Docks beside that hex get the first chance to catch it. */
export function spawnPile(state: GameState, ctx: SimContext, q: number, r: number, amount: number): void {
  const pile = addEntity<Pile>(state, { type: 'pile', q, r, amount, progress: 0 });
  catchPile(state, ctx, pile);
  if (pile.amount === 0) removeEntity(state, pile.id);
}

function damAt(state: GameState, ctx: SimContext, i: number): boolean {
  const h = ctx.map.hexes[i]!;
  return structureAt(state, h.q, h.r)?.kind === 'dam';
}

export function riverSystem(state: GameState, ctx: SimContext): void {
  const piles = state.entities.filter((e): e is Pile => e.type === 'pile');
  for (const pile of piles) {
    pile.progress += ctx.rates.floatSpeed;
    while (pile.progress >= MILLI && pile.amount > 0) {
      pile.progress -= MILLI;
      const down = downstream(state, ctx, idx(ctx, pile)!);
      if (down === 'exit') {
        pile.amount = 0;
        break;
      }
      const open = down.filter((n) => !damAt(state, ctx, n));
      if (open.length === 0) {
        pile.progress = 0; // stuck behind a dam or in a dead-end dug channel: try again in a second
        catchPile(state, ctx, pile);
        break;
      }
      const next = open.length > 1 ? open[nextInt(state.rng, open.length)]! : open[0]!;
      const h = ctx.map.hexes[next]!;
      pile.q = h.q;
      pile.r = h.r;
      // Grate (DESIGN §10.3): the wood stops on the bridge, as a stack its owner's carriers can pick up.
      const grate = structureAt(state, h.q, h.r);
      if (grate?.kind === 'bridge' && upgradeValue(state, ctx, grate.owner, 'bridge', 'drawbridge', 'grate', 0) > 0) {
        state.stacks[next]! += pile.amount;
        pile.amount = 0;
        break;
      }
      catchPile(state, ctx, pile);
    }
    if (pile.amount === 0) removeEntity(state, pile.id);
  }
}
