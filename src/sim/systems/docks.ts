// Docks catch floating wood and dispense it into an adjacent factory (DESIGN §6.6). A dock's wood is its hex's stack.
import { type SimContext, idx } from '../context';
import { structures } from '../state';
import type { GameState, Pile, Structure } from '../types';
import { MILLI, perTick, toMilli } from '../fixed';
import { distance } from '../hex';
import { upgradeValue } from '../upgrades';
import { deliverToFactory } from './economy';

/** Docks next to river hex `riverIdx`, in id order. */
function docksBeside(state: GameState, ctx: SimContext, riverIdx: number): Structure[] {
  const around = ctx.neighbourIdx[riverIdx]!;
  return structures(state).filter((s) => s.kind === 'dock' && around.includes(idx(ctx, s)!));
}

/**
 * A pile reaching a river hex meets every dock beside it (any player's dock catches any wood). Each dock catches half
 * the pile rounded down to whole wood, but at least 1 wood, and never more than fits; the rest floats on (DESIGN §6.6).
 */
export function catchPile(state: GameState, ctx: SimContext, pile: Pile): void {
  const riverIdx = idx(ctx, pile)!;
  for (const dock of docksBeside(state, ctx, riverIdx)) {
    if (pile.amount === 0) return;
    const d = idx(ctx, dock)!;
    const half = Math.floor((pile.amount * ctx.config.dock.catchPct) / 100 / MILLI) * MILLI;
    const catchable = Math.min(pile.amount, Math.max(ctx.config.dock.minCatch * MILLI, half));
    const take = Math.min(dockCapacity(state, ctx, dock.owner) - state.stacks[d]!, catchable);
    if (take <= 0) continue;
    state.stacks[d]! += take;
    pile.amount -= take;
  }
}

/** A dock's capacity (milli-wood), with its owner's Capacity upgrade (DESIGN §10.3). */
export function dockCapacity(state: GameState, ctx: SimContext, owner: number): number {
  return toMilli(upgradeValue(state, ctx, owner, 'dock', 'capacity', 'capacity', ctx.config.dock.capacity));
}

/**
 * Each dock next to a factory dispenses into it at the dispense rate. With several, the lowest-id factory. The
 * Dispense upgrade raises the rate, and its Chute level reaches a factory-mill up to 2 hexes away.
 */
export function docksSystem(state: GameState, ctx: SimContext): void {
  const all = structures(state);
  for (const dock of all) {
    if (dock.kind !== 'dock') continue;
    const d = idx(ctx, dock)!;
    if (state.stacks[d] === 0) continue;
    const range = upgradeValue(state, ctx, dock.owner, 'dock', 'dispense', 'feedRange', 1);
    const factory = all.find((s) => s.kind === 'factory' && distance(s, dock) <= range);
    if (!factory) continue;
    const rate = perTick(upgradeValue(state, ctx, dock.owner, 'dock', 'dispense', 'dispensePerS', ctx.config.dock.dispensePerSecond), ctx.config.tickRate);
    const amount = Math.min(rate, state.stacks[d]!);
    state.stacks[d]! -= amount;
    deliverToFactory(state, ctx, factory, amount);
  }
}
