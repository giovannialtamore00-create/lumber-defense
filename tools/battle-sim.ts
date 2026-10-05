// Battle simulator (balance tool): four scripted bots play a full match on the real sim (no rendering) with the
// strategies from a JSON file, up to a time cap, logging every player every 5 minutes. Only normal commands are used.
//   npx tsx tools/battle-sim.ts <strategies.json> --seats A,B,C,Base [--seed 5] [--minutes 30] [--playtest] [--out m.json]
// The winner at the cap is the player with the most territory (hexes covered), then the most buildings; a domination
// win before the cap counts as a win.
import { readFileSync, writeFileSync } from 'node:fs';
import config from '../src/data/config.json';
import map01 from '../src/data/maps/map01.json';
import { createContext } from '../src/sim/context';
import { distance, hexesInRadius } from '../src/sim/hex';
import type { MapData } from '../src/sim/map';
import { createInitialState } from '../src/sim/state';
import { isConflictFor } from '../src/sim/systems/combat';
import { craftError } from '../src/sim/systems/crafting';
import { canPlaceAnywhere, dropOffs, pickupError, placementError } from '../src/sim/systems/placement';
import { isCoveredBy } from '../src/sim/systems/territory';
import { step } from '../src/sim/tick';
import type { Command, Config, GameState, ItemKind, Structure, StructureKind } from '../src/sim/types';
import { typeIndex, upgradeError } from '../src/sim/upgrades';

export interface Strategy {
  name: string;
  // Economy
  millsEarly: number; // factory-mills before anything else grows
  docksPerMill: number; // only next to a factory-mill
  choppersPerOutpost: number;
  carriersPerChopper: number;
  guardsPerOutpost: number;
  expandBelowForest: number; // new outpost when the uncut forest in our territory drops below this
  expandEveryBuildings: number; // or every N buildings (0 = off)
  maxOutposts: number;
  workshopAt: number; // buildings before the workshop (0 = never)
  upgrades: [string, number][]; // bought in order, one level each
  // Military
  aggressionFromMin: number; // from this minute, new outposts push toward the nearest enemy (999 = never)
  catapultsFromMin: number; // from this minute, build catapults
  catapultsPerConflict: number; // catapults wanted (in total) while we have a conflict zone
  catapultsIdle: number; // catapults wanted even without a conflict zone (aggressors prepare)
  /** From this minute, focus everything on the weakest living enemy's nearest outpost (999 = never). */
  focusFromMin: number;
  /** Only attack an enemy whose wood income is at most 1/leadRatio of ours (game theory: fight when ahead). */
  leadRatio: number;
  /** Attack in Conquest (outposts only, capture the rest) instead of Destruction. */
  conquest: boolean;
}

export const DEFAULTS: Strategy = {
  name: 'default',
  millsEarly: 2,
  docksPerMill: 1,
  choppersPerOutpost: 3,
  carriersPerChopper: 1,
  guardsPerOutpost: 0,
  expandBelowForest: 400,
  expandEveryBuildings: 8,
  maxOutposts: 12,
  workshopAt: 8,
  upgrades: [],
  aggressionFromMin: 999,
  catapultsFromMin: 15,
  catapultsPerConflict: 2,
  catapultsIdle: 0,
  focusFromMin: 999,
  leadRatio: 1.2,
  conquest: true,
};

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1]! : fallback;
};

export interface Snapshot {
  min: number;
  woodCut: number;
  woodSpent: number;
  wood: number;
  buildings: number;
  territory: number;
  units: number;
  catapults: number;
  upgrades: number;
  alive: boolean;
}

export interface PlayerResult {
  seat: number;
  strategy: string;
  region: number;
  turnOrder: number;
  territory: number;
  buildings: number;
  defeated: boolean;
  snapshots: Snapshot[];
  kinds: Record<string, number>;
  catapultsBuilt: number;
  upgradeLevels: Record<string, string>;
  damageDealt: number;
  outpostsDestroyed: number;
  maxTerritoryLostIn10: number; // percent of peak territory lost during the first 10 minutes
}

export interface MatchResult {
  seed: number;
  minutes: number;
  endedAt: number;
  domination: boolean;
  winner: number;
  winnerStrategy: string;
  players: PlayerResult[];
  notes: string[];
}

