// Combat (DESIGN §8.6, §9, §10.1, §11): catapults and archers pick the closest legal target, shots fly and land
// where the target was, damage destroys items (structures leave debris), losing every outpost knocks a player out,
// and the last player standing wins.
import { type SimContext, idx } from '../context';
import { MILLI } from '../fixed';
import { type Hex, distance } from '../hex';
import { addEntity, hexOf, isOwnable, kindOf, removeEntity, structures } from '../state';
import { upgradeValue } from '../upgrades';
import { isRock, isWater } from '../water';
import { type Catapult, type Entity, type GameState, NEUTRAL, type Ownable, type Shot } from '../types';
import { dropWood } from './economy';
import { crossable } from './placement';
import { isCoveredBy, territoryChanged } from './territory';

const ticks = (ctx: SimContext, seconds: number) => Math.max(1, Math.round(seconds * ctx.config.tickRate));

/** Max HP: the item's base, plus Improved Frames for structures (DESIGN §10.3). */
export function maxHp(state: GameState, ctx: SimContext, e: Ownable): number {
  const base = ctx.config.items[kindOf(e)].hp;
  if (e.type !== 'structure') return base;
  const pct = upgradeValue(state, ctx, e.owner, 'factory', 'improvedFrames', 'hpPct', 0);
  return Math.floor((base * (100 + pct)) / 100);
}

/** Hex i is a conflict zone inside p's territory: covered by p and by another player (DESIGN §9). */
export function isConflictFor(state: GameState, i: number, p: number): boolean {
  const c = state.coverage[i]!;
  return isCoveredBy(state, i, p) && (c & ~(1 << p)) !== 0;
}

/** Another player's item on a conflict zone inside `attacker`'s territory (DESIGN §8.6). */
export function isLegalTarget(state: GameState, ctx: SimContext, attacker: number, e: Entity): e is Ownable {
  if (!isOwnable(e) || e.owner === NEUTRAL || e.owner === attacker) return false;
  const i = idx(ctx, hexOf(e));
  return i !== undefined && isConflictFor(state, i, attacker);
}

