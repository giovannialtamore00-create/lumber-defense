// Outpost coverage (DESIGN §8.2, §9). Conflict zones, neutral structures and capture come in M5.
import type { SimContext } from '../context';
import { hexesInRadius } from '../hex';
import { idx } from '../context';
import { structures } from '../state';
import type { GameState } from '../types';
import { upgradeValue } from '../upgrades';

/** Recomputes which players cover each hex. Call after outposts are added or removed. */
export function recomputeCoverage(state: GameState, ctx: SimContext): void {
  state.coverage.fill(0);
  for (const s of structures(state)) {
    if (s.kind !== 'outpost') continue;
    // Reach (DESIGN §10.3) grows every outpost of the owner.
    const reach = upgradeValue(state, ctx, s.owner, 'outpost', 'reach', 'radiusBonus', 0);
    for (const h of hexesInRadius(s, (s.radius ?? ctx.config.outpost.territoryRadius) + reach)) {
      const i = idx(ctx, h);
      if (i !== undefined) state.coverage[i]! |= 1 << s.owner;
    }
  }
}

/** Legal area for a player: their territory or a conflict zone, i.e. any hex their outposts cover (DESIGN §7.3). */
export function isCoveredBy(state: GameState, i: number, player: number): boolean {
  return (state.coverage[i]! & (1 << player)) !== 0;
}
