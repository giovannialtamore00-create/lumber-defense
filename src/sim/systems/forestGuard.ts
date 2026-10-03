// Forest guards and baby forests (DESIGN §8.7).
// A guard patrols its home hex and the hexes within range. It always heads for the job that needs it most: an empty
// hex that used to be forest (plant a baby forest there) or the baby forest with the least growth time left. Arriving
// on it, it plants or refreshes the growth time and attends it for a while, then picks the next job. It walks one
// hex at a time; between two hexes of its area it goes straight if they touch, or through its home hex.
// A baby forest grows only while it has growth time; once grown, it's a full forest again.
import { type SimContext, idx } from '../context';
import { toMilli } from '../fixed';
import { distance, hexesInRadius } from '../hex';
import { structureAt } from '../state';
import type { ForestGuard, GameState } from '../types';
import { upgradeValue } from '../upgrades';

const ticks = (ctx: SimContext, seconds: number) => Math.round(seconds * ctx.config.tickRate);

/** An empty hex that used to be forest, where a baby forest can be planted (nothing but a woodchopper on it). */
export function isPlantable(state: GameState, ctx: SimContext, i: number): boolean {
  const h = ctx.map.hexes[i]!;
  if ((h.terrain !== 'forest' && !state.grownForest[i]) || state.forestPool[i]! > 0 || state.saplingGrowth[i]! >= 0) return false;
  const s = structureAt(state, h.q, h.r);
  return !s || s.kind === 'woodchopper';
}

/** Afforest (DESIGN §10.3): empty land this guard may still turn into new forest. */
function isAfforestable(state: GameState, ctx: SimContext, g: ForestGuard, i: number): boolean {
  const h = ctx.map.hexes[i]!;
  if (h.terrain !== 'land' || state.grownForest[i] || state.forestPool[i]! > 0 || state.saplingGrowth[i]! >= 0) return false;
  if (structureAt(state, h.q, h.r) || state.debris[i]! > 0) return false;
  // Conflict zones only with Afforest's last level (DESIGN §10.3).
  const c = state.coverage[i]!;
  if ((c & (c - 1)) !== 0 && upgradeValue(state, ctx, g.owner, 'forestGuard', 'afforest', 'inConflict', 0) === 0) return false;
  return g.afforested < upgradeValue(state, ctx, g.owner, 'forestGuard', 'afforest', 'newForests', 0);
}

/** The hexes a guard looks after, in a fixed order. */
function patrolArea(ctx: SimContext, g: ForestGuard): number[] {
  return hexesInRadius({ q: g.homeQ, r: g.homeR }, ctx.config.forestGuard.range)
    .map((h) => idx(ctx, h))
    .filter((i): i is number => i !== undefined);
}

/** The job that needs the guard most: planting first, then the baby forest with the least growth time left. */
function nextJob(state: GameState, ctx: SimContext, g: ForestGuard): number | null {
  let best: { i: number; need: number; dist: number } | null = null;
  for (const i of patrolArea(ctx, g)) {
    const need = isPlantable(state, ctx, i) || isAfforestable(state, ctx, g, i) ? -1 : state.saplingGrowth[i]! >= 0 ? state.saplingCredit[i]! : null;
    if (need === null) continue;
    const dist = distance(ctx.map.hexes[i]!, g);
    if (!best || need < best.need || (need === best.need && dist < best.dist)) best = { i, need, dist };
  }
  return best?.i ?? null;
}

export function forestGuardSystem(state: GameState, ctx: SimContext): void {
  const fg = ctx.config.forestGuard;
  const stepTicks = ticks(ctx, fg.secondsPerHex);
  for (const g of state.entities) {
    if (g.type !== 'guard') continue;
    if (g.attendTicks > 0) {
      g.attendTicks--;
      continue;
    }
    if (g.toQ !== null && g.toR !== null) {
      if (++g.moveTicks < stepTicks) continue;
      g.q = g.toQ;
      g.r = g.toR;
      g.toQ = g.toR = null;
      g.moveTicks = 0;
    }
    const job = nextJob(state, ctx, g);
    if (job === null) continue; // nothing to do: stays put
    const target = ctx.map.hexes[job]!;
    if (target.q === g.q && target.r === g.r) {
      // Plant, or refresh the growth time, then attend.
      if (state.saplingGrowth[job]! < 0) {
        if (!isPlantable(state, ctx, job)) {
          g.afforested++; // a new forest on empty land
          state.grownForest[job] = true;
        }
        state.saplingGrowth[job] = 0;
      }
      // Growth upgrade: more growth per visit.
      const refresh = upgradeValue(state, ctx, g.owner, 'forestGuard', 'growth', 'refreshGrowthS', fg.refreshGrowthS);
      state.saplingCredit[job] = Math.max(state.saplingCredit[job]!, ticks(ctx, refresh));
      g.attendTicks = ticks(ctx, fg.attendS) - 1; // this tick counts
      continue;
    }
    // One hex towards the job: straight there if it touches, else via home.
    const next = distance(target, g) === 1 ? target : { q: g.homeQ, r: g.homeR };
    g.toQ = next.q;
    g.toR = next.r;
    g.moveTicks = 1; // this tick counts
  }
}

/** Baby forests with growth time grow; a fully grown one becomes a full forest again. */
export function saplingSystem(state: GameState, ctx: SimContext): void {
  const full = ticks(ctx, ctx.config.forestGuard.growS);
  for (let i = 0; i < state.saplingGrowth.length; i++) {
    if (state.saplingGrowth[i]! < 0 || state.saplingCredit[i]! <= 0) continue;
    state.saplingCredit[i]!--;
    if (++state.saplingGrowth[i]! >= full) {
      state.saplingGrowth[i] = -1;
      state.saplingCredit[i] = 0;
      state.forestPool[i] = toMilli(ctx.map.hexes[i]!.woodPool ?? ctx.config.forest.woodPool);
    }
  }
}
