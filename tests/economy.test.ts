import { describe, expect, it } from 'vitest';
import baseConfig from '../src/data/config.json';
import { idx } from '../src/sim/context';
import { stackStage } from '../src/sim/stack';
import { dropOffs, isForest, placementError } from '../src/sim/systems/placement';
import { spawnPile } from '../src/sim/systems/river';
import { step } from '../src/sim/tick';
import type { Carrier, Config, GameState, Pile } from '../src/sim/types';
import { cell, put, setStack, setup, stackOf, withConfig } from './helpers';

const config = baseConfig as Config;
const run = (state: GameState, ctx: Parameters<typeof step>[1], ticks: number) => {
  for (let t = 0; t < ticks; t++) step(state, ctx, []);
};
const piles = (state: GameState) => state.entities.filter((e): e is Pile => e.type === 'pile');
const wood = (state: GameState, p = 0) => state.players[p]!.wood / 1000;

// A straight river in column 3.
const RIVER = ['T . . ~ . .', '. . . ~ . .', '. . . ~ . .', '. . . ~ . .'];

describe('stack icon stages (DESIGN §6.3)', () => {
  it('1–4 / 5–14 / 15+', () => {
    const s = (w: number) => stackStage(w * 1000, config);
    expect([s(0), s(0.9), s(1), s(4.9), s(5), s(14.9), s(15), s(80)]).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe('woodchopper (DESIGN §6.2)', () => {
  it('cuts wood at its config rate into a stack on its own hex', () => {
    const { ctx, state } = setup(RIVER);
    put(state, ctx, 'woodchopper', 0, cell(0, 0));
    run(state, ctx, 1000 / ctx.rates.woodchopper); // ticks to cut 1 wood
    expect(stackOf(state, ctx, cell(0, 0))).toBe(1);
    expect(state.forestPool[idx(ctx, cell(0, 0))!]).toBe(99_000);
  });

  it('the forest disappears when its pool reaches 0', () => {
    const { ctx, state } = setup(RIVER);
    put(state, ctx, 'woodchopper', 0, cell(0, 0));
    state.forestPool[idx(ctx, cell(0, 0))!] = 500;
    run(state, ctx, 500 / ctx.rates.woodchopper);
    expect(isForest(state, idx(ctx, cell(0, 0))!)).toBe(false);
    expect(stackOf(state, ctx, cell(0, 0))).toBe(0.5);
  });
});

describe('river (DESIGN §6.5)', () => {
  it('a pile floats 1 hex/s and disappears past the southern edge', () => {
    const { ctx, state } = setup(RIVER);
    spawnPile(state, ctx, cell(3, 0).q, 0, 4000);
    run(state, ctx, 10);
    expect(piles(state)[0]).toMatchObject({ ...cell(3, 1), amount: 4000 });
    run(state, ctx, 29);
    expect(piles(state)).toHaveLength(1);
    run(state, ctx, 1);
    expect(piles(state)).toHaveLength(0);
  });

  it('piles never merge', () => {
    const { ctx, state } = setup(RIVER);
    spawnPile(state, ctx, cell(3, 0).q, 0, 1000);
    spawnPile(state, ctx, cell(3, 0).q, 0, 2000);
    run(state, ctx, 10);
    expect(piles(state).map((p) => p.amount)).toEqual([1000, 2000]);
  });

  it('a fork sends piles either way about 50/50, the same way for the same seed', () => {
    const FORK = ['. ~ .', '~ ~ .'];
    const branches = (seed: number) => {
      const { ctx, state } = setup(FORK, config, 1, seed);
      const out: number[] = [];
      for (let i = 0; i < 400; i++) {
        spawnPile(state, ctx, cell(1, 0).q, 0, 1000);
        run(state, ctx, 10);
        out.push(piles(state)[0]!.q);
        state.entities = [];
      }
      return out;
    };
    const a = branches(7);
    const west = a.filter((q) => q === cell(0, 1).q).length;
    expect(west).toBeGreaterThan(150);
    expect(west).toBeLessThan(250);
    expect(branches(7)).toEqual(a);
  });
});

describe('dock (DESIGN §6.6)', () => {
  it('catches half a pile, rounded down to whole wood: a pile of 5 gives 2, 3 float on', () => {
    const { ctx, state } = setup(RIVER);
    put(state, ctx, 'dock', 0, cell(4, 1));
    spawnPile(state, ctx, cell(3, 1).q, 1, 5000);
    expect(stackOf(state, ctx, cell(4, 1))).toBe(2);
    expect(piles(state).map((p) => p.amount)).toEqual([3000]);
  });

  it('never catches more than fits: capacity 25 holding 22, pile of 10 → 3 caught, 7 float on', () => {
    const cfg = withConfig((c) => {
      c.dock.capacity = 25;
      c.passiveIncome.wood = 0;
    });
    const { ctx, state } = setup(RIVER, cfg);
    put(state, ctx, 'dock', 0, cell(4, 1));
    setStack(state, ctx, cell(4, 1), 22);
    spawnPile(state, ctx, cell(3, 1).q, 1, 10_000);
    expect(stackOf(state, ctx, cell(4, 1))).toBe(25);
    expect(piles(state).map((p) => p.amount)).toEqual([7000]);
  });

  it('a pile floating past meets the dock on each river hex it touches, half each time', () => {
    const { ctx, state } = setup(RIVER);
    put(state, ctx, 'dock', 0, cell(4, 2)); // touches the river in rows 1, 2 and 3
    spawnPile(state, ctx, cell(3, 0).q, 0, 4000);
    run(state, ctx, 30);
    expect(stackOf(state, ctx, cell(4, 2))).toBe(4); // 2 of 4, then 1 of 2, then the last 1 (at least 1 wood)
    expect(piles(state)).toHaveLength(0);
  });

  it('dispenses 1 wood/s into an adjacent factory', () => {
    const { ctx, state } = setup(RIVER);
    put(state, ctx, 'dock', 0, cell(4, 1));
    put(state, ctx, 'factory', 0, cell(5, 1));
    setStack(state, ctx, cell(4, 1), 5);
    run(state, ctx, 10);
    expect(wood(state)).toBe(51);
    expect(stackOf(state, ctx, cell(4, 1))).toBe(4);
  });
});

describe('carrier (DESIGN §6.4)', () => {
  it('drop-off is the first hex before the closest river on its row', () => {
    const { ctx, state } = setup(RIVER);
    put(state, ctx, 'outpost', 0, cell(1, 1));
    expect(dropOffs(state, ctx, 0, cell(0, 0).q, 0)).toEqual([{ q: cell(2, 0).q, riverQ: cell(3, 0).q }]);
  });

  it('between two rivers, either one can be the drop-off (the player picks), even past other forests', () => {
    const { ctx, state } = setup(['~ . T T T . T ~', '~ . . . . . . ~']);
    put(state, ctx, 'outpost', 0, cell(4, 1));
    const options = dropOffs(state, ctx, 0, cell(3, 0).q, 0);
    expect(options).toEqual([
      { q: cell(1, 0).q, riverQ: cell(0, 0).q },
      { q: cell(6, 0).q, riverQ: cell(7, 0).q },
    ]);
  });

  it('loops A → river: takes what is there, drops it in the river, comes back', () => {
    const { ctx, state } = setup(RIVER);
    put(state, ctx, 'outpost', 0, cell(1, 1));
    put(state, ctx, 'woodchopper', 0, cell(0, 0));
    state.players[0]!.hand.push('carrier');
    step(state, ctx, [{ type: 'placeCarrier', player: 0, aQ: cell(0, 0).q, bQ: cell(2, 0).q, r: 0 }]);
    const carrier = state.entities.find((e): e is Carrier => e.type === 'carrier')!;
    expect(carrier).toBeDefined();

    run(state, ctx, 1000 / ctx.rates.woodchopper - 1); // 1 wood in the stack, picked up
    expect(carrier.load).toBe(1000);
    run(state, ctx, 40); // 2 hexes at 0.5 hex/s
    expect(carrier.load).toBe(0);
    expect(carrier.phase).toBe('toA');
    expect(piles(state).map((p) => p.amount)).toEqual([1000]);
  });

  it('a factory on the row is a drop-off, and wood delivered there becomes the owner’s', () => {
    const { ctx, state } = setup(RIVER);
    put(state, ctx, 'outpost', 0, cell(1, 1));
    put(state, ctx, 'factory', 0, cell(2, 0));
    setStack(state, ctx, cell(0, 0), 7);
    state.players[0]!.hand.push('carrier');
    step(state, ctx, [{ type: 'placeCarrier', player: 0, aQ: cell(0, 0).q, bQ: cell(2, 0).q, r: 0 }]);
    run(state, ctx, 40);
    expect(wood(state)).toBe(55); // capacity 5
    expect(stackOf(state, ctx, cell(0, 0))).toBe(2);
  });

  it('rocks block the route, and the route is limited to 5 hexes', () => {
    const { ctx, state } = setup(['T # . ~', '. . . ~']);
    put(state, ctx, 'outpost', 0, cell(1, 1));
    expect(dropOffs(state, ctx, 0, cell(0, 0).q, 0)).toEqual([]);

    const far = setup(['T . . . . . . ~', '. . . . . . . ~']);
    put(far.state, far.ctx, 'outpost', 0, cell(3, 1));
    expect(dropOffs(far.state, far.ctx, 0, cell(0, 0).q, 0)).toEqual([]);
  });
});

describe('match start (DESIGN §5)', () => {
  const START = [
    '. . T T . . ~ . . .',
    '. . . . . . ~ . . .',
    '. . . . . . ~ . . .',
    '. . . . . . ~ . . .',
  ];

  it('the first outpost needs a forest and a free riverside in its territory', () => {
    const { ctx, state } = setup(START);
    expect(placementError(state, ctx, 0, 'outpost', cell(1, 1).q, 1)).toBe('no free riverside in this territory');
    expect(placementError(state, ctx, 0, 'outpost', cell(6, 3).q, 3)).toBe('water');
    expect(placementError(state, ctx, 0, 'outpost', cell(4, 1).q, 1)).toBeNull();
  });

  it('the first outpost has territory radius 2 (19 hexes)', () => {
    const { ctx, state } = setup(START);
    step(state, ctx, [{ type: 'placeOutpost', player: 0, q: cell(4, 1).q, r: 1 }]);
    expect(state.coverage.filter((c) => c !== 0)).toHaveLength(ctx.map.hexes.filter((h) => Math.abs(h.q - cell(4, 1).q) + Math.abs(h.r - 1) + Math.abs(h.q - cell(4, 1).q + h.r - 1) <= 4).length);
  });

  it('placing it gives territory, a woodchopper on the closest forest and a factory in hand', () => {
    const { ctx, state } = setup(START);
    step(state, ctx, [{ type: 'placeOutpost', player: 0, q: cell(4, 1).q, r: 1 }]);
    const kinds = state.entities.map((e) => (e.type === 'structure' ? `${e.kind}@${e.q},${e.r}` : e.type));
    expect(kinds).toEqual([`outpost@${cell(4, 1).q},1`, `woodchopper@${cell(3, 0).q},0`]);
    expect(state.players[0]!.hand).toEqual(['factory']);
    expect(wood(state)).toBe(50);
  });

  it('the factory-mill must go on the riverside, inside the territory', () => {
    const { ctx, state } = setup(START);
    step(state, ctx, [{ type: 'placeOutpost', player: 0, q: cell(4, 1).q, r: 1 }]);
    expect(placementError(state, ctx, 0, 'factory', cell(3, 2).q, 2)).toBe('factory-mills must be on the riverside');
    expect(placementError(state, ctx, 0, 'factory', cell(5, 2).q, 2)).toBeNull();
    step(state, ctx, [{ type: 'place', player: 0, item: 'factory', q: cell(5, 2).q, r: 2 }]);
    expect(state.players[0]!.hand).toEqual([]);
  });

  it('a second first-outpost command is ignored', () => {
    const { ctx, state } = setup(START);
    step(state, ctx, [{ type: 'placeOutpost', player: 0, q: cell(4, 1).q, r: 1 }]);
    step(state, ctx, [{ type: 'placeOutpost', player: 0, q: cell(4, 3).q, r: 3 }]);
    expect(state.entities.filter((e) => e.type === 'structure' && e.kind === 'outpost')).toHaveLength(1);
  });
});
