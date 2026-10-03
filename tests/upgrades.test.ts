// Dev tree (DESIGN §10).
import { describe, expect, it } from 'vitest';
import upgrades from '../src/data/upgrades.json';
import { idx } from '../src/sim/context';
import { craftCost, craftTicks } from '../src/sim/systems/crafting';
import { dockCapacity } from '../src/sim/systems/docks';
import { carrierRoute, dropOffs, isWorkingBridge } from '../src/sim/systems/placement';
import { spawnPile } from '../src/sim/systems/river';
import { step } from '../src/sim/tick';
import type { GameState } from '../src/sim/types';
import { typeIndex, upgradeError, upgradeLevel, upgradePrice } from '../src/sim/upgrades';
import { cell, put, setup, stackOf } from './helpers';

const RIVER = ['T . . ~ . .', '. . . ~ . .', '. . . ~ . .', '. . . ~ . .'];
const run = (state: GameState, ctx: Parameters<typeof step>[1], ticks: number) => {
  for (let t = 0; t < ticks; t++) step(state, ctx, []);
};

function world(rows = RIVER, players = 1) {
  const s = setup(rows, undefined, players);
  put(s.state, s.ctx, 'outpost', 0, cell(1, 1));
  put(s.state, s.ctx, 'workshop', 0, cell(1, 2));
  s.state.players[0]!.wood = 10_000_000;
  return s;
}

/** Buys and finishes researching the next level of `type`/`path`. */
function research(state: GameState, ctx: Parameters<typeof step>[1], type: string, path: number) {
  const t = typeIndex(ctx, type);
  step(state, ctx, [{ type: 'buyUpgrade', player: 0, upgradeType: t, path }]);
  run(state, ctx, state.players[0]!.research[0]?.totalTicks ?? 0);
}

describe('buying upgrades (§10.1–10.2)', () => {
  it('needs a workshop, researches one at a time, and takes the listed time', () => {
    const { ctx, state } = setup(RIVER);
    const dock = typeIndex(ctx, 'dock');
    expect(upgradeError(state, ctx, 0, dock, 0)).toBe('you need a workshop');

    const w = world();
    step(w.state, w.ctx, [{ type: 'buyUpgrade', player: 0, upgradeType: dock, path: 0 }]);
    expect(w.state.players[0]!.research[0]).toMatchObject({ type: dock, path: 0, level: 1, totalTicks: 200 });
    expect(upgradeError(w.state, w.ctx, 0, dock, 1)).toBe('one workshop: one upgrade at a time');
    run(w.state, w.ctx, 198); // the purchase tick already counted as the first research tick
    expect(upgradeLevel(w.state, w.ctx, 0, 'dock', 'capacity')).toBe(0);
    run(w.state, w.ctx, 1);
    expect(upgradeLevel(w.state, w.ctx, 0, 'dock', 'capacity')).toBe(1);
  });

  it('the first path picked is the cheap one; the other costs double', () => {
    const { ctx, state } = world();
    const dock = typeIndex(ctx, 'dock');
    expect(upgradePrice(state, ctx, 0, dock, 1)!.cost).toBe(40);
    research(state, ctx, 'dock', 0);
    expect(upgradePrice(state, ctx, 0, dock, 0)).toMatchObject({ cost: 80, level: 2 });
    expect(upgradePrice(state, ctx, 0, dock, 1)).toMatchObject({ cost: 80, level: 1 }); // 40 × 2
  });

  it('Discount and Fast Research make later upgrades cheaper and quicker', () => {
    const { ctx, state } = world();
    research(state, ctx, 'workshop', 0); // Discount 10%
    research(state, ctx, 'workshop', 1); // Fast Research 20% (second path: double cost)
    const dock = typeIndex(ctx, 'dock');
    expect(upgradePrice(state, ctx, 0, dock, 0)).toMatchObject({ cost: 36, ticks: 160 });
  });

  it('every path is open, burning levels included (M6)', () => {
    const { ctx, state } = world();
    expect(upgradeError(state, ctx, 0, typeIndex(ctx, 'catapult'), 0)).toBeNull();
    research(state, ctx, 'catapult', 1); // Firepower L1
    expect(upgradeError(state, ctx, 0, typeIndex(ctx, 'catapult'), 1)).toBeNull(); // Fireball
    expect(upgrades.types.every((t) => t.paths.every((p) => p.levels.every((l) => !('locked' in l))))).toBe(true);
  });

  it('a path has 3 levels', () => {
    const { ctx, state } = world();
    for (let i = 0; i < 3; i++) research(state, ctx, 'dock', 0);
    expect(upgradeError(state, ctx, 0, typeIndex(ctx, 'dock'), 0)).toBe('fully upgraded');
    expect(upgrades.types.every((t) => t.paths.length === 2 && t.paths.every((p) => p.levels.length === 3))).toBe(true);
  });
});

