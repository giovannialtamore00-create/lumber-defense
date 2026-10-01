import { describe, expect, it } from 'vitest';
import baseConfig from '../src/data/config.json';
import { craftError, craftReductionBp, craftTicks, watermills } from '../src/sim/systems/crafting';
import { step } from '../src/sim/tick';
import type { Config, GameState } from '../src/sim/types';
import { cell, put, setup, withConfig } from './helpers';

const config = baseConfig as Config;
const run = (state: GameState, ctx: Parameters<typeof step>[1], ticks: number) => {
  for (let t = 0; t < ticks; t++) step(state, ctx, []);
};

// One river (column 3), 8 rows: river strength row = map row + 1, so row 7 is the strongest (8).
const RIVER8 = Array.from({ length: 8 }, () => '. . . ~ . .');
// Two distinct rivers (columns 2 and 4) with one land column between them.
const TWO_RIVERS = Array.from({ length: 8 }, () => '. . ~ . = .');

describe('factory-mill boost (DESIGN §6.7)', () => {
  it('a factory-mill counts the strongest river row it touches; at the bottom 12% raw → 12.85% faster', () => {
    const { ctx, state } = setup(RIVER8);
    put(state, ctx, 'outpost', 0, cell(1, 3));
    const top = put(state, ctx, 'factory', 0, cell(4, 0));
    // At the top it touches river rows 1 and 2: row 2 counts (0.4% raw → 90% × 40 / 8400).
    expect(watermills(state, ctx, top)).toEqual([{ river: 0, row: 2, bonusBp: 40 }]);
    expect(craftReductionBp(state, ctx, 0)).toBe(42);

    const second = setup(RIVER8);
    put(second.state, second.ctx, 'outpost', 0, cell(1, 3));
    put(second.state, second.ctx, 'factory', 0, cell(4, 7));
    // Linear: 90% × 1200 / 8400 raw at the max setup.
    expect(craftReductionBp(second.state, second.ctx, 0)).toBe(1285);
  });

  it('each extra factory-mill adds 6% raw, plus its own river bonus', () => {
    const { ctx, state } = setup(RIVER8);
    put(state, ctx, 'outpost', 0, cell(1, 3));
    put(state, ctx, 'factory', 0, cell(4, 7));
    put(state, ctx, 'factory', 0, cell(2, 7));
    // 600 + 1200 + 1200 = 3000 raw → 90% × 3000 / 8400.
    expect(craftReductionBp(state, ctx, 0)).toBe(3214);
  });

  it('touching two distinct rivers gives two watermills; two hexes of the same river give one', () => {
    const { ctx, state } = setup(TWO_RIVERS);
    put(state, ctx, 'outpost', 0, cell(1, 3));
    const double = put(state, ctx, 'factory', 0, cell(3, 7));
    expect(watermills(state, ctx, double).map((m) => m.river)).toEqual([0, 1]);
    expect(craftReductionBp(state, ctx, 0)).toBe(2571); // 2400 raw

    const same = setup(Array.from({ length: 8 }, () => '. . ~ . ~ .'));
    put(same.state, same.ctx, 'outpost', 0, cell(1, 3));
    expect(watermills(same.state, same.ctx, put(same.state, same.ctx, 'factory', 0, cell(3, 7)))).toHaveLength(1);
  });

  it('the reduction stops at 90%', () => {
    const cfg = withConfig((c) => (c.factoryMill.maxSetup.factories = 1));
    const { ctx, state } = setup(TWO_RIVERS, cfg);
    put(state, ctx, 'outpost', 0, cell(1, 3));
    put(state, ctx, 'factory', 0, cell(3, 7)); // 2400 raw, twice the (patched) max setup
    expect(craftReductionBp(state, ctx, 0)).toBe(9000);
    expect(craftTicks(state, ctx, 0, 'factory')).toBe(45); // 45 s → 4.5 s
  });
});

