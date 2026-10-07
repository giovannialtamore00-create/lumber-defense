// Placement legality (DESIGN §5, §6.4, §7.3). The UI calls these same functions for its green/red previews.
import { type SimContext, idx } from '../context';
import { hexesInRadius } from '../hex';
import { structureAt, structures } from '../state';
import { upgradeValue } from '../upgrades';
import { isDryDitch, isRiverside, isRock, isWater } from '../water';
import type { GameState, ItemKind } from '../types';
import { currentTurnPlayer } from './startTurns';
import { isCoveredBy } from './territory';

export const isForest = (state: GameState, i: number) => state.forestPool[i]! > 0;

/** Open land a structure can stand on: not water, forest or rock, and no structure yet. */
function isOpenLand(state: GameState, ctx: SimContext, i: number): boolean {
  const h = ctx.map.hexes[i]!;
  return !isWater(state, ctx, i) && !isRock(state, ctx, i) && !isForest(state, i) && !structureAt(state, h.q, h.r);
}

/**
 * Why `player` can't place `item` on hex (q, r), or null if they can. Carriers use `carrierRouteError`. `asBot`: asked
 * for the bot playing the slot (M7), so a bot-held slot isn't an error.
 */
export function placementError(state: GameState, ctx: SimContext, player: number, item: ItemKind, q: number, r: number, asBot = false): string | null {
  const p = state.players[player];
  if (!p) return 'no such player';
  const i = idx(ctx, { q, r });
  if (i === undefined) return 'outside the map';
  const hex = ctx.map.hexes[i]!;

  if (!p.started) {
    if (item !== 'outpost') return 'place your first outpost first';
    return firstOutpostError(state, ctx, player, i, asBot);
  }
  if (item === 'carrier') return 'carriers are placed with a route';
  if (!isCoveredBy(state, i, player)) return 'outside your territory';
  if (item === 'stoneCutter') {
    // A unit that stands on a rock; several can share one (DESIGN §8.4d).
    return isRock(state, ctx, i) ? null : 'stone cutters go on a rock';
  }
  if (item === 'forestGuard' || item === 'catapult') {
    // Moving units: they don't take the hex, they just need land to stand on (DESIGN §8.6, §8.7).
    if (isWater(state, ctx, i)) return 'water';
    return isRock(state, ctx, i) ? 'rock' : null;
  }
  if (structureAt(state, hex.q, hex.r)) return 'already taken';
  // Bridges and dams are built on water (DESIGN §8.4, §8.4b).
  if (item === 'bridge') return isWater(state, ctx, i) ? null : 'bridges go on water';
  if (item === 'dam') return isWater(state, ctx, i) ? null : 'dams go on a river';
  if (isWater(state, ctx, i)) return 'water';
  if (isRock(state, ctx, i)) return 'rock';
  if (state.saplingGrowth[i]! >= 0) return 'young forest growing';
  if (isDryDitch(state, i)) return 'dry ditch: waiting for water';
  // Debris blocks building like a forest; a woodchopper placed on it clears it (DESIGN §9).
  if (state.debris[i]! > 0) return item === 'woodchopper' ? null : 'debris: clear it with a woodchopper';

  switch (item) {
    case 'woodchopper':
      return isForest(state, i) ? null : 'woodchoppers go on a forest hex';
    case 'factory':
      if (isForest(state, i)) return 'trees';
      return isRiverside(state, ctx, i) ? null : 'factory-mills must be on the riverside';
    case 'dock':
      if (isForest(state, i)) return 'trees';
      return isRiverside(state, ctx, i) ? null : 'docks must be next to a river';
    case 'outpost':
    case 'workshop':
    case 'excavator':
      return isForest(state, i) ? 'trees' : null;
  }
}

// --- Bridges ----------------------------------------------------------------------------------------------------

/** The bridge piece on hex i, if any. */
export function bridgeAt(state: GameState, ctx: SimContext, i: number) {
  const h = ctx.map.hexes[i]!;
  const s = structureAt(state, h.q, h.r);
  return s?.kind === 'bridge' ? s : undefined;
}
const isBridgeAt = (state: GameState, ctx: SimContext, i: number) => !!bridgeAt(state, ctx, i);

/** How many water hexes a bridge piece covers along its row: 1, or more with its owner's Causeway (DESIGN §10.3). */
function causewaySpan(state: GameState, ctx: SimContext, owner: number): number {
  return upgradeValue(state, ctx, owner, 'bridge', 'causeway', 'span', 1);
}

