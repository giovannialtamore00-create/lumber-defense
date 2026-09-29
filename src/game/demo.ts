// Dev-only demo (`?demo`, optionally `&ff=<ticks>`): plays the start of a match for the local player so the economy
// loop can be seen (and screenshotted) without clicking. Uses the same commands a player would send.
import { dropOffs, placementError } from '../sim/systems/placement';
import type { Command } from '../sim/types';
import type { SimRunner } from './simRunner';

export function demoCommands(runner: SimRunner, player: number): Command[] {
  const { state, ctx } = runner;
  const p = state.players[player]!;
  const legal = (item: 'outpost' | 'factory' | 'dock') => ctx.map.hexes.find((h) => placementError(state, ctx, player, item, h.q, h.r) === null);
  if (!p.started) {
    const h = legal('outpost');
    return h ? [{ type: 'placeOutpost', player, q: h.q, r: h.r }] : [];
  }
  const item = p.hand[0];
  if (item === 'factory' || item === 'dock') {
    const h = legal(item);
    return h ? [{ type: 'place', player, item, q: h.q, r: h.r }] : [];
  }
  if (item === 'carrier') {
    const chopper = state.entities.find((e) => e.type === 'structure' && e.kind === 'woodchopper' && e.owner === player);
    if (chopper?.type !== 'structure') return [];
    const b = dropOffs(state, ctx, player, chopper.q, chopper.r).find((d) => d.riverQ !== null);
    return b ? [{ type: 'placeCarrier', player, aQ: chopper.q, bQ: b.q, r: chopper.r }] : [];
  }
  if (state.tick === 5) {
    return [
      { type: 'devGive', player, item: 'carrier' },
      { type: 'devGive', player, item: 'dock' },
    ];
  }
  return [];
}

/** Runs the demo for `ticks` ticks straight away (fast-forward). */
export function fastForwardDemo(runner: SimRunner, player: number, ticks: number): void {
  const tickMs = 1000 / runner.ctx.config.tickRate;
  for (let t = 0; t < ticks; t++) {
    for (const c of demoCommands(runner, player)) runner.submit(c);
    runner.update(tickMs);
  }
}
