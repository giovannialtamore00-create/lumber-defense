// Generates src/data/maps/map01.json: a fixed layout (the same every match, DESIGN §4.2).
// Rivers are hand-authored; forests and rocks are placed with a fixed seed under the map rules. Run once, then the
// JSON is the map. Re-running with the same seed reproduces it exactly.
//
//   npx tsx tools/gen-map01.ts [seed]
import { writeFileSync } from 'node:fs';
import config from '../src/data/config.json';
import { type Hex, distance, hexKey, neighbours } from '../src/sim/hex';
import { type MapData, type MapHex, type RiverFlow, offsetToAxial } from '../src/sim/map';
import { createRng, nextInt } from '../src/sim/rng';
import { checkMap, isUpperHalf } from './mapChecks';

const WIDTH = 18;
const HEIGHT = 16;
const seed = Number(process.argv[2] ?? 1);
const rng = createRng(seed);
const rules = config.mapRules; // now map02's rules: map01 is kept for reference and older tests
const FOREST_UPPER_SHARE_PCT = 85; // map01's rule, removed from config with map02

// --- Regions: 2×2 quadrants of 9×8 hexes (designer decision). 0 = NW, 1 = NE, 2 = SW, 3 = SE.
// The waterfall sits on the north/south border, so both halves of every river have the same slope.
const WATERFALL_AFTER_ROW = HEIGHT / 2 - 1;
const regionOf = (col: number, row: number) => (row < HEIGHT / 2 ? 0 : 2) + (col < WIDTH / 2 ? 0 : 1);

const hexes: MapHex[] = [];
for (let row = 0; row < HEIGHT; row++)
  for (let col = 0; col < WIDTH; col++) hexes.push({ ...offsetToAxial(col, row), terrain: 'land', region: regionOf(col, row) });
const idx = new Map(hexes.map((h) => [hexKey(h), h]));
const at = (h: Hex) => idx.get(hexKey(h));

// --- Rivers. Moves: L = south-west (q-1, r+1), R = south-east (q, r+1).
const down = new Map<string, Hex[] | 'exit'>();
const step = (h: Hex, m: string): Hex => (m === 'L' ? { q: h.q - 1, r: h.r + 1 } : { q: h.q, r: h.r + 1 });

/**
 * Lays river `id` from `start` along `moves`. Stops early when it joins an existing river (a merge); the hexes it
 * joins keep their own river id. A fork branch passes its parent's id.
 */
function river(id: number, start: Hex, moves: string): Hex {
  let h = start;
  const lay = (x: Hex) => {
    const t = at(x)!;
    if (t.terrain !== 'river') t.river = id;
    t.terrain = 'river';
  };
  lay(h);
  for (const m of moves) {
    const next = step(h, m);
    if (!at(next)) throw new Error(`river leaves the map at ${hexKey(next)}`);
    const cur = down.get(hexKey(h));
    down.set(hexKey(h), [...(cur && cur !== 'exit' ? cur : []), next]);
    const joined = at(next)!.terrain === 'river';
    lay(next);
    h = next;
    if (joined) break;
  }
  return h;
}

// Forks and merges (designer decision). Water stays near 15%: the fork's extra branch is paid for by the central
// river merging into the east river instead of running to the edge on its own.
// West river: through NW, then forks around an island in SW and merges again.
// River ids: 0 = west, 1 = central, 2 = east.
const wFork = river(0, offsetToAxial(3, 0), 'RRLLRLRLRL');
river(0, wFork, 'LLRRR');
river(0, wFork, 'RRRLL');

// East river: through NE, then bends west through SE.
river(2, offsetToAxial(14, 0), 'LLRRLLLLLLLLLLL');
// Central river: zigzags down the west/east border (columns 8 and 9) so it touches all four regions, then merges into
// the east river.
river(1, offsetToAxial(8, 0), 'RRLRLRLRLRRRRRR');

for (const h of hexes) if (h.terrain === 'river' && h.r === HEIGHT - 1) down.set(hexKey(h), 'exit');

// Distance from each hex to the nearest river hex (forest grows out from the water).
const riverDist = new Map<string, number>();
{
  let frontier = hexes.filter((h) => h.terrain === 'river');
  for (const h of frontier) riverDist.set(hexKey(h), 0);
  for (let d = 1; frontier.length; d++) {
    const next: MapHex[] = [];
    for (const h of frontier)
      for (const n of neighbours(h).map(at)) if (n && !riverDist.has(hexKey(n))) (riverDist.set(hexKey(n), d), next.push(n));
    frontier = next;
  }
}

// --- Forests, per region: mostly in the upper half, growing out from the river (designer decision).
const rad = rules.forestCoverageRadius;
const pick = <T>(xs: T[]): T => xs[nextInt(rng, xs.length)]!;
// Carriers move only east/west, so the hexes directly east and west of every river hex stay free as drop-off banks.
const banks = new Set(
  hexes
    .filter((h) => h.terrain === 'river')
    .flatMap((h) => [{ q: h.q - 1, r: h.r }, { q: h.q + 1, r: h.r }])
    .filter((b) => at(b)?.terrain === 'land')
    .map(hexKey),
);
const isFree = (h: MapHex | undefined, region: number) => !!h && h.region === region && h.terrain === 'land' && !banks.has(hexKey(h));
const dist = (h: Hex) => riverDist.get(hexKey(h))!;
/** Random pick among the candidates closest to the water (within one step of the closest). */
const pickNearWater = (xs: MapHex[]) => {
  const best = Math.min(...xs.map(dist));
  return pick(xs.filter((h) => dist(h) <= best + 1));
};

