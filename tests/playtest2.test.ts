// Playtest round 2 (DESIGN §6.6, §8.4b–d, §8.5).
import { describe, expect, it } from 'vitest';
import baseConfig from '../src/data/config.json';
import { idx } from '../src/sim/context';
import type { Hex } from '../src/sim/hex';
import { placementError } from '../src/sim/systems/placement';
import { spawnPile } from '../src/sim/systems/river';
import { step } from '../src/sim/tick';
import type { Config, GameState, Pile } from '../src/sim/types';
import { researchPoolBp, typeIndex, upgradeError, upgradePrice } from '../src/sim/upgrades';
import { damReliefBp, downstream, flowStrength, isWater, recomputeDugWater } from '../src/sim/water';
import { cell, put, setup, stackOf } from './helpers';

const config = baseConfig as Config;
const TPS = config.tickRate;
const run = (state: GameState, ctx: Parameters<typeof step>[1], ticks: number) => {
  for (let t = 0; t < ticks; t++) step(state, ctx, []);
};
const piles = (state: GameState) => state.entities.filter((e): e is Pile => e.type === 'pile');
// Axial neighbours below a hex (water flows only down).
const sw = (h: Hex): Hex => ({ q: h.q - 1, r: h.r + 1 });
const se = (h: Hex): Hex => ({ q: h.q, r: h.r + 1 });

// A river bending south-west, so a ditch dug on its east side leads nowhere (a dead end).
const DIAG = ['. . . ~ . . .', '. . ~ . . . .', '. . ~ . . . .', '. ~ . . . . .', '. ~ . . . . .', '~ . . . . . .'];
const TOP = { q: 3, r: 0 }; // the river's first hex
const DAMMED = { q: 2, r: 1 }; // the river's next hex (south-west of TOP)
const B = { q: 3, r: 1 }; // the other hex below TOP (south-east): land, where a ditch would branch off

// A straight river down column 2 (6 rows), land around it.
const RIVER6 = Array.from({ length: 6 }, () => '. . ~ . . . .');

function dig(state: GameState, ctx: Parameters<typeof step>[1], hexes: Hex[]) {
  for (const h of hexes) state.dug[idx(ctx, h)!] = true;
  recomputeDugWater(state, ctx);
}

describe('dock catch (§6.6): max(1, half rounded down)', () => {
  it.each([
    [1, 1],
    [2, 1],
    [3, 1],
    [10, 5],
  ])('a pile of %i gives %i', (pile, caught) => {
    const { ctx, state } = setup(RIVER6);
    put(state, ctx, 'dock', 0, cell(3, 1));
    spawnPile(state, ctx, cell(2, 1).q, 1, pile * 1000);
    expect(stackOf(state, ctx, cell(3, 1))).toBe(caught);
  });
});

describe('excavator and dug water (§8.4c)', () => {
  it('digs empty land in 3 minutes, then is used up; a dry ditch blocks building', () => {
    const { ctx, state } = setup(RIVER6);
    put(state, ctx, 'outpost', 0, cell(4, 2));
    expect(placementError(state, ctx, 0, 'excavator', cell(2, 2).q, 2)).toBe('water');
    const target = cell(5, 4); // land, not touching water from above
    expect(placementError(state, ctx, 0, 'excavator', target.q, target.r)).toBeNull();
    state.players[0]!.hand.push('excavator');
    step(state, ctx, [{ type: 'place', player: 0, item: 'excavator', q: target.q, r: target.r }]);
    run(state, ctx, config.excavator.digS * TPS - 2);
    expect(state.dug[idx(ctx, target)!]).toBe(false);
    run(state, ctx, 2);
    expect(state.dug[idx(ctx, target)!]).toBe(true);
    expect(state.entities.some((e) => e.type === 'structure' && e.kind === 'excavator')).toBe(false);
    expect(isWater(state, ctx, idx(ctx, target)!)).toBe(false); // dry: nothing above it is water
    expect(placementError(state, ctx, 0, 'workshop', target.q, target.r)).toBe('dry ditch: waiting for water');
  });

  it('a dug hex below a river fills, forks the river, and gets strength 0, then +1 further down', () => {
    const { ctx, state } = setup(DIAG);
    dig(state, ctx, [B, se(B)]);
    expect(isWater(state, ctx, idx(ctx, B)!)).toBe(true);
    expect(isWater(state, ctx, idx(ctx, se(B))!)).toBe(true);
    expect(flowStrength(state, ctx, idx(ctx, B)!)).toBe(0);
    expect(flowStrength(state, ctx, idx(ctx, se(B))!)).toBe(1);
    const down = downstream(state, ctx, idx(ctx, TOP)!);
    expect(down !== 'exit' && down.includes(idx(ctx, B)!)).toBe(true); // the river now forks
  });

  it('wood that floats into a dead-end dug channel gets stuck there', () => {
    const { ctx, state } = setup(DIAG);
    dig(state, ctx, [B]);
    // Send piles until one goes the dug way (50/50 fork), then let it sit.
    let stuck: Pile | undefined;
    for (let k = 0; k < 40 && !stuck; k++) {
      spawnPile(state, ctx, TOP.q, TOP.r, 1000);
      run(state, ctx, 30);
      stuck = piles(state).find((p) => p.q === B.q && p.r === B.r);
    }
    expect(stuck).toBeDefined();
    run(state, ctx, 50);
    expect(piles(state).some((p) => p.id === stuck!.id && p.q === B.q && p.r === B.r)).toBe(true);
  });
});

