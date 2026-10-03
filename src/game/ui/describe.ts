// What the hover pop-up says about an item (DESIGN §12): its name, its upgrade levels and a very short description of
// what it does right now, with live numbers (upgrades included). Read-only: everything comes from the sim.
import { wholeUnits } from '../../sim/fixed';
import type { Hex } from '../../sim/hex';
import { hexOf, kindOf } from '../../sim/state';
import { isCoveredBy } from '../../sim/systems/territory';
import { maxHp } from '../../sim/systems/combat';
import { craftReductionBp, watermills } from '../../sim/systems/crafting';
import { carrierCapacity } from '../../sim/systems/carriers';
import { dockCapacity } from '../../sim/systems/docks';
import { isWorkingBridge } from '../../sim/systems/placement';
import { type ItemKind, NEUTRAL, type Ownable } from '../../sim/types';
import { damReliefBp } from '../../sim/water';
import { typeIndex, upgradeValue } from '../../sim/upgrades';
import type { SimRunner } from '../simRunner';
import { ITEM_NAMES } from './items';

export type Thing = Ownable;
export { hexOf, kindOf };

/**
 * The item on a hex: the structure if there is one, else a unit. Carriers often wait on their pickup's structure, so
 * structures come first; a unit gets the pop-up wherever it stands on a hex without one.
 */
export function thingAt(runner: SimRunner, hex: Hex): Thing | null {
  const all = runner.state.entities;
  const s = all.find((e) => e.type === 'structure' && e.q === hex.q && e.r === hex.r);
  if (s && s.type === 'structure') return s;
  const unit = all.find(
    (e): e is Ownable => (e.type === 'carrier' || e.type === 'guard' || e.type === 'cutter' || e.type === 'catapult') && hexOf(e).q === hex.q && hexOf(e).r === hex.r,
  );
  return unit ?? null;
}

/** Can `player` dismantle this (their own, and not an outpost)? */
export function canDismantle(e: Thing, player: number): boolean {
  return e.owner === player && !(e.type === 'structure' && e.kind === 'outpost');
}

export function refundOf(runner: SimRunner, e: Thing): number {
  const { config } = runner.ctx;
  return (config.items[kindOf(e)].cost * config.hammer.refundPct) / 100 + (e.type === 'carrier' ? wholeUnits(e.load) : 0);
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

/** "Output 2 · Log Slide 1", or "lv 1" with no upgrades. */
function levels(runner: SimRunner, owner: number, kind: ItemKind): string {
  const { ctx, state } = runner;
  const t = typeIndex(ctx, kind);
  const prog = state.players[owner]?.upgrades[t];
  const type = ctx.upgrades.types[t];
  if (!prog || !type) return 'lv 1';
  const tags = type.paths.map((p, k) => (prog.levels[k as 0 | 1] > 0 ? `${p.name} ${prog.levels[k as 0 | 1]}` : '')).filter(Boolean);
  return tags.length ? tags.join(' · ') : 'lv 1';
}

/** Title line and a very short "what it does" line. */
export function describe(runner: SimRunner, e: Thing): { title: string; action: string } {
  const { ctx, state } = runner;
  const kind = kindOf(e);
  const up = (path: string, key: string, base: number) => upgradeValue(state, ctx, e.owner, kind, path, key, base);
  const title = `${ITEM_NAMES[kind]} · ${e.owner === NEUTRAL ? 'neutral' : levels(runner, e.owner, kind)} · HP ${Math.max(0, e.hp)}/${maxHp(state, ctx, e)}`;
  const i = ctx.indexOf.get(`${hexOf(e).q},${hexOf(e).r}`)!;
  let action = '';
  switch (kind) {
    case 'outpost':
      action = `claims territory, radius ${(e.type === 'structure' ? (e.radius ?? ctx.config.outpost.territoryRadius) : 0) + up('reach', 'radiusBonus', 0)}`;
      break;
    case 'factory': {
      const mills = e.type === 'structure' ? watermills(state, ctx, e).length : 0;
      action = `makes wood yours · ${mills} watermill${mills === 1 ? '' : 's'} · all crafting −${(craftReductionBp(state, ctx, e.owner) / 100).toFixed(1)}%`;
      break;
    }
    case 'dock':
      action = `holds ${wholeUnits(state.stacks[i]!)}/${wholeUnits(dockCapacity(state, ctx, e.owner))} wood · feeds ${fmt(up('dispense', 'dispensePerS', ctx.config.dock.dispensePerSecond))} wood/s`;
      break;
    case 'woodchopper': {
      const slide = up('logSlide', 'slidePerS', 0);
      action = `cuts ${fmt(up('output', 'woodPerS', ctx.config.woodchopper.woodPerSecond))} wood/s${slide ? ` · slides ${fmt(slide)}/s into the river` : ''}`;
      break;
    }
    case 'bridge':
      action = isWorkingBridge(state, ctx, i) ? 'working: wheeled units cross here' : 'half bridge: needs more pieces to reach land';
      break;
    case 'dam': {
      const relief = damReliefBp(state, ctx, i);
      action = `stops floating wood${relief > 0 ? ` · pressure −${Math.round(relief / 100)}%` : ''}`;
      break;
    }
    case 'workshop': {
      const r = state.players[e.owner]?.research[0];
      action = r ? `researching ${ctx.upgrades.types[r.type]!.paths[r.path]!.name} ${r.level}` : 'researches upgrades (Workshop tab)';
      break;
    }
    case 'excavator': {
      const left = Math.ceil(ctx.config.excavator.digS - ((e.type === 'structure' ? e.workTicks : 0) ?? 0) / ctx.config.tickRate);
      action = `digging · ${left} s left, then water can flow here`;
      break;
    }
    case 'stoneCutter': {
      const left = Math.ceil((ctx.config.stoneCutter.secondsPerRock * ctx.config.tickRate - state.rockWork[i]!) / ctx.config.tickRate);
      const at = hexOf(e);
      const crew = state.entities.filter((x) => x.type === 'cutter' && x.q === at.q && x.r === at.r).length;
      action = `cutting this rock · ${crew} cutter${crew === 1 ? '' : 's'} · about ${Math.ceil(left / crew)} s to 1 stone`;
      break;
    }
    case 'catapult': {
      if (e.type !== 'catapult') break;
      const target = state.entities.find((x) => x.id === e.targetId);
      const range = up('range', 'range', ctx.config.catapult.range);
      action = !isCoveredBy(state, i, e.owner)
        ? 'outside your territory: driving back'
        : target && target.type !== 'pile' && target.type !== 'shot'
          ? `attacking a ${ITEM_NAMES[kindOf(target)].toLowerCase()} · range ${range}`
          : `no target in sight · range ${range}`;
      break;
    }
    case 'carrier':
      action = e.type === 'carrier' ? `carries ${wholeUnits(e.load)}/${wholeUnits(carrierCapacity(state, ctx, e.owner))} wood along its row` : '';
      break;
    case 'forestGuard':
      action = `regrows spent forests around it · ${fmt(up('growth', 'refreshGrowthS', ctx.config.forestGuard.refreshGrowthS))} s growth per visit`;
      break;
  }
  return { title, action };
}
