// Test helpers: tiny hand-drawn maps and direct state setup.
import baseConfig from '../src/data/config.json';
import { type SimContext, createContext, idx } from '../src/sim/context';
import { toMilli } from '../src/sim/fixed';
import type { Hex } from '../src/sim/hex';
import { type MapData, type MapHex, type Terrain, offsetToAxial } from '../src/sim/map';
import { addEntity, createInitialState } from '../src/sim/state';
import { recomputeCoverage } from '../src/sim/systems/territory';
import type { Config, GameState, Structure, StructureKind } from '../src/sim/types';

const TERRAIN: Record<string, Terrain> = { '.': 'land', T: 'forest', '~': 'river', '=': 'river', '#': 'rock' };

/**
 * Builds a map from ASCII rows (odd-r offset, row 0 = north): `.` land, `T` forest, `~` river 0, `=` river 1,
 * `#` rock. Spaces are ignored. Each river hex flows to the river hexes directly south of it; on the last row it
 * exits. All region 0; no waterfall, so river strength row = map row + 1.
 */
export function asciiMap(rows: string[]): MapData {
  const grid = rows.map((row) => row.replace(/\s/g, '').split(''));
  const hexes: MapHex[] = [];
  grid.forEach((cells, row) =>
    cells.forEach((ch, col) => {
      const h: MapHex = { ...offsetToAxial(col, row), terrain: TERRAIN[ch]!, region: 0 };
      if (h.terrain === 'forest') h.woodPool = baseConfig.forest.woodPool;
      if (h.terrain === 'river') h.river = ch === '=' ? 1 : 0;
      hexes.push(h);
    }),
  );
  const isRiver = (h: Hex) => hexes.some((x) => x.q === h.q && x.r === h.r && x.terrain === 'river');
  const last = grid.length - 1;
  const riverFlow = hexes
    .filter((h) => h.terrain === 'river')
    .map((h) => {
      if (h.r === last) return { q: h.q, r: h.r, down: 'exit' as const };
      const south = [
        { q: h.q - 1, r: h.r + 1 },
        { q: h.q, r: h.r + 1 },
      ].filter(isRiver);
      return { q: h.q, r: h.r, down: south };
    });
  return { id: 'test', name: 'test', width: grid[0]!.length, height: grid.length, hexes, riverFlow, waterfallAfterRows: [] };
}

export function withConfig(patch: (c: Config) => void): Config {
  const c = structuredClone(baseConfig) as Config;
  patch(c);
  return c;
}

/** The base config without passive income, so tests can count wood exactly. Income has its own test. */
export const quietConfig: Config = withConfig((c) => (c.passiveIncome.wood = 0));

export function setup(rows: string[], config: Config = quietConfig, players = 1, seed = 1) {
  const map = asciiMap(rows);
  const ctx: SimContext = createContext(map, config);
  const state: GameState = createInitialState(ctx, players, seed);
  for (const p of state.players) p.region = 0;
  // System tests run with the game clock going; the starting turns have their own tests.
  state.phase = 'running';
  return { map, ctx, state };
}

/** Axial hex of (col, row) in an ASCII map. */
export const cell = (col: number, row: number) => offsetToAxial(col, row);

/** Puts a structure straight into the state (bypassing commands), recomputing coverage for outposts. */
export function put(state: GameState, ctx: SimContext, kind: StructureKind, owner: number, h: Hex): Structure {
  const s = addEntity<Structure>(state, { type: 'structure', kind, owner, q: h.q, r: h.r, hp: 1 });
  if (kind === 'outpost') {
    recomputeCoverage(state, ctx);
    state.players[owner]!.started = true;
  }
  return s;
}

export function setStack(state: GameState, ctx: SimContext, h: Hex, wood: number): void {
  state.stacks[idx(ctx, h)!] = toMilli(wood);
}

export function stackOf(state: GameState, ctx: SimContext, h: Hex): number {
  return state.stacks[idx(ctx, h)!]! / 1000;
}
