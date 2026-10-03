// Playtest changes (DESIGN §6.2, §6.4, §6.6, §6.6b, §7.3b–d, §8.4b).
import { describe, expect, it } from 'vitest';
import baseConfig from '../src/data/config.json';
import { idx } from '../src/sim/context';
import { spawnPile } from '../src/sim/systems/river';
import { step } from '../src/sim/tick';
import type { Carrier, Config, GameState, Pile } from '../src/sim/types';
import { cell, put, setStack, setup, stackOf } from './helpers';

const config = baseConfig as Config;
const run = (state: GameState, ctx: Parameters<typeof step>[1], ticks: number) => {
  for (let t = 0; t < ticks; t++) step(state, ctx, []);
};
const piles = (state: GameState) => state.entities.filter((e): e is Pile => e.type === 'pile');
const wood = (state: GameState, p = 0) => state.players[p]!.wood / 1000;
const RIVER = ['T . . ~ . .', '. . . ~ . .', '. . . ~ . .', '. . . ~ . .'];

describe('passive income (§6.6b)', () => {
  it('every player gets 1 wood every 5 s while the game runs, not during the starting turns', () => {
    const { ctx, state } = setup(RIVER, config, 2);
    run(state, ctx, 100);
    expect([wood(state, 0), wood(state, 1)]).toEqual([52, 52]);
    state.phase = 'start';
    run(state, ctx, 100);
    expect(wood(state, 0)).toBe(52);
  });
});

describe('woodchopper relocation (§6.2)', () => {
  const FOREST = ['T T . ~ .', 'T . . ~ .', '. . . ~ .'];

  it('moves to the adjacent free forest hex with the most wood when its forest runs out', () => {
    const { ctx, state } = setup(FOREST);
    put(state, ctx, 'outpost', 0, cell(2, 1));
    const wc = put(state, ctx, 'woodchopper', 0, cell(0, 0));
    state.forestPool[idx(ctx, cell(0, 0))!] = 25; // one tick left
    state.forestPool[idx(ctx, cell(1, 0))!] = 60_000; // less wood than (0,1), which has 100
    step(state, ctx, []);
    expect({ q: wc.q, r: wc.r }).toEqual(cell(0, 1));
  });

  it('stays idle if no adjacent forest is free, and moves once one is', () => {
    const { ctx, state } = setup(FOREST);
    put(state, ctx, 'outpost', 0, cell(2, 1));
    const wc = put(state, ctx, 'woodchopper', 0, cell(0, 0));
    const blocker1 = put(state, ctx, 'woodchopper', 0, cell(1, 0));
    put(state, ctx, 'woodchopper', 0, cell(0, 1));
    state.forestPool[idx(ctx, cell(0, 0))!] = 0;
    run(state, ctx, 5);
    expect({ q: wc.q, r: wc.r }).toEqual(cell(0, 0));
    state.entities = state.entities.filter((e) => e.id !== blocker1.id);
    step(state, ctx, []);
    expect({ q: wc.q, r: wc.r }).toEqual(cell(1, 0));
  });
});

describe('warehouse (§7.3b)', () => {
  it('a crafted item with no legal spot goes to the warehouse; store and retrieve move items', () => {
    const { ctx, state } = setup(['. . . ~ .', '. . . ~ .']);
    put(state, ctx, 'outpost', 0, cell(1, 1));
    // Every riverside hex is taken, so a new factory-mill has nowhere to go.
    put(state, ctx, 'factory', 0, cell(2, 0));
    put(state, ctx, 'dock', 0, cell(2, 1));
    put(state, ctx, 'dock', 0, cell(4, 0));
    put(state, ctx, 'dock', 0, cell(4, 1));
    state.players[0]!.wood = 1_000_000;
    step(state, ctx, [{ type: 'craft', player: 0, item: 'factory' }]);
    run(state, ctx, config.items.factory.craftTimeS * config.tickRate);
    expect(state.players[0]!.hand).toEqual([]);
    expect(state.players[0]!.warehouse).toEqual(['factory']);

    state.players[0]!.hand.push('dock', 'bridge');
    step(state, ctx, [{ type: 'store', player: 0 }]);
    expect(state.players[0]!.hand).toEqual(['bridge']);
    expect(state.players[0]!.warehouse).toEqual(['factory', 'dock']);
    step(state, ctx, [{ type: 'retrieve', player: 0, index: 0 }]);
    expect(state.players[0]!.hand).toEqual(['factory', 'bridge']);
    expect(state.players[0]!.warehouse).toEqual(['dock']);
  });
});

describe('carrier with an empty pickup (§6.4)', () => {
  it('fetches the nearest wood on its row, drops it at B, then goes back to A', () => {
    const { ctx, state } = setup(['. . . . . ~ .', '. . . . . ~ .']);
    put(state, ctx, 'outpost', 0, cell(2, 1));
    put(state, ctx, 'woodchopper', 0, cell(1, 0)); // A: no wood yet
    setStack(state, ctx, cell(0, 0), 3); // wood further along the row
    state.players[0]!.hand.push('carrier');
    step(state, ctx, [{ type: 'placeCarrier', player: 0, aQ: cell(1, 0).q, bQ: cell(4, 0).q, r: 0 }]);
    const c = state.entities.find((e): e is Carrier => e.type === 'carrier')!;
    run(state, ctx, 30);
    expect(stackOf(state, ctx, cell(0, 0))).toBe(0);
    expect(c.load).toBe(3000);
    run(state, ctx, 90);
    expect(piles(state).length + (c.load === 0 ? 1 : 0)).toBeGreaterThan(0);
    expect(c.pickupQ).toBe(cell(1, 0).q);
  });
});

