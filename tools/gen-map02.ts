// Generates src/data/maps/map02.json: a fixed layout (the same every match, DESIGN §4.2). Approved 2026-10-05.
// 28×24 = 672 hexes, 4 vertical strips of 7 columns: 0 = west, 1 = middle-west, 2 = middle-east,
// 3 = east. The top 30% of rows is the mountain: forests grow only there, and also cover the river banks so
// factories can't be built at the riverside up there. Rocks prefer river banks and are twice as likely in the mountain.
//
//   npx tsx tools/gen-map02.ts [seed]
import { writeFileSync } from 'node:fs';
import config from '../src/data/config.json';
import { type Hex, distance, hexKey, neighbours } from '../src/sim/hex';
import { type MapData, type MapHex, type RiverFlow, offsetToAxial } from '../src/sim/map';
import { createRng, nextInt } from '../src/sim/rng';
import { checkMap } from './mapChecks';

const WIDTH = 28;
const HEIGHT = 24;
const STRIP = WIDTH / 4;
const rules = config.mapRules;
const MOUNTAIN_ROWS = rules.mountainRows; // top 30% of the rows
const FOREST_PER_STRIP = rules.mountainForestPerRegion;
const ROCK_PCT = rules.rockRatio.targetPct;
const FOOTHILL_ROWS = rules.foothillRows; // rows below the mountain that still get some forest
const HIGH_ROCK_ROWS = rules.highRockRows; // top rows that receive the rocks moved up from the bottom half
const WATERFALL_AFTER_ROW = HEIGHT / 2 - 1; // rows 0-11 above, 12-23 below
const seed = Number(process.argv[2] ?? 1);
const rng = createRng(seed);

const hexes: MapHex[] = [];
for (let row = 0; row < HEIGHT; row++)
  for (let col = 0; col < WIDTH; col++) hexes.push({ ...offsetToAxial(col, row), terrain: 'land', region: Math.floor(col / STRIP) });
const idx = new Map(hexes.map((h) => [hexKey(h), h]));
const at = (h: Hex) => idx.get(hexKey(h));
const inMountain = (h: Hex) => h.r < MOUNTAIN_ROWS;

// --- Rivers. Moves: L = south-west (q-1, r+1), R = south-east (q, r+1), W = west (q-1), E = east (q+1).
// Sideways steps (W/E) let rivers snake; they never flow uphill.
const down = new Map<string, Hex[] | 'exit'>();
const MOVES: Record<string, Hex> = { L: { q: -1, r: 1 }, R: { q: 0, r: 1 }, W: { q: -1, r: 0 }, E: { q: 1, r: 0 } };
const step = (h: Hex, m: string): Hex => ({ q: h.q + MOVES[m]!.q, r: h.r + MOVES[m]!.r });

/** Lays river `id` from `start` along `moves`. Stops early when it joins an existing river (a merge). */
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

// River ids: 0 = river 1, 1 = river 2, 2 = river 3 (designer layout, 2026-10-05).
// River 1: from the east strip diagonally south-west; forks in middle-east. One branch turns back into the east strip,
// the other keeps going south-west into middle-west and leaves at the south edge.
const fork = river(0, offsetToAxial(24, 0), 'LLWLRLLRLLRL');
river(0, fork, 'LLWLLRLWWLLLLWLL');
river(0, fork, 'RRELRRLRERLRLR');
// River 2: from middle-east, straight away south-west into middle-west, then on through the merge into the west strip.
river(1, offsetToAxial(16, 0), 'LWLLLLLWLRLLLLLWLRLLLWLLRLL');
// River 3: from the west strip south-east; joins river 2 halfway down in middle-west.
river(2, offsetToAxial(3, 0), 'RRERLRRRERRLRR');

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
const dist = (h: Hex) => riverDist.get(hexKey(h))!;
const touchesRiver = (h: Hex) => neighbours(h).some((n) => at(n)?.terrain === 'river');

// --- Forests: only in the mountain. River banks first, then coverage (radius 3), then grow out from the water.
const pick = <T>(xs: T[]): T => xs[nextInt(rng, xs.length)]!;
const plant = (h: MapHex) => {
  h.terrain = 'forest';
  h.woodPool = config.forest.woodPool;
};
const rad = config.mapRules.forestCoverageRadius;
for (const h of hexes) if (inMountain(h) && h.terrain === 'land' && touchesRiver(h)) plant(h);
for (let region = 0; region < 4; region++) {
  const area = hexes.filter((h) => h.region === region && inMountain(h));
  const free = () => area.filter((h) => h.terrain === 'land');
  const pickNearWater = (xs: MapHex[]) => {
    const best = Math.min(...xs.map(dist));
    return pick(xs.filter((h) => dist(h) <= best + 1));
  };
  for (;;) {
    const forests = area.filter((h) => h.terrain === 'forest');
    const uncovered = area.filter((c) => !forests.some((f) => distance(c, f) <= rad));
    if (uncovered.length === 0) break;
    const c = pick(uncovered);
    const options = free().filter((h) => distance(c, h) <= rad - 1);
    if (options.length === 0) break;
    plant(pickNearWater(options));
  }
  while (area.filter((h) => h.terrain === 'forest').length < FOREST_PER_STRIP) {
    const edge = free().filter((h) => neighbours(h).some((n) => ['forest', 'river'].includes(at(n)?.terrain ?? '')));
    const candidates = edge.length ? edge : free();
    if (candidates.length === 0) break;
    plant(pickNearWater(candidates));
  }
}

