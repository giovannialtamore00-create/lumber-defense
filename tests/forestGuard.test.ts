// Forest guard (DESIGN §8.7).
import { describe, expect, it } from 'vitest';
import baseConfig from '../src/data/config.json';
import { idx } from '../src/sim/context';
import { placementError } from '../src/sim/systems/placement';
import { step } from '../src/sim/tick';
import type { Config, GameState } from '../src/sim/types';
import { cell, put, setup } from './helpers';

const config = baseConfig as Config;
const TPS = config.tickRate;
const FULL = config.forest.woodPool * 1000;

// Forest hexes around a clearing; the river keeps the map valid.
const MAP = ['T T T . ~', 'T . T . ~', 'T T T . ~'];

function withGuardAt(home: { q: number; r: number }, spent: { q: number; r: number }[]) {
  const s = setup(MAP);
  put(s.state, s.ctx, 'outpost', 0, cell(1, 1));
  for (const h of spent) s.state.forestPool[idx(s.ctx, h)!] = 0;
  s.state.players[0]!.hand.push('forestGuard');
  step(s.state, s.ctx, [{ type: 'placeGuard', player: 0, q: home.q, r: home.r }]);
  return s;
}

/** Seconds until every hex in `hexes` is a full forest again (or null if not within `maxS`). */
function regrowTime(state: GameState, ctx: Parameters<typeof step>[1], hexes: { q: number; r: number }[], maxS = 600): number | null {
  for (let t = 1; t <= maxS * TPS; t++) {
    step(state, ctx, []);
    if (hexes.every((h) => state.forestPool[idx(ctx, h)!] === FULL)) return t / TPS;
  }
  return null;
}

describe('forest guard (§8.7)', () => {
  it('one spent forest under the guard regrows in 60 s', () => {
    const spent = [cell(0, 0)];
    const { state, ctx } = withGuardAt(cell(0, 0), spent);
    // Planted on the tick the guard is placed; the clock here starts one tick later.
    const t = regrowTime(state, ctx, spent)! + 1 / TPS;
    expect(t).toBeCloseTo(60, 5);
  });

  it('two neighbouring spent forests take about 90 s (he goes back and forth)', () => {
    const spent = [cell(0, 0), cell(1, 0)];
    const { state, ctx } = withGuardAt(cell(0, 0), spent);
    const t = regrowTime(state, ctx, spent)!;
    expect(t).toBeGreaterThanOrEqual(85);
    expect(t).toBeLessThanOrEqual(95);
  });

  it('three take longer still (about 45 s each)', () => {
    const home = cell(1, 1);
    const spent = [cell(1, 0), cell(2, 0), cell(2, 1)]; // a chain around home, each touching the next
    const { state, ctx } = withGuardAt(home, spent);
    const t = regrowTime(state, ctx, spent)!;
    expect(t).toBeGreaterThanOrEqual(125);
    expect(t).toBeLessThanOrEqual(160); // a bit over 3 × 45 s: two of them don't touch, so he walks via home
  });

  it('only plants where a forest used to be, and only within range', () => {
    // Home (1,1): (1,0) is a neighbour; (0,0) is 2 hexes away (odd rows are shifted), so out of range.
    const { state, ctx } = withGuardAt(cell(1, 1), [cell(1, 0), cell(0, 0)]);
    for (let t = 0; t < 30 * TPS; t++) step(state, ctx, []);
    expect(state.saplingGrowth[idx(ctx, cell(1, 0))!]).toBeGreaterThanOrEqual(0); // in range: planted
    expect(state.saplingGrowth[idx(ctx, cell(0, 0))!]).toBe(-1); // out of range: not planted
    expect(state.saplingGrowth[idx(ctx, cell(1, 1))!]).toBe(-1); // plain land: never planted
  });

  it('a baby forest blocks building until it has grown', () => {
    const { state, ctx } = withGuardAt(cell(0, 0), [cell(0, 0)]);
    step(state, ctx, []);
    expect(state.saplingGrowth[idx(ctx, cell(0, 0))!]).toBeGreaterThanOrEqual(0);
    expect(placementError(state, ctx, 0, 'workshop', cell(0, 0).q, 0)).toBe('young forest growing');
    expect(placementError(state, ctx, 0, 'woodchopper', cell(0, 0).q, 0)).toBe('young forest growing');
  });

  it('is placed on land in your territory, like a unit (not on water)', () => {
    const { state, ctx } = withGuardAt(cell(0, 0), []);
    expect(placementError(state, ctx, 0, 'forestGuard', cell(4, 1).q, 1)).toBe('water');
    expect(placementError(state, ctx, 0, 'forestGuard', cell(0, 0).q, 0)).toBeNull(); // on a forest is fine
    expect(state.entities.filter((e) => e.type === 'guard')).toHaveLength(1);
  });
});
