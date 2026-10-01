// Woodchoppers cut their forest hex into a log stack on the same hex (DESIGN §6.2). A pool at 0 means the forest is
// gone from that hex; the woodchopper then moves to the adjacent free forest hex (in its owner's territory) with the
// most wood left, or waits until one is free.
import { type SimContext, idx } from '../context';
import { MILLI, perTick } from '../fixed';
import { hexesInRadius } from '../hex';
import { structureAt, structures } from '../state';
import { upgradeValue } from '../upgrades';
import { isWater } from '../water';
import { spawnPile } from './river';
import type { GameState, Structure } from '../types';
import { isCoveredBy } from './territory';

export function forestSystem(state: GameState, ctx: SimContext): void {
  for (const s of structures(state)) {
    if (s.kind !== 'woodchopper') continue;
    const i = idx(ctx, s)!;
    // Output upgrade raises the cutting rate (DESIGN §10.3).
    const rate = perTick(upgradeValue(state, ctx, s.owner, 'woodchopper', 'output', 'woodPerS', ctx.config.woodchopper.woodPerSecond), ctx.config.tickRate);
    const cut = Math.min(rate, state.forestPool[i]!);
    state.forestPool[i]! -= cut;
    state.stacks[i]! += cut;
    logSlide(state, ctx, s, i);
    if (state.forestPool[i] === 0) relocate(state, ctx, s, i);
  }
}

/**
 * Log Slide (DESIGN §10.3): a woodchopper with a river close enough slides wood from its stack into the river, one
 * whole wood at a time, at the upgrade's rate.
 */
function logSlide(state: GameState, ctx: SimContext, s: Structure, i: number): void {
  const rate = perTick(upgradeValue(state, ctx, s.owner, 'woodchopper', 'logSlide', 'slidePerS', 0), ctx.config.tickRate);
  if (rate === 0) return;
  const range = upgradeValue(state, ctx, s.owner, 'woodchopper', 'logSlide', 'riverRange', 1);
  const river = hexesInRadius(s, range)
    .map((h) => idx(ctx, h))
    .find((j): j is number => j !== undefined && isWater(state, ctx, j));
  if (river === undefined) return;
  s.slideAcc = Math.min(MILLI, (s.slideAcc ?? 0) + rate);
  if (s.slideAcc < MILLI || state.stacks[i]! < MILLI) return;
  s.slideAcc -= MILLI;
  state.stacks[i]! -= MILLI;
  const h = ctx.map.hexes[river]!;
  spawnPile(state, ctx, h.q, h.r, MILLI);
}

/** Moves a woodchopper off its spent forest hex, if an adjacent one is free (DESIGN §6.2). */
function relocate(state: GameState, ctx: SimContext, s: Structure, i: number): void {
  let best = -1;
  for (const n of ctx.neighbourIdx[i]!) {
    const h = ctx.map.hexes[n]!;
    if (state.forestPool[n]! <= 0 || structureAt(state, h.q, h.r) || !isCoveredBy(state, n, s.owner)) continue;
    if (best < 0 || state.forestPool[n]! > state.forestPool[best]!) best = n; // ties: first in fixed neighbour order
  }
  if (best < 0) return; // none free: wait here
  const h = ctx.map.hexes[best]!;
  s.q = h.q;
  s.r = h.r;
}
