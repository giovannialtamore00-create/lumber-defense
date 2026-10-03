// Carriers (DESIGN §6.4): go to A, take whatever is there (≥ 1 wood, up to capacity), go to B, drop, repeat. If A
// is empty they fetch the nearest wood on their row instead.
// They move only along their row. At a river drop-off the load falls into the river; at a factory it becomes the
// owner's wood.
import { MILLI, toMilli } from '../fixed';
import { upgradeValue } from '../upgrades';
import { type SimContext, idx } from '../context';
import { structureAt } from '../state';
import type { Carrier, GameState } from '../types';
import { deliverToFactory } from './economy';
import { bridgeAt, canCollectAt, rowPassable } from './placement';
import { isCoveredBy } from './territory';
import { spawnPile } from './river';

/** Moves the carrier towards `targetQ`; true once it's there. */
function moveTo(c: Carrier, targetQ: number, speed: number): boolean {
  const target = targetQ * MILLI;
  const delta = target - c.posQ;
  if (Math.abs(delta) <= speed) {
    c.posQ = target;
    return true;
  }
  c.posQ += Math.sign(delta) * speed;
  return false;
}

/**
 * The nearest hex on the carrier's row with at least 1 wood, inside its owner's territory and reachable without
 * crossing rock or water (DESIGN §6.4). Ties go west first. Floating wood (e.g. behind a dam) isn't a stack.
 */
function nearestWood(state: GameState, ctx: SimContext, c: Carrier): number | null {
  const width = ctx.map.width + ctx.map.height; // enough to cover any row, whatever its q offset
  for (let d = 1; d <= width; d++) {
    for (const q of [c.aQ - d, c.aQ + d]) {
      const i = idx(ctx, { q, r: c.r });
      if (i === undefined || state.stacks[i]! < MILLI || !isCoveredBy(state, i, c.owner) || !canCollectAt(state, ctx, i, c.owner)) continue;
      if (rowPassable(state, ctx, c.r, c.aQ, q, c.owner)) return q;
    }
  }
  return null;
}

/**
 * Speed (milli-hex per tick) of a carrier: the base, changed by its owner's Capacity (slower) and Mobility (faster)
 * upgrades, and by a Causeway boost while it lasts (DESIGN §10.3).
 */
export function carrierSpeed(state: GameState, ctx: SimContext, c: Carrier): number {
  const cap = upgradeValue(state, ctx, c.owner, 'carrier', 'capacity', 'speedPct', 0);
  const mob = upgradeValue(state, ctx, c.owner, 'carrier', 'mobility', 'speedPct', 0);
  const boost = c.boostTicks > 0 ? upgradeValue(state, ctx, c.owner, 'bridge', 'causeway', 'boostPct', 0) : 0;
  return Math.max(1, Math.round((ctx.rates.carrierSpeed * (100 + cap) * (100 + mob) * (100 + boost)) / 1_000_000));
}

export function carrierCapacity(state: GameState, ctx: SimContext, owner: number): number {
  return toMilli(upgradeValue(state, ctx, owner, 'carrier', 'capacity', 'capacity', ctx.config.carrier.capacity));
}

export function carriersSystem(state: GameState, ctx: SimContext): void {
  const carriers = state.entities.filter((e): e is Carrier => e.type === 'carrier');
  for (const c of carriers) {
    // Causeway: crossing one of your own bridges gives a speed boost for a while.
    if (c.boostTicks > 0) c.boostTicks--;
    const here = idx(ctx, { q: Math.round(c.posQ / MILLI), r: c.r });
    const b = here === undefined ? undefined : bridgeAt(state, ctx, here);
    if (b && b.owner === c.owner) {
      const secs = upgradeValue(state, ctx, c.owner, 'bridge', 'causeway', 'boostS', 0);
      if (secs > 0) c.boostTicks = Math.round(secs * ctx.config.tickRate);
    }
    const speed = carrierSpeed(state, ctx, c);
    if (c.phase === 'toA') {
      if (!moveTo(c, c.pickupQ, speed)) continue;
      const at = idx(ctx, { q: c.pickupQ, r: c.r })!;
      if (state.stacks[at]! < MILLI) {
        // No wood here: from A, look for the nearest wood on the row; elsewhere, head back to A.
        c.pickupQ = c.pickupQ === c.aQ ? (nearestWood(state, ctx, c) ?? c.aQ) : c.aQ;
        continue;
      }
      const take = Math.min(carrierCapacity(state, ctx, c.owner), state.stacks[at]!);
      state.stacks[at]! -= take;
      c.load = take;
      c.phase = 'toB';
    }
    if (c.phase === 'toB') {
      if (!moveTo(c, c.bQ, speed)) continue;
      if (c.riverQ !== null) {
        spawnPile(state, ctx, c.riverQ, c.r, c.load);
      } else {
        const factory = structureAt(state, c.bQ, c.r);
        if (factory?.kind !== 'factory') continue; // factory gone: wait with the load
        deliverToFactory(state, ctx, factory, c.load);
      }
      c.load = 0;
      c.phase = 'toA';
      c.pickupQ = c.aQ; // back to A, and repeat
    }
  }
}