/**
 * A bridge works when a straight run of bridge pieces through it, in any of the three hex directions, has land at
 * both ends. Otherwise it's a half bridge and nothing can cross it (DESIGN §8.4). Along its row, a Causeway piece
 * also covers extra water hexes next to it.
 */
export function isWorkingBridge(state: GameState, ctx: SimContext, i: number): boolean {
  const b = bridgeAt(state, ctx, i);
  if (!b) return false;
  const h = ctx.map.hexes[i]!;
  let spare = causewaySpan(state, ctx, b.owner) - 1; // extra water hexes this piece covers along its row
  const landAtEnd = (dq: number, dr: number, row: boolean) => {
    for (let k = 1; ; k++) {
      const j = idx(ctx, { q: h.q + dq * k, r: h.r + dr * k });
      if (j === undefined) return false;
      if (!isWater(state, ctx, j)) return true;
      if (isBridgeAt(state, ctx, j)) continue;
      if (row && spare > 0) {
        spare--;
        continue;
      }
      return false;
    }
  };
  // The three axes: east–west, north-east–south-west, north-west–south-east.
  return (
    (landAtEnd(1, 0, true) && landAtEnd(-1, 0, true)) ||
    (landAtEnd(1, -1, false) && landAtEnd(-1, 1, false)) ||
    (landAtEnd(0, -1, false) && landAtEnd(0, 1, false))
  );
}

/** A Drawbridge keeps other players' wheeled units off (DESIGN §10.3). */
function closedTo(state: GameState, ctx: SimContext, owner: number, player: number): boolean {
  return owner !== player && upgradeValue(state, ctx, owner, 'bridge', 'drawbridge', 'blockOthers', 0) > 0;
}

/**
 * Water hex `player`'s wheeled units can cross: a working bridge piece, or a water hex in the same row covered by a
 * working Causeway piece's span; and not behind someone else's Drawbridge.
 */
export function crossable(state: GameState, ctx: SimContext, i: number, player: number): boolean {
  const own = bridgeAt(state, ctx, i);
  if (own) return isWorkingBridge(state, ctx, i) && !closedTo(state, ctx, own.owner, player);
  const h = ctx.map.hexes[i]!;
  for (const b of structures(state)) {
    if (b.kind !== 'bridge' || b.r !== h.r) continue;
    const gap = Math.abs(b.q - h.q);
    if (gap === 0 || gap > causewaySpan(state, ctx, b.owner) - 1) continue;
    const between = [...Array(gap).keys()].map((k) => idx(ctx, { q: h.q + Math.sign(b.q - h.q) * k, r: h.r }));
    if (!between.every((j) => j !== undefined && isWater(state, ctx, j))) continue;
    if (isWorkingBridge(state, ctx, idx(ctx, b)!) && !closedTo(state, ctx, b.owner, player)) return true;
  }
  return false;
}

/** Wood on a grated bridge can only be picked up by the bridge's owner (DESIGN §10.3). */
export function canCollectAt(state: GameState, ctx: SimContext, i: number, player: number): boolean {
  const b = bridgeAt(state, ctx, i);
  return !b || b.owner === player;
}

/**
 * First outpost (DESIGN §5): anywhere in the player's own region, and only a valid start if its territory contains a
 * forest and a free riverside hex (somewhere to put the factory-mill).
 */
function firstOutpostError(state: GameState, ctx: SimContext, player: number, i: number, asBot: boolean): string | null {
  const hex = ctx.map.hexes[i]!;
  if (state.players[player]!.bot && !asBot) return 'a bot has your slot';
  if (state.phase === 'start' && currentTurnPlayer(state) !== player) return 'wait for your turn';
  if (hex.region !== state.players[player]!.region) return 'outside your region';
  if (!isOpenLand(state, ctx, i)) return isWater(state, ctx, i) ? 'water' : isRock(state, ctx, i) ? 'rock' : isForest(state, i) ? 'trees' : 'already taken';
  const territory = territoryIndices(ctx, hex.q, hex.r, ctx.config.outpost.firstTerritoryRadius);
  if (!territory.some((t) => isForest(state, t))) return 'no forest in this territory';
  if (!territory.some((t) => t !== i && isRiverside(state, ctx, t) && isOpenLand(state, ctx, t))) return 'no free riverside in this territory';
  return null;
}

