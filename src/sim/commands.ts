// Validate and apply player commands (ARCHITECTURE.md §6). An invalid command is ignored, the same on every client.
import type { SimContext } from './context';
import { MILLI } from './fixed';
import { distance } from './hex';
import { addEntity, structureAt } from './state';
import { carrierRouteError, dropOffs, isForest, placementError, territoryIndices } from './systems/placement';
import { recomputeCoverage } from './systems/territory';
import type { Carrier, Command, GameState, ItemKind, Structure, StructureKind } from './types';

export function applyCommand(state: GameState, ctx: SimContext, cmd: Command): void {
  const player = state.players[cmd.player];
  if (!player) return;

  switch (cmd.type) {
    case 'placeOutpost': {
      if (player.started || placementError(state, ctx, cmd.player, 'outpost', cmd.q, cmd.r)) return;
      addStructure(state, ctx, 'outpost', cmd.player, cmd.q, cmd.r);
      recomputeCoverage(state, ctx);
      player.started = true;
      placeStartingWoodchopper(state, ctx, cmd.player, cmd.q, cmd.r);
      player.hand.push('factory'); // factory in hand, already crafted (DESIGN §5)
      return;
    }
    case 'place': {
      const h = player.hand.indexOf(cmd.item);
      if (h < 0 || placementError(state, ctx, cmd.player, cmd.item, cmd.q, cmd.r)) return;
      player.hand.splice(h, 1);
      addStructure(state, ctx, cmd.item, cmd.player, cmd.q, cmd.r);
      if (cmd.item === 'outpost') recomputeCoverage(state, ctx);
      return;
    }
    case 'placeCarrier': {
      const h = player.hand.indexOf('carrier');
      if (h < 0 || carrierRouteError(state, ctx, cmd.player, cmd.aQ, cmd.bQ, cmd.r)) return;
      const drop = dropOffs(state, ctx, cmd.player, cmd.aQ, cmd.r).find((d) => d.q === cmd.bQ)!;
      player.hand.splice(h, 1);
      addEntity<Carrier>(state, {
        type: 'carrier',
        owner: cmd.player,
        r: cmd.r,
        aQ: cmd.aQ,
        bQ: cmd.bQ,
        riverQ: drop.riverQ,
        posQ: cmd.aQ * MILLI,
        phase: 'toA',
        load: 0,
        hp: ctx.config.items.carrier.hp,
      });
      return;
    }
    case 'devGive': {
      if (!ctx.allowDevCommands || !player.started) return;
      player.hand.push(cmd.item as ItemKind);
      return;
    }
  }
}

function addStructure(state: GameState, ctx: SimContext, kind: StructureKind, owner: number, q: number, r: number): Structure {
  return addEntity<Structure>(state, { type: 'structure', kind, owner, q, r, hp: ctx.config.items[kind].hp });
}

/**
 * The starting woodchopper appears on the free forest hex closest to the first outpost; ties go to the earlier hex
 * in map order (DESIGN §5).
 */
function placeStartingWoodchopper(state: GameState, ctx: SimContext, player: number, q: number, r: number): void {
  let best: { i: number; d: number } | null = null;
  for (const i of territoryIndices(ctx, q, r).sort((a, b) => a - b)) {
    const h = ctx.map.hexes[i]!;
    if (!isForest(state, i) || structureAt(state, h.q, h.r)) continue;
    const d = distance(h, { q, r });
    if (!best || d < best.d) best = { i, d };
  }
  if (!best) return;
  const h = ctx.map.hexes[best.i]!;
  addStructure(state, ctx, 'woodchopper', player, h.q, h.r);
}
