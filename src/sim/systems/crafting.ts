// Crafting (DESIGN §6.7, §7.2): pay on confirm, queue limited to one slot per factory-mill, items crafted one at a
// time, craft time reduced by the player's factory-mills and the rivers they stand on. Integer math only.
import { type SimContext, idx } from '../context';
import { structures } from '../state';
import type { GameState, ItemKind, Structure } from '../types';

export const CRAFTABLE: readonly ItemKind[] = ['outpost', 'factory', 'dock', 'carrier', 'woodchopper', 'bridge', 'workshop', 'catapult'];

export interface Watermill {
  river: number;
  /** Strongest river row this factory-mill touches on that river (1–8). */
  row: number;
  bonusBp: number;
}

/** One watermill per distinct river the factory-mill touches, at that river's strongest touching row (DESIGN §6.7). */
export function watermills(ctx: SimContext, factory: Structure): Watermill[] {
  const best = new Map<number, number>();
  for (const n of ctx.neighbourIdx[idx(ctx, factory)!]!) {
    if (!ctx.isRiver[n]) continue;
    const river = ctx.riverId[n]!;
    best.set(river, Math.max(best.get(river) ?? 0, ctx.riverRow[n]!));
  }
  // Sorted by river id so the order never depends on Map insertion.
  return [...best.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([river, row]) => ({ river, row, bonusBp: ctx.config.factoryMill.riverBonusBpByRow[row - 1] ?? 0 }));
}

export function ownFactories(state: GameState, player: number): Structure[] {
  return structures(state).filter((s) => s.kind === 'factory' && s.owner === player);
}

/**
 * Raw bonus = extra per factory-mill after the first + every watermill's river bonus. The craft-time reduction is
 * linear in the raw bonus and reaches its maximum at the max setup, then stays there.
 */
export function craftReductionBp(state: GameState, ctx: SimContext, player: number): number {
  const fm = ctx.config.factoryMill;
  const factories = ownFactories(state, player);
  if (factories.length === 0) return 0;
  let raw = fm.extraFactoryBp * (factories.length - 1);
  for (const f of factories) for (const w of watermills(ctx, f)) raw += w.bonusBp;
  return Math.min(fm.maxReductionBp, Math.floor((raw * fm.maxReductionBp) / ctx.fullBoostRawBp));
}

/** Ticks to craft `item` right now: base time × (1 − reduction), at least 1 tick. */
export function craftTicks(state: GameState, ctx: SimContext, player: number, item: ItemKind): number {
  const base = ctx.config.items[item].craftTimeS * ctx.config.tickRate;
  return Math.max(1, Math.ceil((base * (10_000 - craftReductionBp(state, ctx, player))) / 10_000));
}

export function craftCost(ctx: SimContext, item: ItemKind): number {
  return ctx.config.items[item].cost * 1000;
}

/** Why the player can't craft `item` now, or null. */
export function craftError(state: GameState, ctx: SimContext, player: number, item: ItemKind): string | null {
  const p = state.players[player];
  if (!p) return 'no such player';
  if (!CRAFTABLE.includes(item)) return 'not craftable';
  if (!p.started) return 'place your first outpost first';
  const slots = ownFactories(state, player).length;
  if (slots === 0) return 'you need a factory-mill';
  if (p.queue.length >= slots) return slots === 1 ? 'one factory-mill crafts one item at a time' : `queue full (${slots} factory-mills = ${slots} slots)`;
  if (p.wood < craftCost(ctx, item)) return 'not enough wood';
  return null;
}

/** Advances the first item in each player's queue; a finished item goes into the hand. */
export function craftingSystem(state: GameState, ctx: SimContext): void {
  for (const p of state.players) {
    const job = p.queue[0];
    if (!job || ownFactories(state, p.id).length === 0) continue;
    if (job.totalTicks === 0) job.totalTicks = craftTicks(state, ctx, p.id, job.item);
    job.doneTicks++;
    if (job.doneTicks >= job.totalTicks) {
      p.queue.shift();
      p.hand.push(job.item);
    }
  }
}