/** Hexes an outpost at (q, r) would cover with territory radius `radius`. */
export function territoryIndices(ctx: SimContext, q: number, r: number, radius: number): number[] {
  return hexesInRadius({ q, r }, radius)
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
  if (!canCollectAt(state, ctx, i, player)) return "someone else's bridge";
  if (state.stacks[i]! > 0 || s?.kind === 'woodchopper' || s?.kind === 'dock') return null;
  if (s?.kind === 'bridge' && upgradeValue(state, ctx, player, 'bridge', 'drawbridge', 'grate', 0) > 0) return null;
  return 'no wood pile here';
}

/** Hex index at (q, r), or undefined. */
const at = (ctx: SimContext, q: number, r: number) => idx(ctx, { q, r });

/** Carriers pass through anything except rocks and water; a working bridge carries them over water (DESIGN §6.4, §8.4). */
export function rowPassable(state: GameState, ctx: SimContext, r: number, fromQ: number, toQ: number, player: number): boolean {
  for (let q = Math.min(fromQ, toQ); q <= Math.max(fromQ, toQ); q++) {
    const i = at(ctx, q, r);
    if (i === undefined || isRock(state, ctx, i)) return false;
    if (isWater(state, ctx, i) && !crossable(state, ctx, i, player)) return false;
  }
  return true;
}

/** How far a player's carriers may route, with Mobility (DESIGN §10.3). */
export function carrierRoute(state: GameState, ctx: SimContext, player: number): number {
  return upgradeValue(state, ctx, player, 'carrier', 'mobility', 'route', ctx.config.carrier.maxRouteDistance);
}

/**
 * Valid drop-offs B for pickup A (DESIGN §6.4): carriers only move along A's row. B is one of the player's factories
 * on that row, or a river drop-off: the first hex before the first river east or west of A (the player picks
 * either), or, if a working bridge crosses that river on the row, the bridge itself (the logs drop from the bridge
 * into the river below). All within the route distance.
 */
export function dropOffs(state: GameState, ctx: SimContext, player: number, aQ: number, r: number): DropOff[] {
  const max = carrierRoute(state, ctx, player);
  const out: DropOff[] = [];

  // Factories first: if one stands on the river drop-off hex, the wood goes into the factory.
  for (const s of structures(state)) {
    if (s.kind !== 'factory' || s.owner !== player || s.r !== r) continue;
    if (Math.abs(s.q - aQ) <= max && rowPassable(state, ctx, r, aQ, s.q, player)) out.push({ q: s.q, riverQ: null });
  }

  // The first river in each direction along the row (west, then east).
  const rivers: number[] = [];
  for (const dir of [-1, 1]) {
    for (let d = 1; d <= max + 1; d++) {
      const i = at(ctx, aQ + dir * d, r);
      if (i === undefined) break;
      if (isWater(state, ctx, i)) {
        rivers.push(aQ + dir * d);
        break;
      }
    }
  }
  for (const riverQ of rivers) {
    const ri = at(ctx, riverQ, r)!;
    const onBridge = !!bridgeAt(state, ctx, ri) && crossable(state, ctx, ri, player);
    const q = onBridge ? riverQ : riverQ + (riverQ > aQ ? -1 : 1);
    if (Math.abs(q - aQ) <= max && rowPassable(state, ctx, r, aQ, q, player) && !out.some((d) => d.q === q)) out.push({ q, riverQ });
  }
  return out;
}

/** Is there any legal spot for `item` right now? Carriers need a pickup with a drop-off (DESIGN §7.3b). */
export function canPlaceAnywhere(state: GameState, ctx: SimContext, player: number, item: ItemKind): boolean {
  if (item === 'carrier')
    return ctx.map.hexes.some((h) => !pickupError(state, ctx, player, h.q, h.r) && dropOffs(state, ctx, player, h.q, h.r).length > 0);
  return ctx.map.hexes.some((h) => placementError(state, ctx, player, item, h.q, h.r) === null);
}

export function carrierRouteError(state: GameState, ctx: SimContext, player: number, aQ: number, bQ: number, r: number): string | null {
  const e = pickupError(state, ctx, player, aQ, r);
  if (e) return e;
  return dropOffs(state, ctx, player, aQ, r).some((d) => d.q === bQ) ? null : 'not a drop-off for this pickup';
}
