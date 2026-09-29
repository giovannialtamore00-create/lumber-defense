// Placement legality (DESIGN §5, §6.4, §7.3). The UI calls these same functions for its green/red previews.
import { type SimContext, idx } from '../context';
import { hexesInRadius } from '../hex';
import { structureAt, structures } from '../state';
import type { GameState, ItemKind } from '../types';
import { isCoveredBy } from './territory';

export const isForest = (state: GameState, i: number) => state.forestPool[i]! > 0;
const isRock = (ctx: SimContext, i: number) => ctx.map.hexes[i]!.terrain === 'rock';

/** Open land a structure can stand on: not water, forest or rock, and no structure yet. */
function isOpenLand(state: GameState, ctx: SimContext, i: number): boolean {
  const h = ctx.map.hexes[i]!;
  return !ctx.isRiver[i] && !isRock(ctx, i) && !isForest(state, i) && !structureAt(state, h.q, h.r);
}

/** Why `player` can't place `item` on hex (q, r), or null if they can. Carriers use `carrierRouteError`. */
export function placementError(state: GameState, ctx: SimContext, player: number, item: ItemKind, q: number, r: number): string | null {
  const p = state.players[player];
  if (!p) return 'no such player';
  const i = idx(ctx, { q, r });
  if (i === undefined) return 'outside the map';
  const hex = ctx.map.hexes[i]!;

  if (!p.started) {
    if (item !== 'outpost') return 'place your first outpost first';
    return firstOutpostError(state, ctx, player, i);
  }
  if (item === 'carrier') return 'carriers are placed with a route';
  if (!isCoveredBy(state, i, player)) return 'outside your territory';
  if (ctx.isRiver[i]) return 'water';
  if (isRock(ctx, i)) return 'rock';
  if (structureAt(state, hex.q, hex.r)) return 'already taken';

  switch (item) {
    case 'woodchopper':
      return isForest(state, i) ? null : 'woodchoppers go on a forest hex';
    case 'factory':
      if (isForest(state, i)) return 'trees';
      return ctx.riverside[i] ? null : 'factory-mills must be on the riverside';
    case 'dock':
      if (isForest(state, i)) return 'trees';
      return ctx.riverside[i] ? null : 'docks must be next to a river';
    case 'outpost':
      return isForest(state, i) ? 'trees' : null;
  }
}

/**
 * First outpost (DESIGN §5): anywhere in the player's own region, and only a valid start if its territory contains a
 * forest and a free riverside hex (somewhere to put the factory-mill).
 */
function firstOutpostError(state: GameState, ctx: SimContext, player: number, i: number): string | null {
  const hex = ctx.map.hexes[i]!;
  if (hex.region !== state.players[player]!.region) return 'outside your region';
  if (!isOpenLand(state, ctx, i)) return ctx.isRiver[i] ? 'water' : isRock(ctx, i) ? 'rock' : isForest(state, i) ? 'trees' : 'already taken';
  const territory = territoryIndices(ctx, hex.q, hex.r);
  if (!territory.some((t) => isForest(state, t))) return 'no forest in this territory';
  if (!territory.some((t) => t !== i && ctx.riverside[t] && isOpenLand(state, ctx, t))) return 'no free riverside in this territory';
  return null;
}

export function territoryIndices(ctx: SimContext, q: number, r: number): number[] {
  return hexesInRadius({ q, r }, ctx.config.outpost.territoryRadius)
    .map((h) => idx(ctx, h))
    .filter((t): t is number => t !== undefined);
}

// --- Carriers ---------------------------------------------------------------------------------------------------

export interface DropOff {
  q: number;
  /** q of the river hex the load falls into; null for a factory drop-off. */
  riverQ: number | null;
}

/** Pickup A: a hex in the player's legal area holding a wood pile, or about to (woodchopper, dock) (DESIGN §6.4). */
export function pickupError(state: GameState, ctx: SimContext, player: number, q: number, r: number): string | null {
  const i = idx(ctx, { q, r });
  if (i === undefined) return 'outside the map';
  if (!isCoveredBy(state, i, player)) return 'outside your territory';
  const s = structureAt(state, q, r);
  if (state.stacks[i]! > 0 || s?.kind === 'woodchopper' || s?.kind === 'dock') return null;
  return 'no wood pile here';
}

/** Hex index at (q, r), or undefined. */
const at = (ctx: SimContext, q: number, r: number) => idx(ctx, { q, r });

/** Carriers pass through anything except rocks and water (DESIGN §6.4). */
function rowPassable(ctx: SimContext, r: number, fromQ: number, toQ: number): boolean {
  for (let q = Math.min(fromQ, toQ); q <= Math.max(fromQ, toQ); q++) {
    const i = at(ctx, q, r);
    if (i === undefined || ctx.isRiver[i] || isRock(ctx, i)) return false;
  }
  return true;
}

/**
 * Valid drop-offs B for pickup A (DESIGN §6.4): carriers only move along A's row. B is either the first hex before
 * the closest river on that row, or one of the player's factories on that row. Both within the route distance.
 */
export function dropOffs(state: GameState, ctx: SimContext, player: number, aQ: number, r: number): DropOff[] {
  const max = ctx.config.carrier.maxRouteDistance;
  const out: DropOff[] = [];

  // Factories first: if one stands on the river drop-off hex, the wood goes into the factory.
  for (const s of structures(state)) {
    if (s.kind !== 'factory' || s.owner !== player || s.r !== r) continue;
    if (Math.abs(s.q - aQ) <= max && rowPassable(ctx, r, aQ, s.q)) out.push({ q: s.q, riverQ: null });
  }

  // Closest river on the row, looking both ways (a tie gives two options).
  let best = Infinity;
  const rivers: number[] = [];
  for (let d = 1; d <= max + 1 && d <= best; d++) {
    for (const q of [aQ - d, aQ + d]) {
      const i = at(ctx, q, r);
      if (i !== undefined && ctx.isRiver[i]) {
        best = d;
        rivers.push(q);
      }
    }
  }
  for (const riverQ of rivers) {
    const q = riverQ + (riverQ > aQ ? -1 : 1);
    if (Math.abs(q - aQ) <= max && rowPassable(ctx, r, aQ, q) && !out.some((d) => d.q === q)) out.push({ q, riverQ });
  }
  return out;
}

export function carrierRouteError(state: GameState, ctx: SimContext, player: number, aQ: number, bQ: number, r: number): string | null {
  const e = pickupError(state, ctx, player, aQ, r);
  if (e) return e;
  return dropOffs(state, ctx, player, aQ, r).some((d) => d.q === bQ) ? null : 'not a drop-off for this pickup';
}
