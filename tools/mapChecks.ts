// Map rule checks (DESIGN.md §4.3, ARCHITECTURE.md §4). Shared by validate-map, the map generator and tests.
import { type Hex, distance, hexKey, hexesInRadius, neighbours } from '../src/sim/hex';
import { type MapData, type MapHex, indexHexes } from '../src/sim/map';

export interface MapRules {
  totalHexes: { target: number; tolerancePct: number };
  regionCount: number;
  regionHexes: { target: number; tolerancePct: number };
  forestPerRegion: { target: number; tolerance: number };
  mountainRows: number;
  mountainForestPerRegion: number;
  foothillRows: number;
  foothillForestDensityPct: number;
  highRockRows: number;
  forestCoverageRadius: number;
  rockRatio: { targetPct: number; tolerancePct: number };
  waterRatio: { targetPct: number; tolerancePct: number };
  minOwnRiverRowsPerRegion: number;
  minLowerRiversideLandPerRegion: number;
}

/** The parts of src/data/config.json the map checks read. */
export interface MapCheckConfig {
  forest: { woodPool: number };
  outpost: { territoryRadius: number; firstTerritoryRadius: number };
  carrier: { maxRouteDistance: number };
  mapRules: MapRules;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const pct = (n: number, d: number) => (100 * n) / d;
const fmt = (x: number) => x.toFixed(1);

/** True if `h` lies in the northern half of its region's rows. */
export function isUpperHalf(h: Hex, regionHexes: Hex[]): boolean {
  const rows = regionHexes.map((x) => x.r);
  const top = Math.min(...rows);
  const height = Math.max(...rows) - top + 1;
  return h.r - top < height / 2;
}

export function checkMap(map: MapData, config: MapCheckConfig): CheckResult[] {
  const rules = config.mapRules;
  const forestWoodPool = config.forest.woodPool;
  const carrierMaxRoute = config.carrier.maxRouteDistance;
  const out: CheckResult[] = [];
  const add = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const idx = indexHexes(map);
  const total = map.hexes.length;
  const regions = [...Array(rules.regionCount).keys()];
  const inRegion = (r: number) => map.hexes.filter((h) => h.region === r);
  const riverside = (h: MapHex) => h.terrain === 'land' && neighbours(h).some((n) => idx.get(hexKey(n))?.terrain === 'river');

  // --- Basic integrity
  add('unique coordinates', idx.size === total, `${total} hexes, ${idx.size} unique`);
  const badTerrain = map.hexes.filter((h) => !['land', 'forest', 'river', 'rock'].includes(h.terrain));
  add('valid terrain', badTerrain.length === 0, `${badTerrain.length} invalid`);
  const badRegion = map.hexes.filter((h) => !Number.isInteger(h.region) || h.region < 0 || h.region >= rules.regionCount);
  add('valid region ids', badRegion.length === 0, `${badRegion.length} invalid`);
  const badPool = map.hexes.filter((h) => h.terrain === 'forest' && h.woodPool !== forestWoodPool);
  add('forest wood pools', badPool.length === 0, `${badPool.length} forest hexes without woodPool ${forestWoodPool}`);

  // --- Size and regions
  const tTol = (rules.totalHexes.target * rules.totalHexes.tolerancePct) / 100;
  add('total hexes ≈ target', Math.abs(total - rules.totalHexes.target) <= tTol, `${total} (target ${rules.totalHexes.target} ±${tTol})`);

  const rTol = (rules.regionHexes.target * rules.regionHexes.tolerancePct) / 100;
  for (const r of regions) {
    const hexes = inRegion(r);
    add(`region ${r} size`, Math.abs(hexes.length - rules.regionHexes.target) <= rTol, `${hexes.length} (target ${rules.regionHexes.target} ±${rTol})`);
    const n = components(hexes, idx);
    add(`region ${r} contiguous`, n === 1, n === 1 ? 'one piece' : `${n} separate pieces`);
  }

  // --- Forest
  const fTol = rules.forestPerRegion.tolerance;
  for (const r of regions) {
    const n = inRegion(r).filter((h) => h.terrain === 'forest').length;
    add(`region ${r} forest`, Math.abs(n - rules.forestPerRegion.target) <= fTol, `${n} (target ${rules.forestPerRegion.target} ±${fTol})`);
  }

  // Designer decision (map02): forest grows only in the mountain (top rows) and the foothill rows just below it.
  const forestRows = rules.mountainRows + rules.foothillRows;
  const lowForest = map.hexes.filter((h) => h.terrain === 'forest' && h.r >= forestRows);
  add('forest only in mountain and foothills', lowForest.length === 0, `${lowForest.length} forest hexes below row ${forestRows - 1}${lowForest.length ? ': ' + lowForest.map(hexKey).join(' ') : ''}`);

  // Designer decision (map02): forest covers the mountain's river banks, so no factory can be built riverside there.
  const freeBanks = map.hexes.filter((h) => h.r < rules.mountainRows && riverside(h));
  add('mountain river banks are forest', freeBanks.length === 0, `${freeBanks.length} free riverside land hexes in the mountain${freeBanks.length ? ': ' + freeBanks.map(hexKey).join(' ') : ''}`);

  // DESIGN §4.3 coverage rule, limited to the mountain: a first outpost placed anywhere in the region's mountain has
  // forest of its region within radius 3.
  const rad = rules.forestCoverageRadius;
  for (const r of regions) {
    const own = inRegion(r);
    const forests = own.filter((h) => h.terrain === 'forest');
    const failing = own.filter((c) => c.r < rules.mountainRows && !forests.some((f) => distance(c, f) <= rad));
    add(`region ${r} forest from every mountain outpost spot`, failing.length === 0, `${failing.length} mountain spots without forest within ${rad}${failing.length ? ': ' + failing.map(hexKey).join(' ') : ''}`);
  }

  // Designer decisions: carriers move only east/west within a row and pass through forests and structures. Their
  // drop-off is the first hex before the first river east or west of them (player's choice). Every forest needs at
  // least one such drop-off within the carrier's route distance, with no rock on the way (rocks are obstacles).
  const rowHasRock = (r: number, fromQ: number, toQ: number) =>
    map.hexes.some((m) => m.r === r && m.q >= Math.min(fromQ, toQ) && m.q <= Math.max(fromQ, toQ) && m.terrain === 'rock');
  const hasDropOff = (f: MapHex) =>
    [-1, 1].some((dir) => {
      const ahead = map.hexes.filter((m) => m.r === f.r && m.terrain === 'river' && Math.sign(m.q - f.q) === dir);
      if (ahead.length === 0) return false;
      const first = ahead.reduce((a, b) => (Math.abs(b.q - f.q) < Math.abs(a.q - f.q) ? b : a));
      const dropQ = first.q - dir;
      return Math.abs(dropQ - f.q) <= carrierMaxRoute && !rowHasRock(f.r, f.q, dropQ);
    });
  const stranded = map.hexes.filter((f) => f.terrain === 'forest' && !hasDropOff(f));
  add('every forest has a riverside drop-off in its row', stranded.length === 0, `${stranded.length} forest hexes without one within ${carrierMaxRoute}${stranded.length ? ': ' + stranded.map(hexKey).join(' ') : ''}`);

  // Designer decision: factory-mills go on the riverside, and the river is strongest low in each half, so each region
  // needs free riverside land in its lower half.
  for (const r of regions) {
    const own = inRegion(r);
    const n = own.filter((h) => !isUpperHalf(h, own) && riverside(h)).length;
    add(`region ${r} riverside land in lower half`, n >= rules.minLowerRiversideLandPerRegion, `${n} hexes (min ${rules.minLowerRiversideLandPerRegion})`);
  }

  // Designer decision (DESIGN §5): a first outpost is only valid if its territory contains a forest and a riverside.
  // Outposts go on land. Every region needs somewhere to start.
  const tr = config.outpost.firstTerritoryRadius;
  for (const r of regions) {
    const own = inRegion(r).filter((h) => h.terrain === 'land');
    const valid = own.filter((c) => {
      const territory = hexesInRadius(c, tr).map((h) => idx.get(hexKey(h))).filter((h): h is MapHex => !!h);
      return territory.some((h) => h.terrain === 'forest') && territory.some(riverside);
    });
    add(`region ${r} valid starting spots`, valid.length > 0, `${valid.length} of ${own.length} land hexes have forest and riverside within ${tr}`);
  }

  // --- Rock and water ratios
  const rocks = map.hexes.filter((h) => h.terrain === 'rock').length;
  const rockPct = pct(rocks, total);
  add('rock ratio', Math.abs(rockPct - rules.rockRatio.targetPct) <= rules.rockRatio.tolerancePct, `${rocks} hexes = ${fmt(rockPct)}% (target ${rules.rockRatio.targetPct}% ±${rules.rockRatio.tolerancePct})`);
  const rivers = map.hexes.filter((h) => h.terrain === 'river');
  const waterPct = pct(rivers.length, total);
  add('water ratio', Math.abs(waterPct - rules.waterRatio.targetPct) <= rules.waterRatio.tolerancePct, `${rivers.length} hexes = ${fmt(waterPct)}% (target ${rules.waterRatio.targetPct}% ±${rules.waterRatio.tolerancePct})`);

  // --- River flow: north → south only, every path reaches an exit
  out.push(...checkRivers(map, idx));

  // Designer decision: every region has its own stretch of river, long enough to drop wood upstream and catch it
  // downstream inside the same region.
  for (const r of regions) {
    const span = longestOwnRiverRun(map, idx, r);
    add(`region ${r} own river stretch`, span >= rules.minOwnRiverRowsPerRegion, `${span} rows of connected river inside the region (min ${rules.minOwnRiverRowsPerRegion})`);
  }

  // Designer decision: a waterfall across the map's horizontal middle levels the river slope.
  const rows = map.hexes.map((h) => h.r);
  const midRow = (Math.min(...rows) + Math.max(...rows) - 1) / 2;
  const wf = map.waterfallAfterRows ?? [];
  add('waterfall across the middle', wf.length === 1 && wf[0] === midRow, `after row ${wf.join(', ') || 'none'} (middle: after row ${midRow})`);

  return out;
}

function checkRivers(map: MapData, idx: Map<string, MapHex>): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const rivers = map.hexes.filter((h) => h.terrain === 'river');
  const flowIdx = new Map(map.riverFlow.map((f) => [hexKey(f), f]));
  const maxRow = Math.max(...map.hexes.map((h) => h.r));
  const minRow = Math.min(...map.hexes.map((h) => h.r));

