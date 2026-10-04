// Economy simulator (balance tool): plays solo matches with scripted strategies on the real sim, no rendering, and
// reports how the economy develops. Only normal commands are used, so every rule applies.
//   npx tsx tools/econ-sim.ts <strategies.json> [--playtest] [--minutes 60] [--seed 5] [--out results.json]
// strategies.json: an array of Strategy objects (see below); unknown fields fall back to the defaults.
import { readFileSync, writeFileSync } from 'node:fs';
import config from '../src/data/config.json';
import map01 from '../src/data/maps/map01.json';
import { createContext } from '../src/sim/context';
import { distance, hexesInRadius } from '../src/sim/hex';
import type { MapData } from '../src/sim/map';
import { createInitialState } from '../src/sim/state';
import { craftError } from '../src/sim/systems/crafting';
import { canPlaceAnywhere, dropOffs, pickupError, placementError } from '../src/sim/systems/placement';
import { isCoveredBy } from '../src/sim/systems/territory';
import { step } from '../src/sim/tick';
import type { Command, Config, GameState, ItemKind, Structure, StructureKind } from '../src/sim/types';
import { typeIndex, upgradeError } from '../src/sim/upgrades';

interface Strategy {
  name: string;
  /** Factory-mills to have per outpost (rounded up), at least 1. */
  millsPerOutpost: number;
  /** Docks per factory-mill; docks only next to a factory-mill when `docksByMillOnly`. */
  docksPerMill: number;
  docksByMillOnly: boolean;
  /** Woodchoppers per outpost. */
  choppersPerOutpost: number;
  /** Carriers per woodchopper. */
  carriersPerChopper: number;
  /** Expand (new outpost) when the uncut forest wood in our territory falls below this, or every N buildings. */
  expandBelowForest: number;
  expandEveryBuildings: number;
  /** Workshop once we have this many buildings (0 = never). */
  workshopAt: number;
  /** Upgrades to buy, in order: [type, path]. Each entry buys one level. */
  upgrades: [string, number][];
  /** Forest guards per outpost (replant spent forests). */
  guardsPerOutpost: number;
  /** Prefer carrier routes straight into a factory-mill over dropping into the river. */
  carrierToMill: boolean;
}

const DEFAULTS: Strategy = {
  name: 'default',
  millsPerOutpost: 1,
  docksPerMill: 1,
  docksByMillOnly: true,
  choppersPerOutpost: 3,
  carriersPerChopper: 1,
  expandBelowForest: 150,
  expandEveryBuildings: 0,
  workshopAt: 8,
  upgrades: [],
  guardsPerOutpost: 0,
  carrierToMill: true,
};

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1]! : fallback;
};
const strategies: Strategy[] = (JSON.parse(readFileSync(args[0]!, 'utf8')) as Partial<Strategy>[]).map((s) => ({ ...DEFAULTS, ...s }));
const PLAYTEST = args.includes('--playtest');
const MINUTES = Number(flag('--minutes', '60'));
const SEED = Number(flag('--seed', '5'));
const OUT = flag('--out', '');

const ctx = createContext(map01 as MapData, config as Config);
const ME = 0;
const STRUCTS: StructureKind[] = ['outpost', 'factory', 'dock', 'woodchopper', 'bridge', 'dam', 'workshop', 'excavator'];

