// Outpost coverage and ownership (DESIGN §8.2, §9). Who owns an item depends only on who covers its hex right now.
import type { SimContext } from '../context';
import { hexesInRadius } from '../hex';
import { idx } from '../context';
import { isOwnable, structures } from '../state';
import { NEUTRAL, type GameState, type Ownable } from '../types';
import { upgradeValue } from '../upgrades';
import { checkDefeats, maxHp } from './combat';

/** Recomputes which players cover each hex. Call after outposts are added or removed. */
export function recomputeCoverage(state: GameState, ctx: SimContext): void {
  state.coverage.fill(0);
  for (const s of structures(state)) {
    if (s.kind !== 'outpost' || s.owner === NEUTRAL) continue;
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
  return player >= 0 && (state.coverage[i]! & (1 << player)) !== 0;
}

/** Outposts were added, removed or grew: coverage, then ownership, then who is out of the game. */
export function territoryChanged(state: GameState, ctx: SimContext): void {
  recomputeCoverage(state, ctx);
  updateOwnership(state, ctx);
  checkDefeats(state, ctx);
}

/** The hex that decides who owns an item: carriers by pickup A, guards by home hex, the rest where they stand. */
function anchor(e: Ownable): { q: number; r: number } {
  if (e.type === 'carrier') return { q: e.aQ, r: e.r };
  if (e.type === 'guard') return { q: e.homeQ, r: e.homeR };
  return { q: e.q, r: e.r };
}

/**
 * Ownership rule (DESIGN §9): an item keeps its owner while the owner covers its hex. Otherwise it passes to the one
 * player who covers it, or turns neutral if nobody or several players do. Catapults keep their owner (DESIGN §8.6).
 */
export function updateOwnership(state: GameState, ctx: SimContext): void {
  for (const e of state.entities) {
    if (!isOwnable(e) || e.type === 'catapult') continue;
    const i = idx(ctx, anchor(e));
    if (i === undefined || isCoveredBy(state, i, e.owner)) continue;
    const c = state.coverage[i]!;
    const owner = c !== 0 && (c & (c - 1)) === 0 ? 31 - Math.clz32(c) : NEUTRAL;
    if (owner === e.owner) continue;
    e.owner = owner;
    e.hp = Math.min(e.hp, maxHp(state, ctx, e)); // HP stays the same (DESIGN §11), within the new owner's max
  }
}