  // Every river hex names its river (double mills count distinct rivers), and flow never switches river except
  // into a merge.
  const noId = rivers.filter((h) => !Number.isInteger(h.river));
  add('river ids', noId.length === 0, `${new Set(rivers.map((h) => h.river)).size} rivers, ${noId.length} river hexes without an id`);

  const missing = rivers.filter((h) => !flowIdx.has(hexKey(h)));
  const extra = map.riverFlow.filter((f) => idx.get(hexKey(f))?.terrain !== 'river');
  add('river flow entries', missing.length === 0 && extra.length === 0, `${missing.length} river hexes without flow, ${extra.length} flow entries on non-river`);

  const problems: string[] = [];
  const upstreamCount = new Map<string, number>();
  for (const f of map.riverFlow) {
    const k = hexKey(f);
    if (f.down === 'exit') {
      if (f.r !== maxRow) problems.push(`${k} exits but is not on the southern edge`);
      continue;
    }
    if (f.down.length === 0 || f.down.length > 2) problems.push(`${k} has ${f.down.length} downstream hexes`);
    for (const d of f.down) {
      const dk = hexKey(d);
      if (idx.get(dk)?.terrain !== 'river') problems.push(`${k} → ${dk} is not river`);
      if (distance(f, d) !== 1) problems.push(`${k} → ${dk} not adjacent`);
      // Designer decision (map02): rivers may also run sideways within a row, but never uphill.
      if (d.r !== f.r + 1 && d.r !== f.r) problems.push(`${k} → ${dk} flows uphill`);
      upstreamCount.set(dk, (upstreamCount.get(dk) ?? 0) + 1);
    }
  }
  add('rivers never flow uphill', problems.length === 0, problems.length ? problems.join('; ') : 'every step goes south or sideways to an adjacent river hex');