function play(st: Strategy) {
  const state: GameState = createInitialState(ctx, 4, SEED, [false, true, true, true]);
  const queue: Command[] = [];
  const send = (c: Command) => queue.push(c);
  const p = () => state.players[ME]!;
  const mine = (k: StructureKind) => state.entities.filter((e): e is Structure => e.type === 'structure' && e.kind === k && e.owner === ME);
  const count = (t: string) => state.entities.filter((e) => e.type === t && 'owner' in e && e.owner === ME).length;
  const buildings = () => state.entities.filter((e) => e.type === 'structure' && e.owner === ME).length;
  const hexes = ctx.map.hexes;
  const covered = (i: number) => isCoveredBy(state, i, ME);
  const legal = (item: ItemKind) => hexes.filter((h) => !placementError(state, ctx, ME, item, h.q, h.r));
  const idxOf = (h: { q: number; r: number }) => ctx.indexOf.get(`${h.q},${h.r}`);
  const territoryForest = () => state.forestPool.reduce((s, w, i) => s + (covered(i) ? w : 0), 0) / 1000;
  const millNear = (h: { q: number; r: number }) => mine('factory').some((f) => distance(f, h) === 1);

  /** New territory an outpost on h would bring: uncut forest wood counts most. */
  const expansionScore = (h: { q: number; r: number }, radius: number) =>
    hexesInRadius(h, radius).reduce((s, n) => {
      const i = idxOf(n);
      if (i === undefined || covered(i)) return s;
      return s + state.forestPool[i]! / 1000 / 20 + (ctx.riverside[i] ? 1 : 0) + 0.3;
    }, 0);

  function spot(item: ItemKind): { q: number; r: number } | null {
    const spots = legal(item);
    if (!spots.length) return null;
    const byScore = (f: (h: { q: number; r: number }) => number) => spots.reduce((a, b) => (f(b) > f(a) ? b : a));
    switch (item) {
      case 'outpost':
        return byScore((h) => expansionScore(h, p().started ? ctx.config.outpost.territoryRadius : ctx.config.outpost.firstTerritoryRadius));
      case 'factory':
        // Strong river (craft speed) and forest nearby (short carrier routes).
        return byScore((h) => {
          const i = idxOf(h)!;
          const river = Math.max(0, ...ctx.neighbourIdx[i]!.map((n) => ctx.riverRow[n]!));
          const forest = hexesInRadius(h, 3).filter((n) => {
            const j = idxOf(n);
            return j !== undefined && state.forestPool[j]! > 0 && n.r === h.r;
          }).length;
          return river + forest * 2;
        });
      case 'dock':
        return st.docksByMillOnly ? (spots.find(millNear) ?? null) : (spots.find(millNear) ?? spots[0]!);
      case 'woodchopper':
        // Most wood, on a factory-mill's row if possible.
        return byScore((h) => state.forestPool[idxOf(h)!]! / 1000 + (mine('factory').some((f) => f.r === h.r && Math.abs(f.q - h.q) <= 5) ? 100 : 0));
      case 'forestGuard':
        return byScore((h) => hexesInRadius(h, 1).filter((n) => {
          const j = idxOf(n);
          return j !== undefined && covered(j) && state.forestPool[j] === 0 && (ctx.map.hexes[j]!.terrain === 'forest' || state.grownForest[j]);
        }).length);
      default: {
        const outposts = mine('outpost');
        return byScore((h) => -Math.min(...outposts.map((o) => distance(o, h))));
      }
    }
  }

  function carrierRoute(): { aQ: number; bQ: number; r: number } | null {
    const served = new Map<string, number>();
    for (const c of state.entities) if (c.type === 'carrier' && c.owner === ME) served.set(`${c.aQ},${c.r}`, (served.get(`${c.aQ},${c.r}`) ?? 0) + 1);
    for (const w of [...mine('woodchopper'), ...mine('dock').filter((d) => !millNear(d))]) {
      if ((served.get(`${w.q},${w.r}`) ?? 0) >= st.carriersPerChopper || pickupError(state, ctx, ME, w.q, w.r)) continue;
      const drops = dropOffs(state, ctx, ME, w.q, w.r);
      const drop = (st.carrierToMill ? drops.find((d) => d.riverQ === null) : undefined) ?? drops[0];
      if (drop) return { aQ: w.q, bQ: drop.q, r: w.r };
    }
    return null;
  }

  let upgradeStep = 0;
  function think() {
    if (p().bot) return send({ type: 'takeControl', player: ME });
    if (!p().started) {
      const h = spot('outpost');
      if (h) send({ type: 'placeOutpost', player: ME, q: h.q, r: h.r });
      return;
    }
    // Place what's in hand.
    const item = p().hand[0];
    if (item) {
      if (item === 'carrier') {
        const route = carrierRoute();
        return send(route ? { type: 'placeCarrier', player: ME, ...route } : { type: 'store', player: ME });
      }
      const h = spot(item);
      if (!h) return send({ type: 'store', player: ME });
      if (item === 'forestGuard') return send({ type: 'placeGuard', player: ME, q: h.q, r: h.r });
      return send({ type: 'place', player: ME, item: item as StructureKind, q: h.q, r: h.r });
    }
    // Upgrades in the strategy's order.
    const next = st.upgrades[upgradeStep];
    if (next && mine('workshop').length) {
      const t = typeIndex(ctx, next[0]);
      const err = upgradeError(state, ctx, ME, t, next[1]);
      if (!err) {
        upgradeStep++;
        return send({ type: 'buyUpgrade', player: ME, upgradeType: t, path: next[1] });
      }
      if (err === 'fully upgraded') upgradeStep++;
    }
    // What to craft next.
    const outposts = mine('outpost').length;
    const n = (k: StructureKind) => mine(k).length;
    const wants: ItemKind[] = [];
    if (count('carrier') < n('woodchopper') * st.carriersPerChopper && carrierRoute()) wants.push('carrier');
    if (n('factory') < 1) wants.push('factory');
    if (n('woodchopper') < Math.min(2, st.choppersPerOutpost)) wants.push('woodchopper');
    if (n('dock') < n('factory') * st.docksPerMill) wants.push('dock');
    if (st.workshopAt && n('workshop') < 1 && buildings() >= st.workshopAt) wants.push('workshop');
    const expand =
      territoryForest() < st.expandBelowForest || (st.expandEveryBuildings > 0 && buildings() >= outposts * st.expandEveryBuildings);
    if (expand) wants.push('outpost');
    if (n('woodchopper') < st.choppersPerOutpost * outposts) wants.push('woodchopper');
    if (n('factory') < Math.ceil(st.millsPerOutpost * outposts)) wants.push('factory');
    if (count('guard') < st.guardsPerOutpost * outposts) wants.push('forestGuard');
    const pick = wants.find((k) => !craftError(state, ctx, ME, k) && (k === 'carrier' || canPlaceAnywhere(state, ctx, ME, k)));
    if (pick) send({ type: 'craft', player: ME, item: pick });
  }

  if (PLAYTEST) send({ type: 'setPlaytest', player: ME, on: true });
  const perMinute: { min: number; wood: number; buildings: number; collected: number; forest: number }[] = [];
  let t10 = -1;
  let t25 = -1;
  const totalTicks = MINUTES * 60 * ctx.config.tickRate;
  for (let tick = 0; tick < totalTicks + 2000; tick++) {
    if (state.phase === 'running' && state.tick >= totalTicks) break;
    if (tick % 20 === 0) think();
    step(state, ctx, queue.splice(0));
    const b = buildings();
    const min = state.tick / 600;
    if (t10 < 0 && b > 10) t10 = min;
    if (t25 < 0 && b > 25) t25 = min;
    if (state.tick % 600 === 0 && state.phase === 'running')
      perMinute.push({ min, wood: Math.floor(p().wood / 1000), buildings: b, collected: Math.floor(p().stats.woodCollected / 1000), forest: Math.round(territoryForest()) });
  }
  const s = p().stats;
  const choppers = mine('woodchopper');
  const idle = choppers.filter((c) => state.forestPool[idxOf(c)!] === 0 && state.debris[idxOf(c)!] === 0).length;
  const kinds = Object.fromEntries(STRUCTS.map((k) => [k, n2(k)]).filter(([, v]) => v));
  function n2(k: StructureKind) {
    return mine(k).length;
  }
  const levels = ctx.upgrades.types.map((t, i) => [t.type, p().upgrades[i]!.levels.join('/')]).filter(([, l]) => l !== '0/0');
  return {
    name: st.name,
    buildings: buildings(),
    kinds,
    carriers: count('carrier'),
    guards: count('guard'),
    t10: t10 < 0 ? null : +t10.toFixed(1),
    t25: t25 < 0 ? null : +t25.toFixed(1),
    collected: Math.floor(s.woodCollected / 1000),
    chopped: Math.floor(s.woodChopped / 1000),
    perMin: +(s.woodCollected / 1000 / MINUTES).toFixed(1),
    woodLeft: Math.floor(p().wood / 1000),
    forestLeft: Math.round(territoryForest()),
    idleChoppers: `${idle}/${choppers.length}`,
    upgrades: Object.fromEntries(levels),
    at: Object.fromEntries([10, 20, 30, 45, 60].map((m) => [m, perMinute.find((x) => Math.round(x.min) === m)?.buildings ?? null])),
  };
}

const results = strategies.map(play);
for (const r of results)
  console.log(
    `${r.name.padEnd(18)} bldg ${String(r.buildings).padStart(3)} | t10 ${String(r.t10 ?? '-').padStart(5)} t25 ${String(r.t25 ?? '-').padStart(5)} | ` +
      `collected ${String(r.collected).padStart(5)} (${r.perMin}/min) chopped ${r.chopped} | forest left ${r.forestLeft} idle ${r.idleChoppers} | ` +
      `bldg@10/20/30/45/60 ${Object.values(r.at).join('/')} | ${JSON.stringify(r.kinds)} carriers ${r.carriers} guards ${r.guards} | upg ${JSON.stringify(r.upgrades)}`,
  );
if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 1));
