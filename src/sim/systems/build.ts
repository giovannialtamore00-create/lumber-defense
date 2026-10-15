// Putting a finished item on the map: from the hand, or when a construction site finishes (DESIGN §7.2, §7.3).
import type { SimContext } from '../context';
import { MILLI } from '../fixed';
import { addEntity } from '../state';
import type { Carrier, Catapult, ForestGuard, GameState, ItemKind, Site, StoneCutter, Structure, StructureKind } from '../types';
import { maxHp } from './combat';
import { carrierRouteError, dropOffs, placementError } from './placement';
import { territoryChanged } from './territory';

export function addStructure(state: GameState, ctx: SimContext, kind: StructureKind, owner: number, q: number, r: number): Structure {
  const s = addEntity<Structure>(state, { type: 'structure', kind, owner, q, r, hp: 0 });
  s.hp = maxHp(state, ctx, s); // with Improved Frames
  return s;
}

/** Why `item` can't go on `site` right now, or null. */
export function siteError(state: GameState, ctx: SimContext, player: number, item: ItemKind, site: Site): string | null {
  if (item === 'carrier') return site.bQ === undefined ? 'no drop-off' : carrierRouteError(state, ctx, player, site.q, site.bQ, site.r);
  return placementError(state, ctx, player, item, site.q, site.r);
}

/** Puts `item` on `site` if it is still legal there; false if not (nothing changes then). */
export function placeItem(state: GameState, ctx: SimContext, player: number, item: ItemKind, site: Site): boolean {
  if (siteError(state, ctx, player, item, site)) return false;
  const { q, r } = site;
  const p = state.players[player]!;
  if (item === 'carrier') {
    const drop = dropOffs(state, ctx, player, q, r).find((d) => d.q === site.bQ)!;
    p.startCarrierPending = false;
    addEntity<Carrier>(state, {
      type: 'carrier',
      owner: player,
      r,
      aQ: q,
      bQ: site.bQ!,
      riverQ: drop.riverQ,
      pickupQ: q,
      posQ: q * MILLI,
      phase: 'toA',
      load: 0,
      hp: ctx.config.items.carrier.hp,
      boostTicks: 0,
    });
  } else if (item === 'forestGuard') {
    addEntity<ForestGuard>(state, {
      type: 'guard',
      owner: player,
      homeQ: q,
      homeR: r,
      q,
      r,
      toQ: null,
      toR: null,
      moveTicks: 0,
      attendTicks: 0,
      afforested: 0,
      hp: ctx.config.items.forestGuard.hp,
    });
  } else if (item === 'stoneCutter') {
    addEntity<StoneCutter>(state, { type: 'cutter', owner: player, q, r, hp: ctx.config.items.stoneCutter.hp });
  } else if (item === 'catapult') {
    addEntity<Catapult>(state, {
      type: 'catapult',
      owner: player,
      q,
      r,
      toQ: null,
      toR: null,
      moveTicks: 0,
      targetId: null,
      thinkTicks: 0,
      fireTicks: 0,
      aimQ: q,
      aimR: r - 1,
      hp: ctx.config.items.catapult.hp,
    });
  } else {
    const s = addStructure(state, ctx, item as StructureKind, player, q, r);
    if (item === 'outpost') {
      s.radius = ctx.config.outpost.territoryRadius;
      territoryChanged(state, ctx);
    }
  }
  return true;
}
