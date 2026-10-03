// Dev tree (DESIGN §10): two paths per type, levels 1–3 bought at a workshop. Bought upgrades wait in a research
// queue (one slot per workshop) and research one at a time; extra workshops shorten research (DESIGN §8.5). The first
// path picked is cheaper; the other costs more. Effects apply to every existing and future item of the type: systems
// read them through `upgradeValue` each time, so nothing has to be patched on purchase.
import { playtestCost, playtestTicks } from './playtest';
import type { SimContext } from './context';
import { structures } from './state';
import { maxHp } from './systems/combat';
import { territoryChanged } from './systems/territory';
import type { GameState } from './types';

export const MAX_LEVEL = 3;

type LevelData = { desc: string; locked?: string } & Record<string, number | string | undefined>;

export function typeIndex(ctx: SimContext, type: string): number {
  return ctx.upgrades.types.findIndex((t) => t.type === type);
}

function pathIndex(ctx: SimContext, typeIdx: number, pathId: string): number {
  return ctx.upgrades.types[typeIdx]?.paths.findIndex((p) => p.id === pathId) ?? -1;
}

/** The level data of a path level (1-based), or undefined. */
export function levelData(ctx: SimContext, typeIdx: number, path: number, level: number): LevelData | undefined {
  return ctx.upgrades.types[typeIdx]?.paths[path]?.levels[level - 1] as LevelData | undefined;
}

/** The level a player has on a path (0 = none). */
export function upgradeLevel(state: GameState, ctx: SimContext, player: number, type: string, pathId: string): number {
  const t = typeIndex(ctx, type);
  const p = pathIndex(ctx, t, pathId);
  return t < 0 || p < 0 ? 0 : (state.players[player]?.upgrades[t]?.levels[p] ?? 0);
}

/** A number from the player's current level of a path (e.g. Dock Capacity → "capacity"), or `fallback` at level 0. */
export function upgradeValue(state: GameState, ctx: SimContext, player: number, type: string, pathId: string, key: string, fallback: number): number {
  const lvl = upgradeLevel(state, ctx, player, type, pathId);
  if (lvl === 0) return fallback;
  const v = levelData(ctx, typeIndex(ctx, type), pathIndex(ctx, typeIndex(ctx, type), pathId), lvl)?.[key];
  return typeof v === 'number' ? v : fallback;
}

/** How many workshops a player owns: one research queue slot each (DESIGN §8.5). */
export function workshopCount(state: GameState, player: number): number {
  return structures(state).filter((s) => s.kind === 'workshop' && s.owner === player).length;
}

export function ownsWorkshop(state: GameState, player: number): boolean {
  return workshopCount(state, player) > 0;
}

/**
 * Research-time reduction from owning several workshops, in basis points: each one after the first adds the same,
 * up to a cap, like extra factory-mills do for crafting (DESIGN §8.5).
 */
export function researchPoolBp(state: GameState, ctx: SimContext, player: number): number {
  const w = ctx.config.workshops;
  return Math.min(w.maxReductionBp, w.extraWorkshopBp * Math.max(0, workshopCount(state, player) - 1));
}

/** Research ticks for a level right now: base time, minus Fast Research, minus workshop pooling. */
function researchTicks(state: GameState, ctx: SimContext, player: number, level: number): number {
  const base = ctx.upgrades.pricing.levels[level - 1]!;
  const faster = upgradeValue(state, ctx, player, 'workshop', 'fastResearch', 'researchTimeReductionPct', 0);
  const pool = researchPoolBp(state, ctx, player);
  return playtestTicks(state, ctx, Math.max(1, Math.ceil((base.timeS * ctx.config.tickRate * (100 - faster) * (10_000 - pool)) / 1_000_000)));
}

/**
 * Price of the next level of a path, counting levels already waiting in the research queue: wood (whole), research
 * ticks (as it would take now) and the level. Discount, Fast Research and workshop pooling applied.
 */
export function upgradePrice(state: GameState, ctx: SimContext, player: number, typeIdx: number, path: number): { cost: number; ticks: number; level: number } | null {
  const p = state.players[player];
  const prog = p?.upgrades[typeIdx];
  if (!p || !prog) return null;
  const queued = p.research.filter((r) => r.type === typeIdx && r.path === path).length;
  const level = prog.levels[path as 0 | 1]! + queued + 1;
  const base = ctx.upgrades.pricing.levels[level - 1];
  if (!base) return null;
  const second = prog.first !== -1 && prog.first !== path;
  const discount = upgradeValue(state, ctx, player, 'workshop', 'discount', 'upgradeCostReductionPct', 0);
  const cost = playtestCost(state, ctx, Math.floor((base.cost * (second ? ctx.upgrades.pricing.secondPathCostMultiplier : 1) * (100 - discount)) / 100));
  return { cost, ticks: researchTicks(state, ctx, player, level), level };
}

/** Why the player can't buy the next level of this path now, or null. */
export function upgradeError(state: GameState, ctx: SimContext, player: number, typeIdx: number, path: number): string | null {
  const p = state.players[player];
  if (!p || !ctx.upgrades.types[typeIdx] || (path !== 0 && path !== 1)) return 'no such upgrade';
  const slots = workshopCount(state, player);
  if (slots === 0) return 'you need a workshop';
  if (p.research.length >= slots) return slots === 1 ? 'one workshop: one upgrade at a time' : `research queue full (${slots} slots)`;
  const price = upgradePrice(state, ctx, player, typeIdx, path);
  if (!price) return 'fully upgraded';
  if (levelData(ctx, typeIdx, path, price.level)?.locked) return 'locked';
  if (p.wood < price.cost * 1000) return 'not enough wood';
  return null;
}

/** Pays and queues the research (the command handler calls this after checking `upgradeError`). */
export function startResearch(state: GameState, ctx: SimContext, player: number, typeIdx: number, path: number): void {
  const p = state.players[player]!;
  const price = upgradePrice(state, ctx, player, typeIdx, path)!;
  p.wood -= price.cost * 1000;
  const prog = p.upgrades[typeIdx]!;
  if (prog.first === -1) prog.first = path; // the first path picked stays the cheap one
  p.research.push({ type: typeIdx, path, level: price.level, totalTicks: 0, doneTicks: 0 });
}

/**
 * The first upgrade in each player's queue researches while they own a workshop. Its time is fixed when it starts
 * (so new workshops speed up research still waiting). When done, the level applies.
 */
export function researchSystem(state: GameState, ctx: SimContext): void {
  for (const p of state.players) {
    const r = p.research[0];
    if (!r || !ownsWorkshop(state, p.id)) continue;
    if (r.totalTicks === 0) r.totalTicks = researchTicks(state, ctx, p.id, r.level);
    if (++r.doneTicks < r.totalTicks) continue;
    // Improved Frames: the extra max HP is added as healing, so damage taken stays the same (DESIGN §10.1).
    const own = structures(state).filter((s) => s.owner === p.id);
    const before = own.map((s) => maxHp(state, ctx, s));
    p.upgrades[r.type]!.levels[r.path as 0 | 1] = r.level;
    own.forEach((s, k) => (s.hp += maxHp(state, ctx, s) - before[k]!));
    p.research.shift();
    if (ctx.upgrades.types[r.type]!.type === 'outpost') territoryChanged(state, ctx); // Reach
  }
}
