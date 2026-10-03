// Burning (DESIGN §9b). A fire's strength is the share of max HP it has already burned, in 10% steps (10% right
// after catching fire, up to 50% = maximum), and it burns at a rate proportional to its strength (maximum: 10% of
// max HP per second). At maximum it spreads to one random adjacent hex with something on it, then every 20 s.
// Items, forests (their wood is their HP) and debris (its wood value is its HP) burn the same way.
import { type SimContext, idx } from '../context';
import { MILLI } from '../fixed';
import type { Hex } from '../hex';
import { hexOf, isOwnable, structureAt } from '../state';
import { nextInt } from '../rng';
import type { Fire, GameState, Ownable } from '../types';
import { destroy, maxHp } from './combat';

export function newFire(by: number): Fire {
  return { dealt: 0, acc: 0, by, spreadTicks: 0, maxed: false };
}

/** Strength in percent for a fire that has burned `dealt` out of `maxMilli`. */
export function fireStrength(ctx: SimContext, fire: Fire, maxMilli: number): number {
  const f = ctx.config.fire;
  const burnedPct = maxMilli > 0 ? Math.floor((fire.dealt * 100) / maxMilli) : f.maxStrengthPct;
  const step = Math.floor(burnedPct / f.stepPct) * f.stepPct;
  return Math.max(f.startStrengthPct, Math.min(f.maxStrengthPct, step));
}

/** Fire damage per tick (milli) at a strength: proportional, reaching maxDamagePctPerS of max HP at maximum. */
function burnPerTick(ctx: SimContext, maxMilli: number, strength: number): number {
  const f = ctx.config.fire;
  return Math.floor((maxMilli * strength * f.maxDamagePctPerS) / (f.maxStrengthPct * 100 * ctx.config.tickRate));
}

/** Can a spreading fire catch something on hex i? */
function catchable(state: GameState, ctx: SimContext, i: number): boolean {
  const h = ctx.map.hexes[i]!;
  const s = structureAt(state, h.q, h.r);
  if (s && !s.fire) return true;
  if (unitsAt(state, h).some((u) => !u.fire)) return true;
  if (state.forestPool[i]! > 0 && !state.forestFire[i]) return true;
  return state.debris[i]! > 0 && !state.debrisBurnt[i] && !state.debrisFire[i];
}

function unitsAt(state: GameState, h: Hex): Ownable[] {
  return state.entities.filter((e): e is Ownable => isOwnable(e) && e.type !== 'structure' && hexOf(e).q === h.q && hexOf(e).r === h.r);
}

/** Sets one thing on hex i alight: the structure, else a unit, else the forest, else debris (DESIGN §9b). */
export function igniteHex(state: GameState, ctx: SimContext, i: number, by: number): void {
  const h = ctx.map.hexes[i]!;
  const s = structureAt(state, h.q, h.r);
  if (s && !s.fire) {
    s.fire = newFire(by);
    return;
  }
  const unit = unitsAt(state, h).find((u) => !u.fire);
  if (unit) {
    unit.fire = newFire(by);
    return;
  }
  if (state.forestPool[i]! > 0 && !state.forestFire[i]) {
    state.forestFire[i] = newFire(by);
    return;
  }
  if (state.debris[i]! > 0 && !state.debrisBurnt[i] && !state.debrisFire[i]) state.debrisFire[i] = newFire(by);
}

/** A fire at maximum spreads to one random adjacent hex that has something to catch (seeded RNG). */
function spread(state: GameState, ctx: SimContext, from: number, fire: Fire): void {
  if (!fire.maxed) {
    fire.maxed = true;
    fire.spreadTicks = 0;
  }
  if (--fire.spreadTicks > 0) return;
  fire.spreadTicks = Math.round(ctx.config.fire.spreadEveryS * ctx.config.tickRate);
  const options = ctx.neighbourIdx[from]!.filter((n) => catchable(state, ctx, n));
  if (options.length === 0) return;
  igniteHex(state, ctx, options[nextInt(state.rng, options.length)]!, fire.by);
}

/** Burns one fire for a tick; returns whole HP (or wood) to take off. */
function burn(ctx: SimContext, fire: Fire, maxMilli: number): number {
  const dmg = burnPerTick(ctx, maxMilli, fireStrength(ctx, fire, maxMilli));
  fire.dealt += dmg;
  fire.acc += dmg;
  const whole = Math.floor(fire.acc / MILLI);
  fire.acc -= whole * MILLI;
  return whole;
}

const atMax = (ctx: SimContext, fire: Fire, maxMilli: number) => fireStrength(ctx, fire, maxMilli) >= ctx.config.fire.maxStrengthPct;

export function fireSystem(state: GameState, ctx: SimContext): void {
  // Burning items, in id order.
  for (const e of state.entities.filter((x): x is Ownable => isOwnable(x) && !!x.fire)) {
    const fire = e.fire!;
    const maxMilli = maxHp(state, ctx, e) * MILLI;
    const whole = burn(ctx, fire, maxMilli);
    if (whole > 0) {
      const p = state.players[fire.by];
      if (p) p.stats.damageDealt += Math.min(whole, Math.max(0, e.hp));
      e.hp -= whole;
    }
    if (e.hp <= 0) {
      destroy(state, ctx, e, fire.by, true);
      continue;
    }
    if (atMax(ctx, fire, maxMilli)) spread(state, ctx, idx(ctx, hexOf(e))!, fire);
  }

  // Burning forests and debris, in hex order.
  for (let i = 0; i < ctx.map.hexes.length; i++) {
    const ff = state.forestFire[i];
    if (ff) {
      const maxMilli = ctx.config.forest.woodPool * MILLI;
      const dmg = burnPerTick(ctx, maxMilli, fireStrength(ctx, ff, maxMilli));
      ff.dealt += dmg;
      state.forestPool[i] = Math.max(0, state.forestPool[i]! - dmg); // the forest's wood is its HP
      if (state.forestPool[i] === 0) state.forestFire[i] = null;
      else if (atMax(ctx, ff, maxMilli)) spread(state, ctx, i, ff);
    }
    const df = state.debrisFire[i];
    if (df) {
      const maxMilli = state.debris[i]! * MILLI;
      df.dealt += burnPerTick(ctx, maxMilli, fireStrength(ctx, df, maxMilli));
      if (df.dealt >= maxMilli) {
        state.debris[i] = 0; // burned away: the hex is clear
        state.debrisFire[i] = null;
      } else if (atMax(ctx, df, maxMilli)) spread(state, ctx, i, df);
    }
  }
}
