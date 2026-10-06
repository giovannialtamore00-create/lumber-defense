// Live water (DESIGN §4.3, §8.4b–d): the map's rivers plus dug hexes that water has filled, and rocks that stone
// cutters haven't broken yet. Gameplay code asks these functions instead of reading the map's fixed data.
//
// Map rivers follow the flow stored in the map (south, or sideways along a row on map02). Dug water only flows down:
// a dug hex's downstream hexes are the two below it (south-west and south-east). A dug hex fills
// when the hex above it (north-west or north-east) is water. A natural river forks into a filled dug hex below it.
import type { SimContext } from './context';
import type { GameState } from './types';

/** Is hex i water now (a river, or a filled dug hex)? */
export function isWater(state: GameState, ctx: SimContext, i: number): boolean {
  return ctx.isRiver[i]! || state.dugWater[i]!;
}

/** Is hex i a rock now (not yet broken by stone cutters)? */
export function isRock(state: GameState, ctx: SimContext, i: number): boolean {
  return ctx.map.hexes[i]!.terrain === 'rock' && !state.rockGone[i];
}

/** A dry dug hex: nothing can be built on it until water fills it (DESIGN §8.4c). */
export function isDryDitch(state: GameState, i: number): boolean {
  return state.dug[i]! && !state.dugWater[i];
}

/** Land next to water. */
export function isRiverside(state: GameState, ctx: SimContext, i: number): boolean {
  return !isWater(state, ctx, i) && ctx.neighbourIdx[i]!.some((n) => isWater(state, ctx, n));
}

/** The two hexes below hex i (south-west, south-east), those that exist. */
function below(ctx: SimContext, i: number): number[] {
  const h = ctx.map.hexes[i]!;
  return [ctx.indexOf.get(`${h.q - 1},${h.r + 1}`), ctx.indexOf.get(`${h.q},${h.r + 1}`)].filter((j): j is number => j !== undefined);
}

/** The two hexes above hex i (north-west, north-east), those that exist. */
function above(ctx: SimContext, i: number): number[] {
  const h = ctx.map.hexes[i]!;
  return [ctx.indexOf.get(`${h.q},${h.r - 1}`), ctx.indexOf.get(`${h.q + 1},${h.r - 1}`)].filter((j): j is number => j !== undefined);
}

const lastRow = (ctx: SimContext) => ctx.map.height - 1;

/**
 * Where water (and wood) goes from water hex i: river hexes follow the map's flow, plus any filled dug hex below
 * them (a fork); dug water flows into the water below it. 'exit' past the southern edge; [] is a dead end.
 */
export function downstream(state: GameState, ctx: SimContext, i: number): number[] | 'exit' {
  if (ctx.isRiver[i]) {
    const natural = ctx.down[i]!;
    if (natural === 'exit') return 'exit';
    return [...natural, ...below(ctx, i).filter((j) => state.dugWater[j] && !natural.includes(j))];
  }
  if (!state.dugWater[i]) return [];
  const out = below(ctx, i).filter((j) => isWater(state, ctx, j));
  if (out.length === 0 && ctx.map.hexes[i]!.r === lastRow(ctx)) return 'exit';
  return out;
}

/**
 * Flow strength of a water hex: the river row (1–8) for rivers; for dug water 0 in the first dug hex and +1 for each
 * further one (DESIGN §8.4c).
 */
export function flowStrength(state: GameState, ctx: SimContext, i: number): number {
  return ctx.isRiver[i] ? ctx.riverRow[i]! : state.dugStrength[i]!;
}

/** Which river a water hex belongs to (dug water: the river it branches from), or -1. */
export function riverIdAt(state: GameState, ctx: SimContext, i: number): number {
  return ctx.isRiver[i] ? ctx.riverId[i]! : state.dugWater[i] ? state.dugRiver[i]! : -1;
}

/**
 * Watermill bonus index for a water hex: rivers use their row (row 1 = no bonus); dug water uses its strength the
 * same way (strength 0 or 1 = no bonus).
 */
export function bonusRow(state: GameState, ctx: SimContext, i: number): number {
  return ctx.isRiver[i] ? ctx.riverRow[i]! : Math.max(1, state.dugStrength[i]!);
}

/** Refills dug hexes from the top of the map down. Call after a hex is dug. */
export function recomputeDugWater(state: GameState, ctx: SimContext): void {
  const order = ctx.map.hexes.map((_, i) => i).filter((i) => state.dug[i]).sort((a, b) => ctx.map.hexes[a]!.r - ctx.map.hexes[b]!.r || a - b);
  for (const i of order) {
    state.dugWater[i] = false;
    state.dugStrength[i] = 0;
    state.dugRiver[i] = -1;
  }
  for (const i of order) {
    const feeders = above(ctx, i).filter((j) => isWater(state, ctx, j));
    if (feeders.length === 0) continue;
    state.dugWater[i] = true;
    const fromRiver = feeders.find((j) => ctx.isRiver[j]);
    if (fromRiver !== undefined) {
      state.dugStrength[i] = 0;
      state.dugRiver[i] = ctx.riverId[fromRiver]!;
    } else {
      const f = feeders.reduce((a, b) => (state.dugStrength[b]! < state.dugStrength[a]! ? b : a));
      state.dugStrength[i] = Math.min(ctx.config.factoryMill.riverBonusBpByRow.length, state.dugStrength[f]! + 1);
      state.dugRiver[i] = state.dugRiver[f]!;
    }
  }
}

/**
 * Pressure relief for a dam on water hex d, in basis points (DESIGN §8.4b). The water held back above the dam may
 * flow away through other branches: if any way out joins a river or reaches the southern edge, relief is 100%;
 * otherwise it spreads into N dug hexes and relief = 1 − (1 − p)^N, computed by repeated integer multiplication.
 */
export function damReliefBp(state: GameState, ctx: SimContext, d: number): number {
  const upstream = ctx.map.hexes.map((_, i) => i).filter((u) => {
    if (!isWater(state, ctx, u)) return false;
    const down = downstream(state, ctx, u);
    return down !== 'exit' && down.includes(d);
  });
  const seen = new Set<number>();
  const queue: number[] = [];
  for (const u of upstream) {
    const down = downstream(state, ctx, u);
    if (down === 'exit') continue;
    for (const j of down) if (j !== d) queue.push(j);
  }
  if (queue.length === 0) return 0;
  while (queue.length) {
    const j = queue.shift()!;
    if (seen.has(j)) continue;
    seen.add(j);
    if (ctx.isRiver[j]) return 10_000; // joins a river: the water has a way out
    const down = downstream(state, ctx, j);
    if (down === 'exit') return 10_000; // reaches the southern edge
    for (const k of down) queue.push(k);
  }
  let held = 10_000;
  const keep = 100 - ctx.config.dam.reliefPerDugHexPct;
  for (let n = 0; n < seen.size; n++) held = Math.floor((held * keep) / 100);
  return 10_000 - held;
}