describe('dam pressure relief (§8.4b)', () => {
  /** A dam on the river right below TOP, with dug hexes on the other side (B, then `more` further down). */
  function damWith(dug: Hex[]) {
    const { ctx, state } = setup(DIAG);
    dig(state, ctx, dug);
    const dam = put(state, ctx, 'dam', 0, DAMMED);
    dam.hp = config.items.dam.hp;
    return { state, ctx, d: idx(ctx, DAMMED)!, dam };
  }

  it('no way out: no relief', () => {
    const { state, ctx, d } = damWith([]);
    expect(damReliefBp(state, ctx, d)).toBe(0);
  });

  it('a dead end of 1 dug hex = 10%, 2 = 19%', () => {
    const one = damWith([B]);
    expect(damReliefBp(one.state, one.ctx, one.d)).toBe(1000);
    const two = damWith([B, se(B)]);
    expect(damReliefBp(two.state, two.ctx, two.d)).toBe(1900);
  });

  it('less pressure with relief: HP loss = strength × time × (1 − relief)', () => {
    const plain = damWith([]);
    const relieved = damWith([B, se(B)]);
    run(plain.state, plain.ctx, 100 * TPS);
    run(relieved.state, relieved.ctx, 100 * TPS);
    const lostPlain = config.items.dam.hp - plain.dam.hp;
    const lostRelieved = config.items.dam.hp - relieved.dam.hp;
    expect(lostRelieved).toBeCloseTo(lostPlain * 0.81, -1);
  });

  it('reaching the southern edge = 100%: the dam holds forever', () => {
    const path: Hex[] = [B];
    while (path[path.length - 1]!.r < 5) path.push(se(path[path.length - 1]!));
    const edge = damWith(path);
    expect(damReliefBp(edge.state, edge.ctx, edge.d)).toBe(10_000);
    run(edge.state, edge.ctx, 100 * TPS);
    expect(edge.dam.hp).toBe(config.items.dam.hp);
  });
});

describe('stone cutter (§8.4d)', () => {
  const ROCKY = ['. # . ~ .', '. . . ~ .', '. . . ~ .'];

  it('goes on a rock; one cutter breaks it in 5 minutes for 1 stone, then it is used up', () => {
    const { ctx, state } = setup(ROCKY);
    put(state, ctx, 'outpost', 0, cell(1, 1));
    expect(placementError(state, ctx, 0, 'stoneCutter', cell(0, 0).q, 0)).toBe('stone cutters go on a rock');
    state.players[0]!.hand.push('stoneCutter');
    step(state, ctx, [{ type: 'placeCutter', player: 0, q: cell(1, 0).q, r: 0 }]);
    run(state, ctx, config.stoneCutter.secondsPerRock * TPS);
    expect(state.players[0]!.stone).toBe(1);
    expect(state.rockGone[idx(ctx, cell(1, 0))!]).toBe(true);
    expect(state.entities.some((e) => e.type === 'cutter')).toBe(false);
    expect(placementError(state, ctx, 0, 'workshop', cell(1, 0).q, 0)).toBeNull(); // land now
  });

  it('two cutters on the same rock take half the time', () => {
    const { ctx, state } = setup(ROCKY);
    put(state, ctx, 'outpost', 0, cell(1, 1));
    state.players[0]!.hand.push('stoneCutter', 'stoneCutter');
    step(state, ctx, [
      { type: 'placeCutter', player: 0, q: cell(1, 0).q, r: 0 },
      { type: 'placeCutter', player: 0, q: cell(1, 0).q, r: 0 },
    ]);
    run(state, ctx, (config.stoneCutter.secondsPerRock * TPS) / 2);
    expect(state.players[0]!.stone).toBe(1);
  });
});

describe('workshops pool and queue (§8.5)', () => {
  it('one queue slot per workshop; each extra workshop cuts research time by 6%', () => {
    const { ctx, state } = setup(RIVER6);
    put(state, ctx, 'outpost', 0, cell(4, 2));
    put(state, ctx, 'workshop', 0, cell(4, 1));
    state.players[0]!.wood = 10_000_000;
    const dock = typeIndex(ctx, 'dock');
    step(state, ctx, [{ type: 'buyUpgrade', player: 0, upgradeType: dock, path: 0 }]);
    expect(upgradeError(state, ctx, 0, dock, 1)).toBe('one workshop: one upgrade at a time');

    put(state, ctx, 'workshop', 0, cell(5, 3));
    expect(researchPoolBp(state, ctx, 0)).toBe(600);
    step(state, ctx, [{ type: 'buyUpgrade', player: 0, upgradeType: dock, path: 0 }]); // L2 queued behind L1
    expect(state.players[0]!.research.map((r) => r.level)).toEqual([1, 2]);
    expect(upgradePrice(state, ctx, 0, dock, 0)!.level).toBe(3);
    expect(upgradeError(state, ctx, 0, dock, 0)).toBe('research queue full (2 slots)');
  });
});
