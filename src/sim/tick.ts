// One simulation tick (ARCHITECTURE.md §6): commands, then the systems in a fixed order.
// Systems not built yet (crafting, combat, victory) slot into this order in later milestones.
import { applyCommand } from './commands';
import type { SimContext } from './context';
import { carriersSystem } from './systems/carriers';
import { docksSystem } from './systems/docks';
import { forestSystem } from './systems/forest';
import { riverSystem } from './systems/river';
import type { Command, GameState } from './types';

/** Advances `state` by one tick, in place. */
export function step(state: GameState, ctx: SimContext, commands: readonly Command[]): void {
  for (const cmd of commands) applyCommand(state, ctx, cmd);
  forestSystem(state, ctx);
  carriersSystem(state, ctx);
  riverSystem(state, ctx);
  docksSystem(state, ctx);
  // economy: factory intake happens inside carriers/docks via deliverToFactory.
  // territory: recomputed by the commands that add outposts.
  state.tick++;
}
