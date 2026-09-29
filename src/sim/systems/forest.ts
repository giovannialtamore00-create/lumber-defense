// Woodchoppers cut their forest hex into a log stack on the same hex (DESIGN §6.2). A pool at 0 means the forest is
// gone from that hex. Gardener regrowth comes in M3.
import { type SimContext, idx } from '../context';
import { structures } from '../state';
import type { GameState } from '../types';

export function forestSystem(state: GameState, ctx: SimContext): void {
  for (const s of structures(state)) {
    if (s.kind !== 'woodchopper') continue;
    const i = idx(ctx, s)!;
    const cut = Math.min(ctx.rates.woodchopper, state.forestPool[i]!);
    state.forestPool[i]! -= cut;
    state.stacks[i]! += cut;
  }
}
