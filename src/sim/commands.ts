// Validate and apply player commands (ARCHITECTURE.md §6). An invalid command is ignored, the same on every client.
import type { SimContext } from './context';
import { MILLI } from './fixed';
import { distance } from './hex';
import { idx } from './context';
import { addEntity, isOwnable, structureAt } from './state';
import { startResearch, upgradeError } from './upgrades';
import { craftCost, craftError } from './systems/crafting';
import { dismantle, maxHp, surrender } from './systems/combat';
import { carrierRouteError, dropOffs, isForest, placementError, territoryIndices } from './systems/placement';
import { territoryChanged } from './systems/territory';
import type { Carrier, Catapult, Command, ForestGuard, GameState, StoneCutter, Structure, StructureKind } from './types';

export function applyCommand(state: GameState, ctx: SimContext, cmd: Command): void {
  const player = state.players[cmd.player];
  if (!player) return;
  if (cmd.type === 'takeControl') {
    player.bot = false; // step back in, at whatever progress the bot has reached (DESIGN §5)
    return;
  }
  if (player.bot) return; // the bot has this slot
  if (player.defeated || state.phase === 'over') return; // out of the game, or the match has ended (DESIGN §11)
  if (cmd.type === 'setPlaytest') {
    state.playtest = cmd.on === true; // any player, any time (DESIGN §7.5)
    return;
  }
  if (state.phase === 'start' && cmd.type !== 'placeOutpost') return; // only first outposts during starting turns

  switch (cmd.type) {
    case 'placeOutpost': {
      if (player.started || placementError(state, ctx, cmd.player, 'outpost', cmd.q, cmd.r)) return;
      addStructure(state, ctx, 'outpost', cmd.player, cmd.q, cmd.r).radius = ctx.config.outpost.firstTerritoryRadius;
      territoryChanged(state, ctx);
      player.started = true;
      placeStartingWoodchopper(state, ctx, cmd.player, cmd.q, cmd.r);
      player.hand.push('factory'); // factory in hand, already crafted (DESIGN §5)
      return;
    }
    case 'place': {
      const h = player.hand.indexOf(cmd.item);
      if (h < 0 || placementError(state, ctx, cmd.player, cmd.item, cmd.q, cmd.r)) return;
      player.hand.splice(h, 1);
      const s = addStructure(state, ctx, cmd.item, cmd.player, cmd.q, cmd.r);
      if (cmd.item === 'outpost') {
        s.radius = ctx.config.outpost.territoryRadius;
        territoryChanged(state, ctx);
      }
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
        pickupQ: cmd.aQ,
        posQ: cmd.aQ * MILLI,
        phase: 'toA',
        load: 0,
        hp: ctx.config.items.carrier.hp,
        boostTicks: 0,
      });
      return;
    }
    case 'placeGuard': {
      const h = player.hand.indexOf('forestGuard');
      if (h < 0 || placementError(state, ctx, cmd.player, 'forestGuard', cmd.q, cmd.r)) return;
      player.hand.splice(h, 1);
      addEntity<ForestGuard>(state, {
        type: 'guard',
        owner: cmd.player,
        homeQ: cmd.q,
        homeR: cmd.r,
        q: cmd.q,
        r: cmd.r,
        toQ: null,
        toR: null,
        moveTicks: 0,
        attendTicks: 0,
        afforested: 0,
        hp: ctx.config.items.forestGuard.hp,
      });
      return;
    }
    case 'placeCutter': {
      const h = player.hand.indexOf('stoneCutter');
      if (h < 0 || placementError(state, ctx, cmd.player, 'stoneCutter', cmd.q, cmd.r)) return;
      player.hand.splice(h, 1);
      addEntity<StoneCutter>(state, { type: 'cutter', owner: cmd.player, q: cmd.q, r: cmd.r, hp: ctx.config.items.stoneCutter.hp });
      return;
    }
    case 'placeCatapult': {
      const h = player.hand.indexOf('catapult');
      if (h < 0 || placementError(state, ctx, cmd.player, 'catapult', cmd.q, cmd.r)) return;
      player.hand.splice(h, 1);
      addEntity<Catapult>(state, {
        type: 'catapult',
        owner: cmd.player,
        q: cmd.q,
        r: cmd.r,
        toQ: null,
        toR: null,
        moveTicks: 0,
        targetId: null,
        thinkTicks: 0,
        fireTicks: 0,
        aimQ: cmd.q,
        aimR: cmd.r - 1,
        hp: ctx.config.items.catapult.hp,
      });
      return;
    }
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
      if (e.type === 'structure' && e.kind === 'outpost') return;
      dismantle(state, ctx, e);
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
      player.wood -= craftCost(state, ctx, cmd.player, cmd.item);
      player.queue.push({ item: cmd.item, totalTicks: 0, doneTicks: 0 });
      return;
    }
  }
}

function addStructure(state: GameState, ctx: SimContext, kind: StructureKind, owner: number, q: number, r: number): Structure {
  const s = addEntity<Structure>(state, { type: 'structure', kind, owner, q, r, hp: 0 });
  s.hp = maxHp(state, ctx, s); // with Improved Frames
  return s;
}

/**
 * The starting woodchopper appears on the free forest hex closest to the first outpost; ties go to the earlier hex
 * in map order (DESIGN §5).
 */
function placeStartingWoodchopper(state: GameState, ctx: SimContext, player: number, q: number, r: number): void {
  let best: { i: number; d: number } | null = null;
  for (const i of territoryIndices(ctx, q, r, ctx.config.outpost.firstTerritoryRadius).sort((a, b) => a - b)) {
    const h = ctx.map.hexes[i]!;
    if (!isForest(state, i) || structureAt(state, h.q, h.r)) continue;
    const d = distance(h, { q, r });
    if (!best || d < best.d) best = { i, d };
  }
  if (!best) return;
  const h = ctx.map.hexes[best.i]!;
  addStructure(state, ctx, 'woodchopper', player, h.q, h.r);
}
