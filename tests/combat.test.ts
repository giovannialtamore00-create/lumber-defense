import { describe, expect, it } from 'vitest';
import { idx } from '../src/sim/context';
import { distance } from '../src/sim/hex';
import { addEntity } from '../src/sim/state';
import { checkDefeats, damage, isLegalTarget, maxHp } from '../src/sim/systems/combat';
import { territoryChanged } from '../src/sim/systems/territory';
import { step } from '../src/sim/tick';
import type { Carrier, Catapult, GameState } from '../src/sim/types';
import { NEUTRAL } from '../src/sim/types';
import type { SimContext } from '../src/sim/context';
import { cell, put, setup, stackOf } from './helpers';

const run = (state: GameState, ctx: SimContext, n: number) => {
  for (let i = 0; i < n; i++) step(state, ctx, []);
};
const LAND = ['. . . . . . . . .', '. . . . . . . . .', '. . . . . . . . .', '. . . . . . . . .', '. . . . . . . . .'];

/** Two players: outposts at the west and east ends, overlapping in the middle columns. */
function duel(rows = LAND) {
  const w = setup(rows, undefined, 2);
  const a = put(w.state, w.ctx, 'outpost', 0, cell(1, 2));
  const b = put(w.state, w.ctx, 'outpost', 1, cell(7, 2));
  a.hp = b.hp = 150;
  territoryChanged(w.state, w.ctx);
  return { ...w, a, b };
}

function catapult(state: GameState, owner: number, h: { q: number; r: number }): Catapult {
  return addEntity<Catapult>(state, {
    type: 'catapult', owner, q: h.q, r: h.r, toQ: null, toR: null, moveTicks: 0,
    targetId: null, thinkTicks: 0, fireTicks: 0, aimQ: h.q, aimR: h.r, hp: 80,
  });
}

describe('ownership (§9)', () => {
  it('an item keeps its owner while covered by them, passes to the one other player covering it, else turns neutral', () => {
    const { ctx, state, a } = duel();
    const dock = put(state, ctx, 'dock', 0, cell(4, 2)); // conflict zone: covered by both
    const west = put(state, ctx, 'workshop', 0, cell(0, 2)); // only player 0
    territoryChanged(state, ctx);
    expect(dock.owner).toBe(0);
    state.entities.splice(state.entities.indexOf(a), 1); // player 0's outpost gone
    territoryChanged(state, ctx);
    expect(dock.owner).toBe(1); // only player 1 covers it now
    expect(west.owner).toBe(NEUTRAL); // nobody covers it
  });

  it('a neutral item covered by two players stays neutral; covered by one, it passes to them', () => {
    const { ctx, state } = duel();
    const dock = put(state, ctx, 'dock', NEUTRAL, cell(4, 2));
    territoryChanged(state, ctx);
    expect(dock.owner).toBe(NEUTRAL);
    const w = put(state, ctx, 'workshop', NEUTRAL, cell(0, 2));
    territoryChanged(state, ctx);
    expect(w.owner).toBe(0);
  });

  it('a neutral factory piles the wood it receives on its hex', () => {
    const { ctx, state } = duel();
    const f = put(state, ctx, 'factory', NEUTRAL, cell(4, 2));
    const dock = put(state, ctx, 'dock', 0, cell(3, 2));
    state.stacks[idx(ctx, dock)!] = 3000;
    run(state, ctx, 10);
    expect(stackOf(state, ctx, f)).toBe(1);
  });
});