for (let region = 0; region < rules.regionCount; region++) {
  const own = hexes.filter((h) => h.region === region);
  const upper = own.filter((h) => isUpperHalf(h, own));
  const lower = own.filter((h) => !isUpperHalf(h, own));
  const plant = (h: MapHex) => {
    h.terrain = 'forest';
    h.woodPool = config.forest.woodPool;
  };
  const upperTarget = Math.round((rules.forestPerRegion.target * FOREST_UPPER_SHARE_PCT) / 100);

  // Coverage first: every upper-half hex gets a forest within radius 3.
  for (;;) {
    const forests = upper.filter((h) => h.terrain === 'forest');
    const uncovered = upper.filter((c) => !forests.some((f) => distance(c, f) <= rad));
    if (uncovered.length === 0) break;
    const c = pick(uncovered);
    const near = upper.filter((h) => isFree(h, region) && distance(c, h) <= rad - 1);
    const reach = upper.filter((h) => isFree(h, region) && distance(c, h) <= rad);
    // Last resort: a bank hex (the validator still checks every forest keeps a drop-off in its row).
    const sandwiched = (h: Hex) => at({ q: h.q - 1, r: h.r })?.terrain === 'river' && at({ q: h.q + 1, r: h.r })?.terrain === 'river';
    const bank = upper.filter((h) => h.terrain === 'land' && banks.has(hexKey(h)) && !sandwiched(h) && distance(c, h) <= rad);
    const options = near.length ? near : reach.length ? reach : bank;
    if (options.length === 0) break; // can't cover: the validator reports it
    plant(pickNearWater(options));
  }

  // Then grow out from the water, in each half up to its share.
  const grow = (area: MapHex[], target: number) => {
    const inArea = new Set(area.map(hexKey));
    while (area.filter((h) => h.terrain === 'forest').length < target) {
      const edge = area.filter(
        (h) => isFree(h, region) && neighbours(h).some((n) => { const t = at(n); return !!t && inArea.has(hexKey(t)) && (t.terrain === 'forest' || t.terrain === 'river'); }),
      );
      const candidates = edge.length ? edge : area.filter((h) => isFree(h, region));
      if (candidates.length === 0) return; // area full: the validator reports the shortfall
      plant(pickNearWater(candidates));
    }
  };
  grow(upper, upperTarget);
  grow(lower, rules.forestPerRegion.target - upperTarget);
}

const riverFlow: RiverFlow[] = hexes
  .filter((h) => h.terrain === 'river')
  .map((h) => ({ q: h.q, r: h.r, down: down.get(hexKey(h)) ?? [] }));

const map: MapData = { id: 'map01', name: 'Map 01', width: WIDTH, height: HEIGHT, hexes, riverFlow, waterfallAfterRows: [WATERFALL_AFTER_ROW] };
/** Number of forest hexes without a drop-off in their row (the check's detail starts with the count). */
const strandedForests = () =>
  parseInt(checkMap(map, config).find((c) => c.name === 'every forest has a riverside drop-off in its row')!.detail, 10);

// --- Rocks: ~5% of the map, spread evenly over regions, never touching another rock or a river, and never cutting a
// forest off from its drop-off bank.
const rockTotal = Math.round((hexes.length * rules.rockRatio.targetPct) / 100);
for (let i = 0; i < rockTotal; i++) {
  const region = i % rules.regionCount;
  const spots = hexes.filter((h) => isFree(h, region) && !neighbours(h).some((n) => ['rock', 'river'].includes(at(n)?.terrain ?? '')));
  const before = strandedForests();
  while (spots.length) {
    const spot = spots.splice(nextInt(rng, spots.length), 1)[0]!;
    spot.terrain = 'rock';
    if (strandedForests() <= before) break;
    spot.terrain = 'land';
  }
}

const failures = checkMap(map, config).filter((c) => !c.ok);
for (const f of failures) console.log(`FAIL ${f.name}: ${f.detail}`);

const json =
  '{\n' +
  `  "id": "${map.id}",\n  "name": "${map.name}",\n  "width": ${WIDTH},\n  "height": ${HEIGHT},\n` +
  `  "waterfallAfterRows": ${JSON.stringify(map.waterfallAfterRows)},\n` +
  '  "hexes": [\n' + hexes.map((h) => '    ' + JSON.stringify(h)).join(',\n') + '\n  ],\n' +
  '  "riverFlow": [\n' + riverFlow.map((f) => '    ' + JSON.stringify(f)).join(',\n') + '\n  ]\n}\n';
writeFileSync('src/data/maps/map01.json', json);

// ASCII preview: ~ river, T forest, # rock, . land. Odd rows are indented half a cell; the waterfall is a dashed line.
for (let row = 0; row < HEIGHT; row++) {
  let line = row & 1 ? ' ' : '';
  for (let col = 0; col < WIDTH; col++) {
    const h = at(offsetToAxial(col, row))!;
    line += { land: '.', forest: 'T', river: '~', rock: '#' }[h.terrain] + ' ';
  }
  console.log(line);
  if (row === WATERFALL_AFTER_ROW) console.log('- - - - - - - - - - waterfall - - - - - - - - - -');
}
console.log(`seed ${seed}: ${failures.length} failing checks`);
