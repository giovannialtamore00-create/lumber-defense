// Playtest mode (DESIGN §7.5): a switch for the whole match that makes crafting and upgrades cheaper and faster, so
// a playtest reaches the interesting parts sooner. Percentages from config.
import type { SimContext } from './context';
import type { GameState } from './types';

/** Scales a wood cost (any unit) by the playtest discount when the mode is on. */
export function playtestCost(state: GameState, ctx: SimContext, cost: number): number {
  return state.playtest ? Math.floor((cost * ctx.config.playtestMode.costPct) / 100) : cost;
}

/** Scales a waiting time in ticks by the playtest factor when the mode is on (at least 1 tick). */
export function playtestTicks(state: GameState, ctx: SimContext, ticks: number): number {
  return state.playtest ? Math.max(1, Math.ceil((ticks * ctx.config.playtestMode.timePct) / 100)) : ticks;
}