describe('catapult (§8.6)', () => {
  it('targets only other players’ items on a conflict zone inside its owner’s territory', () => {
    const { ctx, state } = duel();
    const inConflict = put(state, ctx, 'dock', 1, cell(4, 2));
    const theirs = put(state, ctx, 'dock', 1, cell(8, 2)); // only player 1 covers it
    const neutral = put(state, ctx, 'dock', NEUTRAL, cell(5, 2));
    expect(isLegalTarget(state, ctx, 0, inConflict)).toBe(true);
    expect(isLegalTarget(state, ctx, 0, theirs)).toBe(false);
    expect(isLegalTarget(state, ctx, 0, neutral)).toBe(false);
  });

  it('drives into range, fires, and a destroyed structure leaves debris', () => {
    const { ctx, state } = duel();
    const target = put(state, ctx, 'dock', 1, cell(4, 2));
    target.hp = 25;
    const c = catapult(state, 0, cell(0, 0));
    expect(distance(c, target)).toBeGreaterThan(4);
    run(state, ctx, 200);
    expect(distance(c, target)).toBeLessThanOrEqual(4);
    expect(state.entities.includes(target)).toBe(false);
    expect(state.debris[idx(ctx, target)!]).toBe(ctx.config.items.dock.cost);
    expect(state.players[0]!.stats.damageDealt).toBeGreaterThanOrEqual(25);
  });

  it('never leaves its owner’s territory to chase a target', () => {
    const { ctx, state } = duel();
    put(state, ctx, 'dock', 1, cell(4, 2)).hp = 1000;
    const c = catapult(state, 0, cell(0, 2));
    for (let t = 0; t < 300; t++) {
      step(state, ctx, []);
      expect(state.coverage[idx(ctx, c)!]! & 1).toBe(1);
    }
  });

  it('a moving target can dodge: the shot lands where the target was', () => {
    const { ctx, state } = duel();
    const carrier = addEntity<Carrier>(state, {
      type: 'carrier', owner: 1, r: 2, aQ: cell(4, 2).q, bQ: cell(4, 2).q, pickupQ: cell(4, 2).q, riverQ: null,
      posQ: cell(4, 2).q * 1000, phase: 'toA', load: 0, hp: 30, boostTicks: 0,
    });
    catapult(state, 0, cell(1, 2)); // in range already: fires on the first tick
    step(state, ctx, []);
    expect(state.entities.some((e) => e.type === 'shot')).toBe(true);
    carrier.posQ += 1000; // it drove one hex on
    run(state, ctx, ctx.config.combat.shotFlightS * ctx.config.tickRate);
    expect(carrier.hp).toBe(30);
  });

  it('off its territory it drives back to the closest hex of it', () => {
    const { ctx, state } = duel();
    const c = catapult(state, 0, cell(8, 4)); // player 1's side only
    run(state, ctx, 200);
    expect(state.coverage[idx(ctx, c)!]! & 1).toBe(1);
  });

  it('blocked by water on the way back, it waits facing home', () => {
    const rows = ['. . . . . ~ . . .', '. . . . . ~ . . .', '. . . . . ~ . . .', '. . . . . ~ . . .', '. . . . . ~ . . .'];
    const { ctx, state, b } = duel(rows);
    const c = catapult(state, 1, cell(7, 0));
    state.entities.splice(state.entities.indexOf(b), 1);
    put(state, ctx, 'outpost', 1, cell(1, 2)).hp = 150; // player 1's only territory is now west of the river
    territoryChanged(state, ctx);
    const at = { q: c.q, r: c.r };
    run(state, ctx, 100);
    expect({ q: c.q, r: c.r }).toEqual(at);
    expect(c.aimQ).toBeLessThan(c.q);
  });
});

describe('defeat, surrender, victory (§11)', () => {
  it('losing the last outpost knocks a player out, dismantles their catapults, and the other player wins', () => {
    const { ctx, state, b } = duel();
    catapult(state, 1, cell(7, 3));
    damage(state, ctx, b, 1000, 0);
    expect(state.players[1]!.defeated).toBe(true);
    expect(state.entities.some((e) => e.type === 'catapult')).toBe(false);
    expect(state.players[0]!.stats.outpostsDestroyed).toBe(1);
    step(state, ctx, []);
    expect(state.phase).toBe('over');
    expect(state.winner).toBe(0);
  });

  it('surrender dismantles outposts and catapults (half their cost as wood) and the rest turns neutral', () => {
    const { ctx, state, b } = duel();
    const wc = put(state, ctx, 'workshop', 1, cell(8, 2));
    step(state, ctx, [{ type: 'surrender', player: 1 }]);
    expect(state.entities.includes(b)).toBe(false);
    expect(stackOf(state, ctx, b)).toBe(ctx.config.items.outpost.cost / 2);
    expect(wc.owner).toBe(NEUTRAL);
    expect(state.players[1]!.defeated).toBe(true);
    expect(state.phase).toBe('over');
  });

  it('a defeated player’s commands are ignored', () => {
    const { ctx, state } = duel();
    state.players[1]!.defeated = true;
    checkDefeats(state, ctx);
    const wood = state.players[1]!.wood;
    step(state, ctx, [{ type: 'give', player: 1, to: 0, amount: 5 }]);
    expect(state.players[1]!.wood).toBe(wood);
  });
});

describe('debris and HP (§9, §10.1)', () => {
  it('debris blocks building; a woodchopper clears it and leaves 25% of the cost as logs', () => {
    const { ctx, state } = duel();
    const i = idx(ctx, cell(0, 2))!;
    state.debris[i] = 60;
    state.players[0]!.hand.push('workshop', 'woodchopper');
    const h = cell(0, 2);
    step(state, ctx, [{ type: 'place', player: 0, item: 'workshop', q: h.q, r: h.r }]);
    expect(state.entities.some((e) => e.type === 'structure' && e.kind === 'workshop')).toBe(false);
    step(state, ctx, [{ type: 'place', player: 0, item: 'woodchopper', q: h.q, r: h.r }]);
    run(state, ctx, ctx.config.debris.clearS * ctx.config.tickRate);
    expect(state.debris[i]).toBe(0);
    expect(stackOf(state, ctx, h)).toBe(15);
  });

  it('Improved Frames adds the extra max HP as healing', () => {
    const { ctx, state } = duel();
    const ws = put(state, ctx, 'workshop', 0, cell(0, 2));
    const dock = put(state, ctx, 'dock', 0, cell(0, 3));
    dock.hp = 50; // 30 damage taken out of 80
    ws.hp = maxHp(state, ctx, ws);
    const frames = ctx.upgrades.types.findIndex((t) => t.type === 'factory');
    state.players[0]!.wood = 1_000_000;
    step(state, ctx, [{ type: 'buyUpgrade', player: 0, upgradeType: frames, path: 1 }]);
    run(state, ctx, 400);
    expect(maxHp(state, ctx, dock)).toBe(92); // 80 + 15%
    expect(dock.hp).toBe(62); // still 30 below max
  });
});
