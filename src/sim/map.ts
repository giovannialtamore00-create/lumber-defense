// Map data format (ARCHITECTURE.md §4). Loaded from src/data/maps/*.json.
import { type Hex, hexKey } from './hex';

export type Terrain = 'land' | 'forest' | 'river' | 'rock';

export interface MapHex extends Hex {
  terrain: Terrain;
  region: number;
  woodPool?: number;
  /** River hexes only: which river this is (fork branches share their river's id; after a merge, the receiving one). */
  river?: number;
}

export interface RiverFlow extends Hex {
  /** Downstream river hexes (2 at a fork), or "exit" past the southern edge. */
  down: Hex[] | 'exit';
}

export interface MapData {
  id: string;
  name: string;
  /** Layout hint for tools: offset-row rectangle size. The sim only uses `hexes`. */
  width: number;
  height: number;
  hexes: MapHex[];
  riverFlow: RiverFlow[];
  /** Rows with a waterfall on their southern side. The river slope restarts below each one (DESIGN §4.3). */
  waterfallAfterRows: number[];
}

/**
 * River strength level at row `r`: 1 in the first row of the map and right below a waterfall, rising by 1 per row
 * to its maximum on the last row before the next waterfall or the southern edge (DESIGN §4.3).
 */
export function riverStrengthLevel(map: MapData, r: number): number {
  let segmentStart = 0;
  for (const w of map.waterfallAfterRows) if (w < r) segmentStart = Math.max(segmentStart, w + 1);
  return r - segmentStart + 1;
}

/** Rectangle maps use "odd-r" offset rows (odd rows shifted east). North is row 0. */
export function offsetToAxial(col: number, row: number): Hex {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

export function axialToOffset(h: Hex): { col: number; row: number } {
  return { col: h.q + (h.r - (h.r & 1)) / 2, row: h.r };
}

/** Lookup index for a map. For lookups only; never iterate it for gameplay (iterate `map.hexes`). */
export function indexHexes(map: MapData): Map<string, MapHex> {
  const idx = new Map<string, MapHex>();
  for (const h of map.hexes) idx.set(hexKey(h), h);
  return idx;
}