  // Every river hex without an upstream must be a source on the northern edge (rivers span the map N→S).
  const sources = rivers.filter((h) => !upstreamCount.has(hexKey(h)));
  const badSources = sources.filter((h) => h.r !== minRow);
  add('rivers start at northern edge', badSources.length === 0, `${sources.length} sources${badSources.length ? ', not on edge: ' + badSources.map(hexKey).join(' ') : ''}`);

  // Every path reaches an exit. Sideways steps could loop, so a hex still being explored counts as stuck.
  const reaches = new Map<string, boolean>();
  const reachesExit = (h: Hex): boolean => {
    const k = hexKey(h);
    const cached = reaches.get(k);
    if (cached !== undefined) return cached;
    reaches.set(k, false);
    const f = flowIdx.get(k);
    const ok = !!f && (f.down === 'exit' || (f.down.length > 0 && f.down.every((d) => d.r >= h.r && reachesExit(d))));
    reaches.set(k, ok);
    return ok;
  };
  const stuck = rivers.filter((h) => !reachesExit(h));
  add('every river path reaches an exit', stuck.length === 0, `${stuck.length} river hexes that don't reach the southern edge`);

  const forks = map.riverFlow.filter((f) => f.down !== 'exit' && f.down.length === 2).length;
  const merges = [...upstreamCount.values()].filter((n) => n > 1).length;
  const exits = map.riverFlow.filter((f) => f.down === 'exit').length;
  // Designer decision: the map uses forks and merges.
  add('rivers fork and merge', forks >= 1 && merges >= 1, `${sources.length} sources, ${forks} forks, ${merges} merges, ${exits} exits`);
  return out;
}