describe('crafting (DESIGN §7.2)', () => {
  it('pays on confirm, crafts for the reduced time, then the item is in hand', () => {
    const { ctx, state } = setup(RIVER8);
    put(state, ctx, 'outpost', 0, cell(1, 3));
    put(state, ctx, 'factory', 0, cell(4, 7));
    put(state, ctx, 'woodchopper', 0, cell(0, 3)); // a pickup, so the carrier has somewhere to go
    step(state, ctx, [{ type: 'craft', player: 0, item: 'carrier' }]);
    expect(state.players[0]!.wood).toBe(40_000);
    expect(state.players[0]!.queue[0]!.totalTicks).toBe(88); // 100 ticks × (1 − 12.85%), rounded up
    run(state, ctx, 86);
    expect(state.players[0]!.hand).toEqual([]);
    run(state, ctx, 1);
    expect(state.players[0]!.hand).toEqual(['carrier']);
    expect(state.players[0]!.queue).toEqual([]);
  });

  it('one factory-mill = one item at a time; more factory-mills = more queue slots, still crafted one by one', () => {
    const { ctx, state } = setup(RIVER8);
    put(state, ctx, 'outpost', 0, cell(1, 3));
    expect(craftError(state, ctx, 0, 'carrier')).toBe('you need a factory-mill');
    put(state, ctx, 'factory', 0, cell(4, 0));
    step(state, ctx, [
      { type: 'craft', player: 0, item: 'carrier' },
      { type: 'craft', player: 0, item: 'carrier' },
    ]);
    expect(state.players[0]!.queue).toHaveLength(1);
    expect(state.players[0]!.wood).toBe(40_000);

    put(state, ctx, 'factory', 0, cell(4, 1));
    step(state, ctx, [{ type: 'craft', player: 0, item: 'dock' }]);
    const q = state.players[0]!.queue;
    expect(q.map((j) => j.item)).toEqual(['carrier', 'dock']);
    expect(q[1]!.totalTicks).toBe(0); // waiting, not crafting
  });

  it('needs enough wood', () => {
    const { ctx, state } = setup(RIVER8);
    put(state, ctx, 'outpost', 0, cell(1, 3));
    put(state, ctx, 'factory', 0, cell(4, 0));
    expect(craftError(state, ctx, 0, 'catapult')).toBe('not enough wood');
    expect(config.items.catapult.cost).toBeGreaterThan(config.startingWood);
  });
});

describe('bridges (DESIGN §8.4)', () => {
  const WIDE = ['. . ~ ~ . .', '. . ~ ~ . .', '. . ~ ~ . .'];

  it('go on water only', () => {
    const { ctx, state } = setup(RIVER8);
    put(state, ctx, 'outpost', 0, cell(2, 3));
    state.players[0]!.hand.push('bridge', 'bridge');
    step(state, ctx, [{ type: 'place', player: 0, item: 'bridge', q: cell(4, 3).q, r: 3 }]);
    step(state, ctx, [{ type: 'place', player: 0, item: 'bridge', q: cell(1, 3).q, r: 3 }]);
    expect(state.entities.filter((e) => e.type === 'structure' && e.kind === 'bridge')).toHaveLength(0);
  });

  it('over 1-wide water it works at once; over 2-wide water it is a half bridge until a second piece joins it', async () => {
    const { isWorkingBridge } = await import('../src/sim/systems/placement');
    const { ctx, state } = setup(WIDE);
    put(state, ctx, 'outpost', 0, cell(1, 1));
    const a = cell(2, 1);
    const b = cell(3, 1);
    put(state, ctx, 'bridge', 0, a);
    const ai = ctx.indexOf.get(`${a.q},${a.r}`)!;
    expect(isWorkingBridge(state, ctx, ai)).toBe(false);
    put(state, ctx, 'bridge', 0, b);
    expect(isWorkingBridge(state, ctx, ai)).toBe(true);

    const narrow = setup(RIVER8);
    put(narrow.state, narrow.ctx, 'bridge', 0, cell(3, 2));
    expect(isWorkingBridge(narrow.state, narrow.ctx, narrow.ctx.indexOf.get(`${cell(3, 2).q},2`)!)).toBe(true);
  });

  it('a carrier drops its logs from the bridge, and can cross it to a factory on the far bank', async () => {
    const { dropOffs } = await import('../src/sim/systems/placement');
    const { ctx, state } = setup(RIVER8);
    put(state, ctx, 'outpost', 0, cell(2, 1));
    put(state, ctx, 'bridge', 0, cell(3, 1));
    expect(dropOffs(state, ctx, 0, cell(0, 1).q, 1)).toEqual([{ q: cell(3, 1).q, riverQ: cell(3, 1).q }]);

    put(state, ctx, 'factory', 0, cell(4, 1));
    expect(dropOffs(state, ctx, 0, cell(0, 1).q, 1).map((d) => d.riverQ)).toEqual([null, cell(3, 1).q]);
  });
});
