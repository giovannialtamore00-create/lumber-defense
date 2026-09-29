// Docks catch floating wood and dispense it into an adjacent factory (DESIGN §6.6). A dock's wood is its hex's stack.
import { type SimContext, idx } from '../context';
import { structures } from '../state';
import type { GameState, Pile, Structure } from '../types';
import { deliverToFactory } from './economy';

/** Docks next to river hex `riverIdx`, in id order. */
function docksBeside(state: GameState, ctx: SimContext, riverIdx: number): Structure[] {
  const around = ctx.neighbourIdx[riverIdx]!;
  return structures(state).filter((s) => s.kind === 'dock' && around.includes(idx(ctx, s)!));
}

/**
 * A pile reaching a river hex is caught by any dock beside it (any player's dock catches any wood). A partly full dock
 * takes what fits and the rest floats on.
 */
export function catchPile(state: GameState, ctx: SimContext, pile: Pile): void {
  const riverIdx = idx(ctx, pile)!;
  for (const dock of docksBeside(state, ctx, riverIdx)) {
    if (pile.amount === 0) return;
    const d = idx(ctx, dock)!;
    const take = Math.min(ctx.rates.dockCapacity - state.stacks[d]!, pile.amount);
    if (take <= 0) continue;
    state.stacks[d]! += take;
    pile.amount -= take;
  }
}

/** Each dock next to a factory dispenses into it at the dispense rate. With several, the lowest-id factory. */
export function docksSystem(state: GameState, ctx: SimContext): void {
  const all = structures(state);
  for (const dock of all) {
    if (dock.kind !== 'dock') continue;
    const d = idx(ctx, dock)!;
    if (state.stacks[d] === 0) continue;
    const around = ctx.neighbourIdx[d]!;
    const factory = all.find((s) => s.kind === 'factory' && around.includes(idx(ctx, s)!));
    if (!factory) continue;
    const amount = Math.min(ctx.rates.dockDispense, state.stacks[d]!);
    state.stacks[d]! -= amount;
    deliverToFactory(state, factory, amount);
  }
}