/** Longest chain of river hexes, following the flow, that stays inside region `r` (counted in rows). */
function longestOwnRiverRun(map: MapData, idx: Map<string, MapHex>, r: number): number {
  const flowIdx = new Map(map.riverFlow.map((f) => [hexKey(f), f]));
  const memo = new Map<string, number>();
  const run = (h: Hex): number => {
    const k = hexKey(h);
    const m = memo.get(k);
    if (m !== undefined) return m;
    const f = flowIdx.get(k);
    let best = 1;
    if (f && f.down !== 'exit') for (const d of f.down) if (idx.get(hexKey(d))?.region === r) best = Math.max(best, 1 + run(d));
    memo.set(k, best);
    return best;
  };
  const own = map.hexes.filter((h) => h.terrain === 'river' && h.region === r);
  return own.reduce((best, h) => Math.max(best, run(h)), 0);
}

function components(hexes: MapHex[], idx: Map<string, MapHex>): number {
  if (hexes.length === 0) return 0;
  const region = hexes[0]!.region;
  const seen = new Set<string>();
  let count = 0;
  for (const start of hexes) {
    if (seen.has(hexKey(start))) continue;
    count++;
    const stack: Hex[] = [start];
    seen.add(hexKey(start));
    while (stack.length) {
      for (const n of neighbours(stack.pop()!)) {
        const k = hexKey(n);
        if (!seen.has(k) && idx.get(k)?.region === region) {
          seen.add(k);
          stack.push(n);
        }
      }
    }
  }
  return count;
}
