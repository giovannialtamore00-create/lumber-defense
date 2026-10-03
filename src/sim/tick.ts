// One simulation tick (ARCHITECTURE.md §6): commands, then the systems in a fixed order.
import { applyCommand } from './commands';
import type { SimContext } from './context';
import { carriersSystem } from './systems/carriers';
import { combatSystem } from './systems/combat';
import { craftingSystem } from './systems/crafting';
import { damsSystem } from './systems/dams';
import { diggingSystem, stoneCuttingSystem } from './systems/digging';
import { incomeSystem } from './systems/income';
import { docksSystem } from './systems/docks';
import { forestSystem } from './systems/forest';
import { forestGuardSystem, saplingSystem } from './systems/forestGuard';
import { riverSystem } from './systems/river';
import { startTurnsSystem } from './systems/startTurns';
import type { Command, GameState } from './types';
import { researchSystem } from './upgrades';

/** Advances `state` by one tick, in place. */
export function step(state: GameState, ctx: SimContext, commands: readonly Command[]): void {
  if (state.phase === 'over') return; // the match has ended (DESIGN §11)
  for (const cmd of commands) applyCommand(state, ctx, cmd);
  if (state.phase === 'start') {
    // Starting turns: the game clock doesn't run yet (DESIGN §5).
    startTurnsSystem(state, ctx);
    state.tick++;
    return;
  }
  craftingSystem(state, ctx);
  researchSystem(state, ctx);
  incomeSystem(state, ctx);
  forestSystem(state, ctx);
  forestGuardSystem(state, ctx);
  saplingSystem(state, ctx);
  carriersSystem(state, ctx);
  riverSystem(state, ctx);
  docksSystem(state, ctx);
  damsSystem(state, ctx);
  diggingSystem(state, ctx);
  stoneCuttingSystem(state, ctx);
  combatSystem(state, ctx);
  // economy: factory intake happens inside carriers/docks via deliverToFactory.
  // territory: recomputed whenever outposts are added, destroyed or grow.
  state.tick++;
}