/** The closest legal target to `from` (ties: lowest id), optionally within `range`. */
function closestTarget(state: GameState, ctx: SimContext, attacker: number, from: Hex, range = -1): Ownable | null {
  let best: Ownable | null = null;
  let bestD = 0;
  for (const e of state.entities) {
    if (!isLegalTarget(state, ctx, attacker, e)) continue;
    const d = distance(from, hexOf(e));
    if (range >= 0 && d > range) continue;
    if (!best || d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

const byId = (state: GameState, id: number | null | undefined) => (id == null ? undefined : state.entities.find((e) => e.id === id));

function fire(state: GameState, ctx: SimContext, kind: Shot['kind'], owner: number, from: Hex, target: Ownable, damage: number): void {
  const to = hexOf(target);
  const flightTicks = ticks(ctx, kind === 'stone' ? ctx.config.combat.shotFlightS : ctx.config.combat.arrowFlightS);
  addEntity<Shot>(state, {
    type: 'shot',
    kind,
    owner,
    fromQ: from.q,
    fromR: from.r,
    toQ: to.q,
    toR: to.r,
    targetId: target.id,
    damage,
    flightTicks,
    ticksLeft: flightTicks,
  });
}

/** Damage an item; at 0 HP it's destroyed. `by` is the attacking player. */
export function damage(state: GameState, ctx: SimContext, e: Ownable, amount: number, by: number): void {
  const p = state.players[by];
  if (p) p.stats.damageDealt += Math.min(amount, Math.max(0, e.hp)); // HP actually taken, no overkill
  e.hp -= amount;
  if (e.hp <= 0) destroy(state, ctx, e, by);
}

/**
 * Destroyed by an attack (DESIGN §9): a unit is gone (a carrier's load drops where it was); a structure leaves debris
 * on land. A lost outpost changes territory.
 */
export function destroy(state: GameState, ctx: SimContext, e: Ownable, by: number): void {
  removeEntity(state, e.id);
  const h = hexOf(e);
  const i = idx(ctx, h)!;
  if (e.type === 'carrier') dropWood(state, ctx, h.q, h.r, e.load);
  if (e.type !== 'structure') return;
  if (!isWater(state, ctx, i)) state.debris[i] = ctx.config.items[e.kind].cost;
  if (e.kind === 'outpost') {
    const p = state.players[by];
    if (p) p.stats.outpostsDestroyed++;
    territoryChanged(state, ctx);
  }
}

/** Dismantle like the hammer (DESIGN §7.3c): half the cost stays on the hex as wood. */
export function dismantle(state: GameState, ctx: SimContext, e: Ownable): void {
  const h = hexOf(e);
  let wood = Math.floor((ctx.config.items[kindOf(e)].cost * MILLI * ctx.config.hammer.refundPct) / 100);
  if (e.type === 'carrier') wood += e.load;
  removeEntity(state, e.id);
  dropWood(state, ctx, h.q, h.r, wood);
}

/**
 * Surrender (DESIGN §11): outposts and catapults are dismantled; everything else follows the ownership rule (neutral,
 * or the one player covering it).
 */
export function surrender(state: GameState, ctx: SimContext, player: number): void {
  for (const e of [...state.entities]) {
    if (!isOwnable(e) || e.owner !== player) continue;
    if (e.type === 'catapult' || (e.type === 'structure' && e.kind === 'outpost')) dismantle(state, ctx, e);
  }
  territoryChanged(state, ctx);
}

/** Players who placed outposts and have none left are out; their catapults are dismantled (DESIGN §11). */
export function checkDefeats(state: GameState, ctx: SimContext): void {
  if (state.phase !== 'running') return;
  for (const p of state.players) {
    if (!p.started || p.defeated) continue;
    if (structures(state).some((s) => s.kind === 'outpost' && s.owner === p.id)) continue;
    p.defeated = true;
    for (const e of [...state.entities]) if (e.type === 'catapult' && e.owner === p.id) dismantle(state, ctx, e);
  }
}

/** Domination (DESIGN §11): once at least two players have played, the match ends when one (or none) is left. */
function checkVictory(state: GameState): void {
  const played = state.players.filter((p) => p.started);
  if (played.length < 2) return;
  const alive = played.filter((p) => !p.defeated);
  if (alive.length > 1) return;
  state.phase = 'over';
  state.winner = alive[0]?.id ?? null;
}

// --- Archers ----------------------------------------------------------------------------------------------------

/** Outpost Archer and the bridge's Gatehouse archer (DESIGN §10.3): shoot the closest legal target in range. */
function archersSystem(state: GameState, ctx: SimContext): void {
  for (const s of structures(state)) {
    if (s.owner === NEUTRAL) continue;
    const [type, path] = s.kind === 'outpost' ? ['outpost', 'archer'] : s.kind === 'bridge' ? ['bridge', 'drawbridge'] : [null, null];
    if (!type || !path) continue;
    const range = upgradeValue(state, ctx, s.owner, type, path, 'range', 0);
    if (range === 0) continue;
    if ((s.thinkTicks ?? 0) <= 0) {
      s.thinkTicks = ticks(ctx, ctx.config.combat.retargetS);
      s.targetId = closestTarget(state, ctx, s.owner, s, range)?.id ?? null;
    }
    s.thinkTicks!--;
    if ((s.fireTicks ?? 0) > 0) s.fireTicks!--;
    const target = byId(state, s.targetId);
    if (!target || !isLegalTarget(state, ctx, s.owner, target) || distance(s, hexOf(target)) > range || (s.fireTicks ?? 0) > 0) continue;
    fire(state, ctx, 'arrow', s.owner, s, target, upgradeValue(state, ctx, s.owner, type, path, 'damage', 0));
    s.fireTicks = ticks(ctx, 1 / upgradeValue(state, ctx, s.owner, type, path, 'hitsPerSecond', 1));
  }
}

// --- Catapults --------------------------------------------------------------------------------------------------

/** Catapults drive over land and working bridges, through units, forests and structures (DESIGN §8.6). */
function drivable(state: GameState, ctx: SimContext, i: number, owner: number): boolean {
  if (isRock(state, ctx, i)) return false;
  return !isWater(state, ctx, i) || crossable(state, ctx, i, owner);
}

/**
 * Breadth-first search from the catapult's hex over drivable hexes (inside its owner's territory when `ownOnly`),
 * in the fixed neighbour order. Returns the first step towards the first hex that satisfies `goal`, or, if none is
 * reachable, towards the reachable hex with the lowest `fallback` score (null: no fallback). `here` means stay.
 */
function nextStep(
  state: GameState,
  ctx: SimContext,
  c: Catapult,
  ownOnly: boolean,
  goal: (i: number) => boolean,
  fallback: ((i: number) => number) | null,
): number | 'here' | null {
  const start = idx(ctx, c)!;
  const parent = new Map<number, number>([[start, -1]]);
  const queue = [start];
  let found = -1;
  let best = -1;
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]!;
    if (goal(i)) {
      found = i;
      break;
    }
    if (fallback && (best < 0 || fallback(i) < fallback(best))) best = i;
    for (const n of ctx.neighbourIdx[i]!) {
      if (parent.has(n) || !drivable(state, ctx, n, c.owner) || (ownOnly && !isCoveredBy(state, n, c.owner))) continue;
      parent.set(n, i);
      queue.push(n);
    }
  }
  let to = found >= 0 ? found : best;
  if (to < 0) return null;
  if (to === start) return 'here';
  while (parent.get(to) !== start) to = parent.get(to)!;
  return to;
}

function startMove(ctx: SimContext, c: Catapult, to: number): void {
  const h = ctx.map.hexes[to]!;
  c.toQ = h.q;
  c.toR = h.r;
  c.moveTicks = 0;
}

function catapultSystem(state: GameState, ctx: SimContext): void {
  const cfg = ctx.config.catapult;
  const stepTicks = ticks(ctx, 1 / cfg.speedHexPerSecond);
  for (const c of state.entities.filter((e): e is Catapult => e.type === 'catapult')) {
    if (c.fireTicks > 0) c.fireTicks--;
    if (c.toQ !== null && c.toR !== null) {
      if (++c.moveTicks < stepTicks) continue;
      c.q = c.toQ;
      c.r = c.toR;
      c.toQ = c.toR = null;
      c.moveTicks = 0;
    }
    const here = idx(ctx, c)!;

    // Off its owner's territory: drive back to the closest hex of it, without firing. Blocked: wait, facing it.
    if (!isCoveredBy(state, here, c.owner)) {
      c.targetId = null;
      const home = (i: number) => isCoveredBy(state, i, c.owner);
      const step = nextStep(state, ctx, c, false, home, null);
      let aim = -1;
      for (let i = 0; i < ctx.map.hexes.length; i++)
        if (home(i) && (aim < 0 || distance(ctx.map.hexes[i]!, c) < distance(ctx.map.hexes[aim]!, c))) aim = i;
      if (aim >= 0) {
        c.aimQ = ctx.map.hexes[aim]!.q;
        c.aimR = ctx.map.hexes[aim]!.r;
      }
      if (typeof step === 'number') startMove(ctx, c, step);
      continue;
    }

    // Think every second: the closest legal target (DESIGN §8.6).
    if (--c.thinkTicks <= 0) {
      c.thinkTicks = ticks(ctx, ctx.config.combat.retargetS);
      c.targetId = closestTarget(state, ctx, c.owner, c)?.id ?? null;
    }
    const target = byId(state, c.targetId);
    if (!target || !isLegalTarget(state, ctx, c.owner, target)) continue;
    const th = hexOf(target);
    c.aimQ = th.q;
    c.aimR = th.r;
    const range = upgradeValue(state, ctx, c.owner, 'catapult', 'range', 'range', cfg.range);
    if (distance(c, th) <= range) {
      if (c.fireTicks > 0) continue;
      fire(state, ctx, 'stone', c.owner, c, target, upgradeValue(state, ctx, c.owner, 'catapult', 'firepower', 'damage', cfg.damage));
      c.fireTicks = ticks(ctx, 1 / cfg.hitsPerSecond);
      continue;
    }
    // Drive (inside its territory) to the nearest hex with the target in range, or as close as it can get.
    const dist = (i: number) => distance(ctx.map.hexes[i]!, th);
    const step = nextStep(state, ctx, c, true, (i) => dist(i) <= range, dist);
    if (typeof step === 'number') startMove(ctx, c, step);
  }
}

// --- Shots ------------------------------------------------------------------------------------------------------

/** Shots land after their flight; they hit only if the target is still on the hex they were aimed at. */
function shotsSystem(state: GameState, ctx: SimContext): void {
  for (const s of state.entities.filter((e): e is Shot => e.type === 'shot')) {
    if (--s.ticksLeft > 0) continue;
    removeEntity(state, s.id);
    const target = byId(state, s.targetId);
    if (!target || !isOwnable(target) || target.owner === s.owner) continue;
    const h = hexOf(target);
    if (h.q === s.toQ && h.r === s.toR) damage(state, ctx, target, s.damage, s.owner);
  }
}

export function combatSystem(state: GameState, ctx: SimContext): void {
  catapultSystem(state, ctx);
  archersSystem(state, ctx);
  shotsSystem(state, ctx);
  checkVictory(state);
}