export function runMatch(strategies: Strategy[], seed: number, minutes: number, playtest: boolean, cfg: Config = config as Config): MatchResult {
  const ctx = createContext(map01 as MapData, cfg);
  const state: GameState = createInitialState(ctx, 4, seed, [false, false, false, false]);
  const notes: string[] = [];
  const hexes = ctx.map.hexes;
  const idxOf = (h: { q: number; r: number }) => ctx.indexOf.get(`${h.q},${h.r}`);
  const territoryOf = (p: number) => state.coverage.filter((c) => c & (1 << p)).length;
  const catapultsBuilt = [0, 0, 0, 0];
  const peakIn10 = [0, 0, 0, 0];
  const lostIn10 = [0, 0, 0, 0];

  /** Wood collected per player at each minute mark, for income estimates. */
  const collectedAt: number[][] = [[], [], [], []];
  /** Wood income over the last 2 minutes (wood that reached factory-mills, plus nothing else). */
  const income = (pl: number) => {
    const h = collectedAt[pl]!;
    const now = state.players[pl]!.stats.woodCollected;
    const then = h.length >= 2 ? h[h.length - 2]! : 0;
    return Math.max(0, now - then) / 1000;
  };

  function bot(me: number, st: Strategy) {
    const queue: Command[] = [];
    const send = (c: Command) => queue.push(c);
    const p = () => state.players[me]!;
    const mine = (k: StructureKind) => state.entities.filter((e): e is Structure => e.type === 'structure' && e.kind === k && e.owner === me);
    const count = (t: string) => state.entities.filter((e) => e.type === t && 'owner' in e && e.owner === me).length;
    const buildings = () => state.entities.filter((e) => e.type === 'structure' && e.owner === me).length;
    const covered = (i: number) => isCoveredBy(state, i, me);
    const legal = (item: ItemKind) => hexes.filter((h) => !placementError(state, ctx, me, item, h.q, h.r));
    const territoryForest = () => state.forestPool.reduce((s, w, i) => s + (covered(i) ? w : 0), 0) / 1000;
    const millNear = (h: { q: number; r: number }) => mine('factory').some((f) => distance(f, h) === 1);
    const minute = () => state.tick / 600;
    const enemyOutposts = () => state.entities.filter((e): e is Structure => e.type === 'structure' && e.kind === 'outpost' && e.owner >= 0 && e.owner !== me);
    const conflictHexes = () => hexes.map((_, i) => i).filter((i) => isConflictFor(state, i, me));
    const aggressive = () => minute() >= st.aggressionFromMin;
    /**
     * Focus fire: the weakest living enemy (fewest outposts, then least territory) and its outpost nearest to us. To
     * hit it, it must sit in a conflict zone inside our territory: an outpost of ours within 3 hexes covers it.
     */
    /**
     * Who to attack, if anyone: from focusFromMin, the enemy we out-produce the most (income over the last 2 minutes,
     * at least leadRatio times theirs), weighted toward the nearest and the smallest. Returns that enemy's outpost
     * nearest to us. Fighting an equal is a coin flip that lets the others grow, so we only fight when ahead.
     */
    function focusTarget(): Structure | null {
      if (minute() < st.focusFromMin) return null;
      const mineOut = mine('outpost');
      if (!mineOut.length) return null;
      const myIncome = income(me);
      let best: { score: number; outpost: Structure } | null = null;
      for (const pl of state.players) {
        if (pl.id === me || !pl.started || pl.defeated) continue;
        const theirs = enemyOutposts().filter((o) => o.owner === pl.id);
        if (!theirs.length) continue;
        const theirIncome = income(pl.id);
        if (myIncome < st.leadRatio * theirIncome) continue; // not ahead of them: don't start a fight
        const d = (o: Structure) => Math.min(...mineOut.map((m) => distance(m, o)));
        const nearest = theirs.reduce((x, y) => (d(y) < d(x) ? y : x));
        const score = (myIncome + 1) / (theirIncome + 1) - d(nearest) * 0.15 - territoryOf(pl.id) / 100;
        if (!best || score > best.score) best = { score, outpost: nearest };
      }
      return best?.outpost ?? null;
    }
    const targetCovered = (t: Structure) => covered(idxOf(t)!);

    const expansionScore = (h: { q: number; r: number }, radius: number) =>
      hexesInRadius(h, radius).reduce((s, n) => {
        const i = idxOf(n);
        if (i === undefined || covered(i)) return s;
        return s + state.forestPool[i]! / 1000 / 20 + (ctx.riverside[i] ? 1 : 0) + (ctx.riverRow[i] ?? 0) * 0 + 0.3;
      }, 0);
    /** Pushing toward an enemy: new hexes that the enemy covers (conflict) count most. */
    const pushScore = (h: { q: number; r: number }) => {
      const enemies = enemyOutposts();
      if (!enemies.length) return expansionScore(h, ctx.config.outpost.territoryRadius);
      const near = Math.min(...enemies.map((e) => distance(e, h)));
      const conflict = hexesInRadius(h, ctx.config.outpost.territoryRadius).filter((n) => {
        const i = idxOf(n);
        return i !== undefined && (state.coverage[i]! & ~(1 << me)) !== 0;
      }).length;
      return conflict * 3 - near;
    };

    function unservedChoppers() {
      return mine('woodchopper').filter((w) => !dropOffs(state, ctx, me, w.q, w.r).some((d) => d.riverQ === null));
    }

    function spot(item: ItemKind): { q: number; r: number } | null {
      const spots = legal(item);
      if (!spots.length) return null;
      const byScore = (f: (h: { q: number; r: number }) => number) => spots.reduce((a, b) => (f(b) > f(a) ? b : a));
      switch (item) {
        case 'outpost':
          if (!p().started) return byScore((h) => expansionScore(h, ctx.config.outpost.firstTerritoryRadius));
          {
            // Focus: as close as possible to the target outpost, so our territory covers it.
            const t = focusTarget();
            if (t && !targetCovered(t)) return byScore((h) => -distance(h, t));
          }
          return aggressive() ? byScore(pushScore) : byScore((h) => expansionScore(h, ctx.config.outpost.territoryRadius));
        case 'factory':
          return byScore((h) => {
            const i = idxOf(h)!;
            const river = Math.max(0, ...ctx.neighbourIdx[i]!.map((n) => ctx.riverRow[n]!));
            const forest = hexesInRadius(h, 3).filter((n) => {
              const j = idxOf(n);
              return j !== undefined && state.forestPool[j]! > 0 && n.r === h.r;
            }).length;
            const serves = unservedChoppers().some((w) => w.r === h.r && Math.abs(w.q - h.q) <= ctx.config.carrier.maxRouteDistance);
            return river + forest * 2 + (serves ? 100 : 0);
          });
        case 'dock':
          return spots.find(millNear) ?? null;
        case 'woodchopper':
          return byScore((h) => state.forestPool[idxOf(h)!]! / 1000 + (mine('factory').some((f) => f.r === h.r && Math.abs(f.q - h.q) <= 5) ? 100 : 0));
        case 'forestGuard':
          return byScore((h) =>
            hexesInRadius(h, 1).filter((n) => {
              const j = idxOf(n);
              return j !== undefined && covered(j) && state.forestPool[j] === 0 && (hexes[j]!.terrain === 'forest' || state.grownForest[j]);
            }).length,
          );
        case 'catapult': {
          // Focus: 4 hexes from the target outpost (in range, out of archer reach), so it's their closest target.
          const ft = focusTarget();
          if (ft) {
            const others = enemyOutposts().filter((o) => o !== ft);
            return byScore((h) => {
              const d = distance(h, ft);
              const safe = others.every((o) => distance(o, h) >= 3);
              return (d === 4 ? 60 : d === 3 ? 50 : 0) - Math.abs(d - 4) + (safe ? 20 : 0);
            });
          }
          // Near the conflict zone (or the nearest enemy outpost) but out of reach of enemy archers: at least 4 hexes
          // from any enemy outpost (batch 1 found catapults placed in archer range die and get rebuilt in a loop).
          const zone = conflictHexes().map((i) => hexes[i]!);
          const targets = zone.length ? zone : enemyOutposts();
          const safe = (h: { q: number; r: number }) => enemyOutposts().every((e) => distance(e, h) >= 4);
          if (!targets.length) return byScore((h) => -Math.min(...mine('outpost').map((o) => distance(o, h))));
          return byScore((h) => (safe(h) ? 100 : 0) - Math.min(...targets.map((t) => distance(t, h))));
        }
        default:
          return byScore((h) => -Math.min(...mine('outpost').map((o) => distance(o, h))));
      }
    }

    function carrierRoute(): { aQ: number; bQ: number; r: number } | null {
      const served = new Map<string, number>();
      for (const c of state.entities) if (c.type === 'carrier' && c.owner === me) served.set(`${c.aQ},${c.r}`, (served.get(`${c.aQ},${c.r}`) ?? 0) + 1);
      for (const w of mine('woodchopper')) {
        if ((served.get(`${w.q},${w.r}`) ?? 0) >= st.carriersPerChopper || pickupError(state, ctx, me, w.q, w.r)) continue;
        const drops = dropOffs(state, ctx, me, w.q, w.r);
        const drop = drops.find((d) => d.riverQ === null) ?? drops[0];
        if (drop) return { aQ: w.q, bQ: drop.q, r: w.r };
      }
      return null;
    }

    let upgradeStep = 0;
    function think(): Command[] {
      if (p().defeated || state.phase === 'over') return [];
      if (p().bot) send({ type: 'takeControl', player: me });
      else if (!p().started) {
        const h = spot('outpost');
        if (h) send({ type: 'placeOutpost', player: me, q: h.q, r: h.r });
      } else {
        const invaded = state.entities.some((e) => e.type === 'catapult' && e.owner !== me && e.owner >= 0 && covered(idxOf(e)!));
        const want = invaded || !st.conquest || !focusTarget() ? 'destruction' : 'conquest';
        if (p().stance !== want) send({ type: 'setStance', player: me, stance: want });
        plan();
      }
      return queue.splice(0);
    }

    function plan() {
      const item = p().hand[0];
      if (item) {
        if (item === 'carrier') {
          const route = carrierRoute();
          return send(route ? { type: 'placeCarrier', player: me, ...route } : { type: 'store', player: me });
        }
        const h = spot(item);
        if (!h) return send({ type: 'store', player: me });
        if (item === 'forestGuard') return send({ type: 'placeGuard', player: me, q: h.q, r: h.r });
        if (item === 'catapult') {
          catapultsBuilt[me]!++;
          return send({ type: 'placeCatapult', player: me, q: h.q, r: h.r });
        }
        return send({ type: 'place', player: me, item: item as StructureKind, q: h.q, r: h.r });
      }
      const useless = mine('dock').find((d) => !millNear(d) && d.dismantleTicks === undefined);
      if (useless) return send({ type: 'dismantle', player: me, id: useless.id });
      // Defence: once any enemy catapult exists, get Archer L1 first (archers only shoot catapults).
      const threat = state.entities.some((e) => e.type === 'catapult' && e.owner !== me && e.owner >= 0);
      const archer = typeIndex(ctx, 'outpost');
      if (threat && mine('workshop').length && p().upgrades[archer]!.levels[1] === 0 && !p().research.some((r) => r.type === archer) && !upgradeError(state, ctx, me, archer, 1))
        return send({ type: 'buyUpgrade', player: me, upgradeType: archer, path: 1 });
      const next = st.upgrades[upgradeStep];
      if (next && mine('workshop').length) {
        const t = typeIndex(ctx, next[0]);
        const err = upgradeError(state, ctx, me, t, next[1]);
        if (!err) {
          upgradeStep++;
          return send({ type: 'buyUpgrade', player: me, upgradeType: t, path: next[1] });
        }
        if (err === 'fully upgraded') upgradeStep++;
      }
      const outposts = mine('outpost').length;
      const n = (k: StructureKind) => mine(k).length;
      const wants: ItemKind[] = [];
      const conflict = conflictHexes().length > 0;
      // Defence: enemy catapults in or near our land -> a defensive army right away, whatever the plan (round 3: the
      // Patient bot waited for its planned minute and was overrun every match).
      const near = state.entities.some((e) => e.type === 'catapult' && e.owner !== me && e.owner >= 0 && mine('outpost').some((o) => distance(o, e) <= 6));
      if (near && count('catapult') < 3) wants.push('catapult');
      // Focus fire: first make the target outpost hittable (cover it with an outpost), then mass catapults on it.
      const ft = focusTarget();
      if (ft) {
        // Army first (sim 1: pushing outposts with no army behind them built 31 outposts and lost every one), then
        // creep one outpost closer whenever the army is ready.
        const army = 3 + Math.floor(p().wood / 50_000);
        if (count('catapult') < 3) wants.push('catapult');
        else if (!targetCovered(ft)) wants.push('outpost');
        if (count('catapult') < army) wants.push('catapult');
      } else if (minute() >= st.catapultsFromMin) {
        // A fixed army per strategy, plus one more per 100 banked wood (batch 3: bots banked ~2,700 wood with nothing
        // to spend it on, so no match was ever won before the cap).
        const surplus = Math.floor(p().wood / 100_000);
        const wantCats = (conflict ? st.catapultsPerConflict : st.catapultsIdle) + surplus;
        // Stop feeding a front that keeps killing them: at most twice the planned army in total.
        if (count('catapult') < wantCats && catapultsBuilt[me]! < 2 * Math.max(st.catapultsPerConflict, st.catapultsIdle) + surplus) wants.push('catapult');
      }
      if (count('carrier') < n('woodchopper') * st.carriersPerChopper && carrierRoute()) wants.push('carrier');
      if (n('factory') < 1) wants.push('factory');
      if (n('woodchopper') < 2) wants.push('woodchopper');
      if (n('dock') < n('factory') * st.docksPerMill) wants.push('dock');
      if (n('factory') < st.millsEarly) wants.push('factory');
      if (unservedChoppers().length > 0 && n('factory') < 3 * outposts) wants.push('factory');
      if (st.workshopAt && n('workshop') < 1 && buildings() >= st.workshopAt) wants.push('workshop');
      const expand =
        outposts < st.maxOutposts &&
        (territoryForest() < st.expandBelowForest ||
          (st.expandEveryBuildings > 0 && buildings() >= outposts * st.expandEveryBuildings) ||
          (aggressive() && !conflict));
      // Every bot gets a second outpost by minute 6 (batch 1: C never expanded and was overrun).
      if (expand || (outposts < 2 && minute() >= 6)) wants.push('outpost');
      if (n('woodchopper') < st.choppersPerOutpost * outposts) wants.push('woodchopper');
      if (count('guard') < st.guardsPerOutpost * outposts) wants.push('forestGuard');
      const pick = wants.find(
        (k) => !craftError(state, ctx, me, k) && (k === 'carrier' ? !!carrierRoute() : canPlaceAnywhere(state, ctx, me, k) && spot(k) !== null),
      );
      if (pick) send({ type: 'craft', player: me, item: pick });
    }
    return { think };
  }

  const bots = strategies.map((s, i) => bot(i, s));
  if (playtest) state.playtest = true;
  const snapshots: Snapshot[][] = [[], [], [], []];
  const totalTicks = minutes * 600;
  let lastSeen = '';
  let sameFor = 0;
  for (let guard = 0; guard < totalTicks + 3000; guard++) {
    if (state.phase === 'over') break;
    if (state.phase === 'running' && state.tick >= totalTicks) break;
    const cmds = guard % 20 === 0 ? bots.flatMap((b) => b.think()) : [];
    step(state, ctx, cmds);
    const min = state.tick / 600;
    if (state.tick % 600 === 0) {
      for (let pl = 0; pl < 4; pl++) collectedAt[pl]!.push(state.players[pl]!.stats.woodCollected);
      for (let pl = 0; pl < 4; pl++) {
        const t = territoryOf(pl);
        if (min <= 10) {
          peakIn10[pl] = Math.max(peakIn10[pl]!, t);
          if (peakIn10[pl]! > 0) lostIn10[pl] = Math.max(lostIn10[pl]!, Math.round(((peakIn10[pl]! - t) * 100) / peakIn10[pl]!));
        }
      }
      // Loop detection: nobody's wood, buildings or territory changed for 5 minutes in the running phase.
      const sig = state.players.map((pl) => `${pl.wood}|${pl.stats.woodSpent}`).join(',');
      sameFor = sig === lastSeen ? sameFor + 1 : 0;
      lastSeen = sig;
      if (sameFor === 5) notes.push(`stalled: no wood movement for any player for 5 min at ${Math.round(min)} min`);
    }
    if (state.tick % 3000 === 0 && state.phase === 'running') {
      state.players.forEach((pl, i) => {
        const units = state.entities.filter((e) => e.type !== 'structure' && e.type !== 'pile' && e.type !== 'shot' && 'owner' in e && e.owner === i).length;
        snapshots[i]!.push({
          min: Math.round(min),
          woodCut: Math.floor(pl.stats.woodChopped / 1000),
          woodSpent: Math.floor(pl.stats.woodSpent / 1000),
          wood: Math.floor(pl.wood / 1000),
          buildings: state.entities.filter((e) => e.type === 'structure' && e.owner === i).length,
          territory: territoryOf(i),
          units,
          catapults: state.entities.filter((e) => e.type === 'catapult' && e.owner === i).length,
          upgrades: pl.upgrades.reduce((s, u) => s + u.levels[0] + u.levels[1], 0),
          alive: !pl.defeated,
        });
      });
    }
  }
  const players: PlayerResult[] = state.players.map((pl, i) => {
    const kinds: Record<string, number> = {};
    for (const e of state.entities) if (e.type === 'structure' && e.owner === i) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    return {
      seat: i,
      strategy: strategies[i]!.name,
      region: pl.region,
      turnOrder: state.startTurns.order.indexOf(i),
      territory: territoryOf(i),
      buildings: state.entities.filter((e) => e.type === 'structure' && e.owner === i).length,
      defeated: pl.defeated,
      snapshots: snapshots[i]!,
      kinds,
      catapultsBuilt: catapultsBuilt[i]!,
      upgradeLevels: Object.fromEntries(ctx.upgrades.types.map((t, k) => [t.type, pl.upgrades[k]!.levels.join('/')]).filter(([, l]) => l !== '0/0')),
      damageDealt: pl.stats.damageDealt,
      outpostsDestroyed: pl.stats.outpostsDestroyed,
      maxTerritoryLostIn10: lostIn10[i]!,
    };
  });
  const domination = state.phase === 'over';
  const ranked = [...players].filter((x) => !x.defeated).sort((a, b) => b.territory - a.territory || b.buildings - a.buildings);
  const winner = domination ? (state.winner ?? -1) : (ranked[0]?.seat ?? -1);
  return { seed, minutes, endedAt: Math.round(state.tick / 60) / 10, domination, winner, winnerStrategy: strategies[winner]?.name ?? '-', players, notes };
}

