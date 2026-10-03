import { describe, expect, it } from 'vitest';
import { type SimContext, idx } from '../src/sim/context';
import { fireStrength, newFire } from '../src/sim/systems/fire';
import { territoryChanged } from '../src/sim/systems/territory';
import { step } from '../src/sim/tick';
import type { GameState } from '../src/sim/types';
import { addEntity } from '../src/sim/state';
import type { Shot } from '../src/sim/types';
import { cell, put, setup, stackOf } from './helpers';

const run = (state: GameState, ctx: SimContext, n: number) => {
  for (let i = 0; i < n; i++) step(state, ctx, []);
};
/** Ticks until `cond`, at most `max`. */
function until(state: GameState, ctx: SimContext, cond: () => boolean, max = 2000): number {
  for (let t = 0; t < max; t++) {
    if (cond()) return t;
    step(state, ctx, []);
  }
  return -1;
}
const LAND = ['. . . . .', '. . . . .', '. . . . .'];

function world(rows = LAND) {
  const w = setup(rows);
  put(w.state, w.ctx, 'outpost', 0, cell(0, 0)).hp = 150;
  territoryChanged(w.state, w.ctx);
  return w;
}

describe('burning (§9b)', () => {
  it('strength follows the share of max HP burned, in 10% steps from 10% to 50%', () => {
    const { ctx } = world();
    const f = newFire(0);
    const max = 200_000;
    expect(fireStrength(ctx, f, max)).toBe(10);
    f.dealt = 39_000; // 19.5%
    expect(fireStrength(ctx, f, max)).toBe(10);
    f.dealt = 40_000;
    expect(fireStrength(ctx, f, max)).toBe(20);
    f.dealt = 150_000; // 75%
    expect(fireStrength(ctx, f, max)).toBe(50);
  });

  it('a fire left alone burns any item down in about 20 s and leaves burnt debris that gives no wood', () => {
    for (const kind of ['workshop', 'factory'] as const) {
      const { ctx, state } = world();
      const s = put(state, ctx, kind, 0, cell(2, 1));
      s.hp = ctx.config.items[kind].hp;
      s.fire = newFire(-1);
      const ticks = until(state, ctx, () => !state.entities.includes(s));
      expect(ticks).toBeGreaterThan(195);
      expect(ticks).toBeLessThan(215);
      const i = idx(ctx, cell(2, 1))!;
      expect(state.debris[i]).toBe(ctx.config.items[kind].cost);
      expect(state.debrisBurnt[i]).toBe(true);
      // Clearing burnt debris gives nothing.
      state.players[0]!.hand.push('woodchopper');
      step(state, ctx, [{ type: 'place', player: 0, item: 'woodchopper', q: cell(2, 1).q, r: cell(2, 1).r }]);
      run(state, ctx, ctx.config.debris.clearS * ctx.config.tickRate + 1);
      expect(state.debris[i]).toBe(0);
      expect(stackOf(state, ctx, cell(2, 1))).toBe(0);
    }
  });

  it('fire hits on a burning item count as fire damage and speed it up', () => {
    const a = world();
    const b = world();
    const sa = put(a.state, a.ctx, 'workshop', 0, cell(3, 1));
    const sb = put(b.state, b.ctx, 'workshop', 0, cell(3, 1));
    sa.hp = sb.hp = 120;
    sa.fire = newFire(-1);
    sb.fire = newFire(-1);
    sb.fire.dealt = 36_000; // a 36-damage fire hit's worth (30% of 120)
    const ta = until(a.state, a.ctx, () => !a.state.entities.includes(sa));
    const tb = until(b.state, b.ctx, () => !b.state.entities.includes(sb));
    expect(tb).toBeLessThan(ta - 80);
  });

  it('at maximum it spreads to one adjacent hex with something on it, never to an empty one', () => {
    const { ctx, state } = world();
    const s = put(state, ctx, 'workshop', 0, cell(2, 1));
    s.hp = 120;
    const n = put(state, ctx, 'dock', 0, cell(3, 1)); // the only neighbour with something on it
    n.hp = 80;
    s.fire = newFire(0);
    expect(until(state, ctx, () => !!n.fire, 400)).toBeGreaterThan(140);
    expect(n.fire!.by).toBe(0);
    // Nothing else around caught.
    expect(state.entities.filter((e) => e.type === 'structure' && e.fire).length).toBe(2);
  });

  it('forests burn their wood; debris burns away and the hex is clear', () => {
    const { ctx, state } = world(['. . . . .', '. . . T .', '. . . . .']);
    const f = idx(ctx, cell(3, 1))!;
    state.forestFire[f] = newFire(0);
    expect(until(state, ctx, () => state.forestPool[f] === 0)).toBeGreaterThan(150);
    expect(state.forestFire[f]).toBeNull();
    const d = idx(ctx, cell(1, 2))!;
    state.debris[d] = 50;
    state.debrisFire[d] = newFire(0);
    expect(until(state, ctx, () => state.debris[d] === 0)).toBeGreaterThan(150);
    expect(state.debrisFire[d]).toBeNull();
  });

  it('a fire shot sets its target alight; Firestorm also lights the forest it lands on in a conflict zone', () => {
    const { ctx, state } = setup(['. . . . . . .', '. . . T . . .', '. . . . . . .'], undefined, 2);
    put(state, ctx, 'outpost', 0, cell(1, 1)).hp = 150;
    put(state, ctx, 'outpost', 1, cell(5, 1)).hp = 150;
    territoryChanged(state, ctx);
    const target = put(state, ctx, 'dock', 1, cell(3, 0));
    target.hp = 80;
    const shoot = (to: { q: number; r: number }, firestorm: boolean) =>
      addEntity<Shot>(state, {
        type: 'shot', kind: 'stone', owner: 0, fromQ: 0, fromR: 0, toQ: to.q, toR: to.r,
        targetId: target.id, damage: 20, fire: true, firestorm, flightTicks: 1, ticksLeft: 1,
      });
    shoot(target, false);
    step(state, ctx, []);
    expect(target.fire).toBeDefined();
    expect(target.fire!.dealt).toBeGreaterThanOrEqual(20_000); // the hit counts as fire damage
    const forest = idx(ctx, cell(3, 1))!;
    shoot(cell(3, 1), true);
    step(state, ctx, []);
    expect(state.forestFire[forest]).not.toBeNull();
  });
});
