// Passive income (DESIGN §6.6b): every player gets a fixed amount of wood at a fixed interval while the game runs.
import type { SimContext } from '../context';
import { toMilli } from '../fixed';
import type { GameState } from '../types';

export function incomeSystem(state: GameState, ctx: SimContext): void {
  const { wood, everyS } = ctx.config.passiveIncome;
  const period = Math.max(1, Math.round(everyS * ctx.config.tickRate));
  if (state.tick % period !== 0) return;
  for (const p of state.players) p.wood += toMilli(wood);
}