/** Random pick from `spots`, a hex with weight 2 twice as likely as one with weight 1. */
const pickWeighted = (spots: MapHex[], weight: (h: MapHex) => number) => {
  let roll = nextInt(rng, spots.reduce((s, h) => s + weight(h), 0));
  return spots.find((h) => (roll -= weight(h)) < 0)!;
};

// --- Foothills: the 2 rows below the mountain get forest at half the mountain's density, mostly by the rivers
// (weight 10 next to a river).
{
  const mountainGround = hexes.filter((h) => inMountain(h) && h.terrain !== 'river');
  const density = mountainGround.filter((h) => h.terrain === 'forest').length / mountainGround.length;
  const foothills = hexes.filter((h) => h.r >= MOUNTAIN_ROWS && h.r < MOUNTAIN_ROWS + FOOTHILL_ROWS && h.terrain === 'land');
  const target = Math.round((foothills.length * density * rules.foothillForestDensityPct) / 100);
  for (let i = 0; i < target; i++) {
    const spot = pickWeighted(foothills.filter((h) => h.terrain === 'land'), (h) => (touchesRiver(h) ? 10 : 1));
    plant(spot);
  }
}

// --- Rocks: ~5% of the map, never touching another rock. Weight 3 next to a river, ×2 in the mountain.
// A rock never cuts a forest off from its riverside drop-off (carriers can't pass rocks).
const rockTotal = Math.round((hexes.length * ROCK_PCT) / 100);
const rockSpots = (area: (h: MapHex) => boolean) =>
  hexes.filter((h) => area(h) && h.terrain === 'land' && !neighbours(h).some((n) => at(n)?.terrain === 'rock'));
/** Forest hexes with no rock-free route to the hex before a river in their row, within the carrier's reach. */
const strandedForests = () => {
  const reach = config.carrier.maxRouteDistance;
  const free = (f: MapHex, dir: number) => {
    for (let d = 1; d <= reach + 1; d++) {
      const h = at({ q: f.q + dir * d, r: f.r });
      if (!h || h.terrain === 'rock') return false;
      if (h.terrain === 'river') return true;
    }
    return false;
  };
  return hexes.filter((f) => f.terrain === 'forest' && !free(f, -1) && !free(f, 1)).length;
};
const placeRock = (spots: MapHex[], weight: (h: MapHex) => number) => {
  const before = strandedForests();
  while (spots.length) {
    const spot = pickWeighted(spots, weight);
    spot.terrain = 'rock';
    if (strandedForests() <= before) return;
    spot.terrain = 'land';
    spots.splice(spots.indexOf(spot), 1);
  }
};
for (let i = 0; i < rockTotal; i++) placeRock(rockSpots(() => true), (h) => (touchesRiver(h) ? 3 : 1) * (inMountain(h) ? 2 : 1));
// Then half the rocks in the bottom half move up into the first 3 rows of the mountain (designer decision).
{
  const bottom = hexes.filter((h) => h.r > WATERFALL_AFTER_ROW && h.terrain === 'rock');
  const moved = Math.floor(bottom.length / 2);
  for (let i = 0; i < moved; i++) bottom.splice(nextInt(rng, bottom.length), 1)[0]!.terrain = 'land';
  for (let i = 0; i < moved; i++) placeRock(rockSpots((h) => h.r < HIGH_ROCK_ROWS), (h) => (touchesRiver(h) ? 3 : 1));
}

const riverFlow: RiverFlow[] = hexes
  .filter((h) => h.terrain === 'river')
  .map((h) => ({ q: h.q, r: h.r, down: down.get(hexKey(h)) ?? [] }));
const map: MapData = { id: 'map02', name: 'Map 02', width: WIDTH, height: HEIGHT, hexes, riverFlow, waterfallAfterRows: [WATERFALL_AFTER_ROW] };

const json =
  '{\n' +
  `  "id": "${map.id}",\n  "name": "${map.name}",\n  "width": ${WIDTH},\n  "height": ${HEIGHT},\n` +
  `  "waterfallAfterRows": ${JSON.stringify(map.waterfallAfterRows)},\n` +
  '  "hexes": [\n' + hexes.map((h) => '    ' + JSON.stringify(h)).join(',\n') + '\n  ],\n' +
  '  "riverFlow": [\n' + riverFlow.map((f) => '    ' + JSON.stringify(f)).join(',\n') + '\n  ]\n}\n';
writeFileSync('src/data/maps/map02.json', json);

const count = (t: string) => hexes.filter((h) => h.terrain === t).length;
const pct = (n: number) => ((n * 100) / hexes.length).toFixed(1) + '%';
console.log(`seed ${seed}: ${hexes.length} hexes; river ${count('river')} (${pct(count('river'))}), forest ${count('forest')} (${pct(count('forest'))}), rock ${count('rock')} (${pct(count('rock'))})`);
for (let r = 0; r < 4; r++) console.log(`  strip ${r}: forest ${hexes.filter((h) => h.region === r && h.terrain === 'forest').length}, rock ${hexes.filter((h) => h.region === r && h.terrain === 'rock').length}, river ${hexes.filter((h) => h.region === r && h.terrain === 'river').length}`);
for (const f of checkMap(map, config).filter((c) => !c.ok)) console.log(`  FAIL ${f.name}: ${f.detail}`);