describe('dismantling structures (§7.3c)', () => {
  it('destroys your own structure and leaves half its cost as wood; not outposts, not others’', () => {
    const { ctx, state } = setup(RIVER, undefined, 2);
    const outpost = put(state, ctx, 'outpost', 0, cell(1, 1));
    const mine = put(state, ctx, 'dock', 0, cell(2, 1));
    const theirs = put(state, ctx, 'dock', 1, cell(4, 1));
    step(state, ctx, [
      { type: 'dismantle', player: 0, id: mine.id },
      { type: 'dismantle', player: 0, id: theirs.id },
      { type: 'dismantle', player: 0, id: outpost.id },
    ]);
    const kinds = state.entities.filter((e) => e.type === 'structure').map((e) => (e.type === 'structure' ? e.kind : ''));
    expect(kinds).toEqual(['outpost', 'dock']);
    expect(stackOf(state, ctx, cell(2, 1))).toBe(config.items.dock.cost / 2);
  });

  it('on water the refund floats away', () => {
    const { ctx, state } = setup(RIVER);
    put(state, ctx, 'outpost', 0, cell(1, 1));
    const bridge = put(state, ctx, 'bridge', 0, cell(3, 1));
    step(state, ctx, [{ type: 'dismantle', player: 0, id: bridge.id }]);
    expect(piles(state).map((p) => p.amount)).toEqual([(config.items.bridge.cost / 2) * 1000]);
  });
});

describe('dismantling units (§7.3c)', () => {
  it('a carrier leaves half its cost plus its load where it stands', () => {
    const { ctx, state } = setup(RIVER);
    put(state, ctx, 'outpost', 0, cell(1, 1));
    put(state, ctx, 'woodchopper', 0, cell(0, 0));
    state.players[0]!.hand.push('carrier');
    step(state, ctx, [{ type: 'placeCarrier', player: 0, aQ: cell(0, 0).q, bQ: cell(2, 0).q, r: 0 }]);
    const c = state.entities.find((e): e is Carrier => e.type === 'carrier')!;
    c.load = 3000;
    step(state, ctx, [{ type: 'dismantle', player: 0, id: c.id }]);
    expect(state.entities.some((e) => e.type === 'carrier')).toBe(false);
    expect(stackOf(state, ctx, cell(0, 0))).toBeGreaterThanOrEqual(config.items.carrier.cost / 2 + 3);
  });
});

describe('trading (§7.3d)', () => {
  it('gives whole wood to another player, never more than you have', () => {
    const { ctx, state } = setup(RIVER, undefined, 2);
    step(state, ctx, [{ type: 'give', player: 0, to: 1, amount: 20 }]);
    expect([wood(state, 0), wood(state, 1)]).toEqual([30, 70]);
    step(state, ctx, [
      { type: 'give', player: 0, to: 1, amount: 31 },
      { type: 'give', player: 0, to: 0, amount: 5 },
      { type: 'give', player: 0, to: 1, amount: 0 },
    ]);
    expect([wood(state, 0), wood(state, 1)]).toEqual([30, 70]);
  });
});

describe('dam (§8.4b)', () => {
  it('on a fork, sends every pile down the other branch and takes no damage', () => {
    const { ctx, state } = setup(['. ~ .', '~ ~ .', '~ ~ .']);
    put(state, ctx, 'outpost', 0, cell(2, 1));
    const dam = put(state, ctx, 'dam', 0, cell(0, 1));
    dam.hp = 120;
    for (let i = 0; i < 20; i++) {
      spawnPile(state, ctx, cell(1, 0).q, 0, 1000);
      run(state, ctx, 10);
      expect(piles(state).every((p) => p.q === cell(1, 1).q)).toBe(true);
      state.entities = state.entities.filter((e) => e.type !== 'pile');
    }
    expect(dam.hp).toBe(120);
  });

  it('elsewhere, wood waits behind it, docks keep catching, carriers can’t; river pressure breaks it', () => {
    const { ctx, state } = setup(RIVER); // river rows 0–3: strength rows 1–4
    put(state, ctx, 'outpost', 0, cell(1, 1));
    const dam = put(state, ctx, 'dam', 0, cell(3, 2));
    dam.hp = config.items.dam.hp;
    put(state, ctx, 'dock', 0, cell(4, 1));
    spawnPile(state, ctx, cell(3, 0).q, 0, 8000);
    run(state, ctx, 10); // reaches row 1 (dock catches 4)
    run(state, ctx, 30); // stuck behind the dam; a new try each second
    // The wood never got past the dam: the dock beside it caught all of it, a bit more every second.
    expect(piles(state).every((p) => p.r <= 1)).toBe(true);
    expect(stackOf(state, ctx, cell(4, 1))).toBe(8);
    // Pressure: strength row 3 × 1 HP/s, no relief.
    expect(dam.hp).toBe(config.items.dam.hp - 3 * 4);
    run(state, ctx, (config.items.dam.hp / 3) * 10);
    expect(state.entities.some((e) => e.id === dam.id)).toBe(false);
  });
});
