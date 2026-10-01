// Excavators and stone cutters (DESIGN §8.4c, §8.4d).
// - An excavator digs its hex for a while, then is used up; the hex is dug for good and fills with water if water can
//   flow into it.
// - Stone cutters on a rock add up their work; when the rock is done it's gone (land), the owner of the cutter that
//   has been on it longest (lowest id) gets 1 stone, and every cutter on it is used up.
import { type SimContext, idx } from '../context';
import { removeEntity, structures } from '../state';
import type { GameState, StoneCutter } from '../types';
import { recomputeDugWater } from '../water';

export function diggingSystem(state: GameState, ctx: SimContext): void {
  const digTicks = Math.round(ctx.config.excavator.digS * ctx.config.tickRate);
  let dugSomething = false;
  for (const s of structures(state)) {
    if (s.kind !== 'excavator') continue;
    s.workTicks = (s.workTicks ?? 0) + 1;
    if (s.workTicks < digTicks) continue;
    state.dug[idx(ctx, s)!] = true;
    removeEntity(state, s.id);
    dugSomething = true;
  }
  if (dugSomething) recomputeDugWater(state, ctx);
}

export function stoneCuttingSystem(state: GameState, ctx: SimContext): void {
  const rockTicks = Math.round(ctx.config.stoneCutter.secondsPerRock * ctx.config.tickRate);
  const cutters = state.entities.filter((e): e is StoneCutter => e.type === 'cutter');
  // Group by rock, in id order (the first cutter on a rock is the one placed first).
  const byRock = new Map<number, StoneCutter[]>();
  for (const c of cutters) {
    const i = idx(ctx, c)!;
    byRock.set(i, [...(byRock.get(i) ?? []), c]);
  }
  for (const i of [...byRock.keys()].sort((a, b) => a - b)) {
    const here = byRock.get(i)!;
    state.rockWork[i]! += here.length;
    if (state.rockWork[i]! < rockTicks) continue;
    state.rockGone[i] = true;
    state.players[here[0]!.owner]!.stone += 1;
    for (const c of here) removeEntity(state, c.id);
  }
}
