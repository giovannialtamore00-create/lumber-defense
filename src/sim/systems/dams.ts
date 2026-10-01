// Dam wear (DESIGN §8.4b): once a second, river pressure takes HP from every dam:
//   HP loss = flow strength × pressure × (1 − relief)
// Relief comes from water that can flow away through other branches or dug hexes (see water.ts). Fractions of HP
// carry over to the next second. A dam at 0 HP breaks and the wood behind it floats on.
import { type SimContext, idx } from '../context';
import { removeEntity, structures } from '../state';
import type { GameState } from '../types';
import { damReliefBp, flowStrength } from '../water';

export function damsSystem(state: GameState, ctx: SimContext): void {
  if (state.tick % ctx.config.tickRate !== 0) return;
  for (const s of structures(state)) {
    if (s.kind !== 'dam') continue;
    const i = idx(ctx, s)!;
    const full = flowStrength(state, ctx, i) * ctx.config.dam.pressureHpPerRowPerS * 1000; // milli-HP
    s.damageAcc = (s.damageAcc ?? 0) + Math.floor((full * (10_000 - damReliefBp(state, ctx, i))) / 10_000);
    const whole = Math.floor(s.damageAcc / 1000);
    s.damageAcc -= whole * 1000;
    s.hp -= whole;
    if (s.hp <= 0) removeEntity(state, s.id);
  }
}