describe('upgrade effects apply to existing items (§10.3)', () => {
  it('Reach grows every outpost', () => {
    const { ctx, state } = world();
    const before = state.coverage.filter((c) => c & 1).length;
    research(state, ctx, 'outpost', 0);
    expect(state.coverage.filter((c) => c & 1).length).toBeGreaterThan(before);
  });

  it('Efficiency lowers crafting costs', () => {
    const { ctx, state } = world();
    research(state, ctx, 'factory', 0);
    expect(craftCost(state, ctx, 0, 'dock')).toBe(18_000); // 20 − 10%
  });

  it('Dock Capacity raises an existing dock’s capacity', () => {
    const { ctx, state } = world();
    put(state, ctx, 'dock', 0, cell(4, 1));
    research(state, ctx, 'dock', 0);
    expect(dockCapacity(state, ctx, 0)).toBe(40_000);
  });

  it('Woodchopper Output cuts faster', () => {
    const { ctx, state } = world();
    research(state, ctx, 'woodchopper', 0);
    put(state, ctx, 'woodchopper', 0, cell(0, 0));
    run(state, ctx, 80); // 0.375 wood/s × 8 s = 3 wood
    expect(stackOf(state, ctx, cell(0, 0))).toBeCloseTo(3, 1);
  });

  it('Mobility lengthens carrier routes', () => {
    const { ctx, state } = world();
    expect(carrierRoute(state, ctx, 0)).toBe(5);
    research(state, ctx, 'carrier', 1);
    expect(carrierRoute(state, ctx, 0)).toBe(6);
  });

  it('Log Slide sends a riverside woodchopper’s wood into the river', () => {
    const { ctx, state } = world(['. . T ~ . .', '. . . ~ . .', '. . . ~ . .', '. . . ~ . .']);
    research(state, ctx, 'woodchopper', 1);
    put(state, ctx, 'woodchopper', 0, cell(2, 0));
    run(state, ctx, 200);
    expect(state.entities.some((e) => e.type === 'pile') || stackOf(state, ctx, cell(2, 0)) < 5).toBe(true);
  });
});

describe('bridge upgrades (§10.3)', () => {
  it('Drawbridge keeps other players’ carriers off; Grate stops wood for the owner', () => {
    const { ctx, state } = world(RIVER, 2);
    put(state, ctx, 'outpost', 1, cell(1, 1));
    const bridge = put(state, ctx, 'bridge', 0, cell(3, 1));
    put(state, ctx, 'factory', 1, cell(4, 1));
    expect(dropOffs(state, ctx, 1, cell(1, 1).q, 1).some((d) => d.riverQ === null)).toBe(true); // can cross to it
    research(state, ctx, 'bridge', 0); // Drawbridge
    expect(dropOffs(state, ctx, 1, cell(1, 1).q, 1).some((d) => d.riverQ === null)).toBe(false);

    research(state, ctx, 'bridge', 0); // Grate
    spawnPile(state, ctx, cell(3, 0).q, 0, 4000);
    run(state, ctx, 10);
    expect(stackOf(state, ctx, cell(3, 1))).toBe(4);
    expect(bridge.kind).toBe('bridge');
  });

  it('Causeway lets one piece span 2 water hexes along its row', () => {
    const { ctx, state } = world(['. . ~ ~ . .', '. . ~ ~ . .', '. . ~ ~ . .']);
    put(state, ctx, 'bridge', 0, cell(2, 1));
    const i = idx(ctx, cell(2, 1))!;
    expect(isWorkingBridge(state, ctx, i)).toBe(false); // a half bridge
    research(state, ctx, 'bridge', 1);
    research(state, ctx, 'bridge', 1); // L2: spans 2
    expect(isWorkingBridge(state, ctx, i)).toBe(true);
  });
});

describe('forest guard upgrades (§10.3)', () => {
  it('Afforest turns empty land in its area into forest', () => {
    const { ctx, state } = world(['T . . ~ .', '. . . ~ .', '. . . ~ .']);
    research(state, ctx, 'forestGuard', 1);
    state.players[0]!.hand.push('forestGuard');
    step(state, ctx, [{ type: 'placeGuard', player: 0, q: cell(1, 1).q, r: 1 }]);
    run(state, ctx, 120 * 10);
    expect(state.grownForest.filter(Boolean)).toHaveLength(1);
    const grown = state.grownForest.findIndex(Boolean);
    expect(state.forestPool[grown]).toBe(100_000);
  });
});

describe('playtest mode (DESIGN §7.5)', () => {
  it('halves crafting and upgrade costs and times for everyone, switched by any player', () => {
    const { ctx, state } = world();
    const t = typeIndex(ctx, 'dock');
    const before = { cost: craftCost(state, ctx, 0, 'carrier'), ticks: craftTicks(state, ctx, 0, 'carrier'), up: upgradePrice(state, ctx, 0, t, 0)! };
    step(state, ctx, [{ type: 'setPlaytest', player: 0, on: true }]);
    expect(state.playtest).toBe(true);
    expect(craftCost(state, ctx, 0, 'carrier')).toBe(before.cost / 2);
    expect(craftTicks(state, ctx, 0, 'carrier')).toBe(Math.ceil(before.ticks / 2));
    const up = upgradePrice(state, ctx, 0, t, 0)!;
    expect(up.cost).toBe(before.up.cost / 2);
    expect(up.ticks).toBe(Math.ceil(before.up.ticks / 2));
    step(state, ctx, [{ type: 'setPlaytest', player: 0, on: false }]);
    expect(craftCost(state, ctx, 0, 'carrier')).toBe(before.cost);
  });
});
