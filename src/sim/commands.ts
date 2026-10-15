// Validate and apply player commands (ARCHITECTURE.md §6). An invalid command is ignored, the same on every client.
import type { SimContext } from './context';
import { MILLI } from './fixed';
import { distance } from './hex';
import { isOutpostLike, isOwnable, structureAt } from './state';
import { startResearch, upgradeError } from './upgrades';
import { craftCost, craftError } from './systems/crafting';
import { startDismantle, surrender } from './systems/combat';
import { addStructure, placeItem, siteError } from './systems/build';
import { isForest, placementError, territoryIndices } from './systems/placement';
import { territoryChanged } from './systems/territory';
import type { Command, GameState, ItemKind, Site } from './types';

/** The item each unit placement command takes from the hand. */
const HAND_ITEM: Partial<Record<Command['type'], ItemKind>> = { placeCarrier: 'carrier', placeGuard: 'forestGuard', placeCutter: 'stoneCutter', placeCatapult: 'catapult' };

export function applyCommand(state: GameState, ctx: SimContext, cmd: Command): void {
  const player = state.players[cmd.player];
  if (!player) return;
  if (cmd.type === 'takeControl') {
    player.bot = false; // step back in, at whatever progress the bot has reached (DESIGN §5)
    return;
  }
  if (player.bot !== (cmd.bot === true)) return; // the bot has this slot, or the player has it back
  if (player.defeated || state.phase === 'over') return; // out of the game, or the match has ended (DESIGN §11)
  if (cmd.type === 'setPlaytest') {
    state.playtest = cmd.on === true; // any player, any time (DESIGN §7.5)
    return;
  }
  if (state.phase === 'start' && cmd.type !== 'placeOutpost') return; // only first outposts during starting turns

  switch (cmd.type) {
    case 'placeOutpost': {
      if (player.started || placementError(state, ctx, cmd.player, 'castle', cmd.q, cmd.r, cmd.bot === true)) return;
      addStructure(state, ctx, 'castle', cmd.player, cmd.q, cmd.r).radius = ctx.config.castle.territoryRadius;
      territoryChanged(state, ctx);
      player.started = true;
      player.startCarrierPending = true;
      placeStartingWoodchopper(state, ctx, cmd.player, cmd.q, cmd.r);
      player.hand.push(...(ctx.config.castle.startHand as ItemKind[])); // factory, dock and carrier in hand, free and optional (DESIGN §5)
      return;
    }
    case 'place':
    case 'placeCarrier':
    case 'placeGuard':
    case 'placeCutter':
    case 'placeCatapult': {
      // An item already in hand (start kit, warehouse) goes straight onto the map.
      const item = cmd.type === 'place' ? cmd.item : HAND_ITEM[cmd.type]!;
      const site: Site = cmd.type === 'placeCarrier' ? { q: cmd.aQ, r: cmd.r, bQ: cmd.bQ } : { q: cmd.q, r: cmd.r };
      const h = player.hand.indexOf(item);
      if (h >= 0 && placeItem(state, ctx, cmd.player, item, site)) player.hand.splice(h, 1);
      return;
    }
    case 'setStance':
      if (cmd.stance === 'conquest' || cmd.stance === 'destruction' || cmd.stance === 'peaceful') player.stance = cmd.stance;
      return;
    case 'surrender':
      if (state.phase === 'running') surrender(state, ctx, cmd.player);
      return;
    case 'store': {
      // Bin the item in hand into the warehouse (DESIGN §7.3b).
      const item = player.hand.shift();
      if (item) player.warehouse.push(item);
      return;
    }
    case 'retrieve': {
      // Pick a warehouse item back up: it becomes the next item to place.
      if (!Number.isInteger(cmd.index) || cmd.index < 0 || cmd.index >= player.warehouse.length) return;
      player.hand.unshift(player.warehouse.splice(cmd.index, 1)[0]!);
      return;
    }
    case 'dismantle': {
      // Dismantle one of your own structures (not outposts) or units; half its cost stays where it stood, plus
      // whatever a carrier was carrying (DESIGN §7.3c).
      const e = state.entities.find((x) => x.id === cmd.id);
      if (!e || !isOwnable(e) || e.owner !== cmd.player) return;
      if (e.type === 'structure' && isOutpostLike(e.kind)) return;
      startDismantle(state, ctx, e); // takes as long as crafting it (DESIGN §7.3c)
      return;
    }
    case 'buyUpgrade': {
      if (upgradeError(state, ctx, cmd.player, cmd.upgradeType, cmd.path)) return;
      startResearch(state, ctx, cmd.player, cmd.upgradeType, cmd.path);
      return;
    }
    case 'give': {
      // Trading (DESIGN §7.3d): whole wood, to another player, up to what you have.
      const to = state.players[cmd.to];
      const amount = cmd.amount * MILLI;
      if (!to || cmd.to === cmd.player || !Number.isInteger(cmd.amount) || cmd.amount < 1 || amount > player.wood) return;
      player.wood -= amount;
      to.wood += amount;
      return;
    }
    case 'craft': {
      if (craftError(state, ctx, cmd.player, cmd.item)) return;
      // With a site: pay, and a construction site appears there (DESIGN §7.2). Without: the item goes to the hand.
      const site: Site | undefined = cmd.site && (cmd.item === 'carrier' ? { q: cmd.site.q, r: cmd.site.r, bQ: cmd.site.bQ } : { q: cmd.site.q, r: cmd.site.r });
      if (site && siteError(state, ctx, cmd.player, cmd.item, site)) return;
      const cost = craftCost(state, ctx, cmd.player, cmd.item);
      player.wood -= cost;
      player.stats.woodSpent += cost;
      player.queue.push({ item: cmd.item, totalTicks: 0, doneTicks: 0, paid: cost, ...(site ? { site } : {}) });
      return;
    }
    case 'cancelCraft': {
      // Cancel a construction site: the full price comes back (DESIGN §7.2).
      const job = Number.isInteger(cmd.index) ? player.queue[cmd.index] : undefined;
      if (!job?.site) return;
      player.queue.splice(cmd.index, 1);
      player.wood += job.paid;
      player.stats.woodSpent -= job.paid;
      return;
    }
  }
}

/**
 * The starting woodchopper appears on the free forest hex closest to the first outpost; ties go to the earlier hex
 * in map order (DESIGN §5).
 */
function placeStartingWoodchopper(state: GameState, ctx: SimContext, player: number, q: number, r: number): void {
  let best: { i: number; d: number } | null = null;
  for (const i of territoryIndices(ctx, q, r, ctx.config.castle.territoryRadius).sort((a, b) => a - b)) {
    const h = ctx.map.hexes[i]!;
    if (!isForest(state, i) || structureAt(state, h.q, h.r)) continue;
    const d = distance(h, { q, r });
    if (!best || d < best.d) best = { i, d };
  }
  if (!best) return;
  const h = ctx.map.hexes[best.i]!;
  addStructure(state, ctx, 'woodchopper', player, h.q, h.r);
}