function loadStrategies(file: string): Record<string, Strategy> {
  const list = JSON.parse(readFileSync(file, 'utf8')) as Partial<Strategy>[];
  return Object.fromEntries(list.map((s) => [s.name!, { ...DEFAULTS, ...s } as Strategy]));
}

export function printMatch(m: MatchResult): void {
  console.log(`seed ${m.seed}: winner ${m.winnerStrategy} (seat ${m.winner})${m.domination ? ' by domination' : ''}, ended at ${m.endedAt} min`);
  for (const pl of m.players) {
    const curve = pl.snapshots.map((s) => `${s.min}m b${s.buildings} t${s.territory} cut${s.woodCut} spent${s.woodSpent} c${s.catapults} u${s.upgrades}`).join(' | ');
    console.log(
      `  ${pl.strategy.padEnd(6)} region ${pl.region} turn ${pl.turnOrder} | terr ${pl.territory} bldg ${pl.buildings}${pl.defeated ? ' DEFEATED' : ''} | cats ${pl.catapultsBuilt} dmg ${pl.damageDealt} outposts-killed ${pl.outpostsDestroyed} | lost-in-10 ${pl.maxTerritoryLostIn10}% | upg ${JSON.stringify(pl.upgradeLevels)}`,
    );
    console.log(`         ${curve}`);
  }
  for (const n of m.notes) console.log(`  NOTE ${n}`);
}

if (process.argv[1]?.endsWith('battle-sim.ts') && args[0]) {
  const all = loadStrategies(args[0]);
  const seats = flag('--seats', Object.keys(all).slice(0, 4).join(',')).split(',');
  const m = runMatch(seats.map((s) => all[s]!), Number(flag('--seed', '5')), Number(flag('--minutes', '30')), args.includes('--playtest'));
  printMatch(m);
  const out = flag('--out', '');
  if (out) writeFileSync(out, JSON.stringify(m, null, 1));
}
