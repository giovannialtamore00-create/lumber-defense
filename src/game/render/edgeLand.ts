// Non-playable land around the map (render only): mountains to the north, forest to the west and east, plains to
// the south. It fills the screen around the playable hexes and darkens with distance, fading into the screen edge
// where the UI panels sit. Rivers that leave the map carry on into it. Nothing here touches the sim.
import type Phaser from 'phaser';
import type { MapData } from '../../sim/map';
import { HEX_SIZE, hexCorners, hexToScreen } from '../iso';
import { addPackSprite, addWaterSprite, packScale } from './sprites';

/** How far the edge land reaches, in hex rows / columns, past each side of the map. East is wider (build panel). */
const ROWS_N = 16;
const ROWS_S = 16;
const COLS_W = 14;
const COLS_E = 22;
/** Drawn under the map, so the playable map's southern edge reads as a raised plateau. */
const DEPTH = -1;

/** Stable pseudo-random 0..1 per hex, so the scenery looks the same every time. */
function noise(q: number, r: number, salt = 0): number {
  let h = Math.imul(q * 73856093 + salt * 83492791, 1) ^ Math.imul(r, 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Brightness by distance from the playable map: dimmed right away so it reads as off-limits, near black far out. */
function brightness(d: number): number {
  return Math.max(0.14, 0.74 - 0.1 * (d - 1));
}

/** A warm grey tint at that brightness (matches the dark wood background). */
function tint(b: number): number {
  return (Math.round(b * 255) << 16) | (Math.round(b * 236) << 8) | Math.round(b * 206);
}

function shade(color: number, b: number): number {
  const r = Math.round(((color >> 16) & 255) * b);
  const g = Math.round(((color >> 8) & 255) * b);
  const bl = Math.round((color & 255) * b);
  return (r << 16) | (g << 8) | bl;
}

/** Draws the edge land. Returns the world rectangle it covers. */
export function drawEdgeLand(scene: Phaser.Scene, map: MapData, art: boolean): { minX: number; maxX: number; minY: number; maxY: number } {
  const rows = map.hexes.map((h) => h.r);
  const cols = map.hexes.map((h) => h.q + Math.floor(h.r / 2));
  const r0 = Math.min(...rows);
  const r1 = Math.max(...rows);
  const c0 = Math.min(...cols);
  const c1 = Math.max(...cols);
  const onMap = new Set(map.hexes.map((h) => `${h.q},${h.r}`));
  const scale = packScale(HEX_SIZE);

  // Rivers leaving the map carry on: upstream into the mountains from the top row, downstream into the plains.
  const water = new Map<string, { flow: 'SE' | 'SW'; strength: number }>();
  for (const h of map.hexes) {
    if (h.terrain !== 'river' || (h.r !== r0 && h.r !== r1)) continue;
    let { q, r } = h;
    const north = h.r === r0;
    for (let k = 0; k < (north ? ROWS_N : ROWS_S); k++) {
      // Zig-zag straight up or down: alternate the two neighbours in that direction.
      const left = (r + k) % 2 === 0;
      if (north) {
        const up = left ? { q, r: r - 1 } : { q: q + 1, r: r - 1 };
        water.set(`${up.q},${up.r}`, { flow: left ? 'SE' : 'SW', strength: 0 });
        ({ q, r } = up);
      } else {
        const down = left ? { q: q - 1, r: r + 1 } : { q, r: r + 1 };
        water.set(`${down.q},${down.r}`, { flow: left ? 'SW' : 'SE', strength: 1 });
        ({ q, r } = down);
      }
    }
  }

  const peaks = scene.add.graphics().setDepth(DEPTH + 0.5);
  const flat = art ? null : scene.add.graphics().setDepth(DEPTH);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let r = r0 - ROWS_N; r <= r1 + ROWS_S; r++) {
    for (let c = c0 - COLS_W; c <= c1 + COLS_E; c++) {
      const q = c - Math.floor(r / 2);
      if (onMap.has(`${q},${r}`)) continue;
      const at = hexToScreen({ q, r });
      minX = Math.min(minX, at.x);
      maxX = Math.max(maxX, at.x);
      minY = Math.min(minY, at.y);
      maxY = Math.max(maxY, at.y);
      const dr = r < r0 ? r0 - r : r > r1 ? r - r1 : 0;
      const dc = c < c0 ? c0 - c : c > c1 ? c - c1 : 0;
      const d = Math.max(dr, dc);
      const b = brightness(d);
      const kind = r < r0 ? 'mountain' : dc >= dr ? 'forest' : 'plain';
      const w = water.get(`${q},${r}`);

      if (flat) {
        const fill = w ? 0x5f9fd0 : kind === 'mountain' ? 0x8d8579 : kind === 'forest' ? 0x4f7a3a : 0x7aa457;
        flat.fillStyle(shade(fill, b), 1).fillPoints(hexCorners(at), true);
      } else if (w) {
        addWaterSprite(scene, at.x, at.y, w.flow, w.strength)?.setScale(scale).setTint(tint(b)).setDepth(DEPTH);
      } else {
        const frame = kind === 'mountain' ? 'hex_rock' : kind === 'forest' ? 'hex_forest' : 'hex_land';
        addPackSprite(scene, frame, at.x, at.y)?.setScale(scale).setTint(tint(b)).setDepth(DEPTH);
        // A few extra trees in the forests and on the plains, so the edges don't look tiled.
        const n = noise(q, r);
        if ((kind === 'forest' && n < 0.55) || (kind === 'plain' && n < 0.12)) {
          const tree = kind === 'forest' ? 'tree_pine' : 'tree_round';
          addPackSprite(scene, tree, at.x + (noise(q, r, 1) - 0.5) * HEX_SIZE * 0.9, at.y + (noise(q, r, 2) - 0.5) * HEX_SIZE * 0.4)
            ?.setScale(scale * (0.9 + n))
            .setTint(tint(b))
            .setDepth(DEPTH + 0.1);
        }
      }
      if (kind === 'mountain' && !w) drawPeak(peaks, at, dr, b, noise(q, r, 3));
    }
  }
  return { minX, maxX, minY, maxY };
}

/** One mountain on a hex: foothills next to the map, taller snowy peaks further north. Lit from the west. */
function drawPeak(g: Phaser.GameObjects.Graphics, at: { x: number; y: number }, dr: number, b: number, n: number): void {
  const h = HEX_SIZE * (0.45 + 0.2 * Math.min(dr, 6) + 0.35 * n);
  const half = HEX_SIZE * (0.75 + 0.2 * n);
  const top = { x: at.x + (n - 0.5) * HEX_SIZE * 0.4, y: at.y + 6 - h };
  const baseY = at.y + 8;
  g.fillStyle(shade(0x9a9183, b), 1).fillTriangle(at.x - half, baseY, top.x, top.y, top.x, baseY);
  g.fillStyle(shade(0x5d5449, b), 1).fillTriangle(top.x, baseY, top.x, top.y, at.x + half, baseY);
  if (dr < 3) return;
  // Snow cap on the upper third.
  const s = 0.34;
  const lx = top.x + (at.x - half - top.x) * s;
  const rx = top.x + (at.x + half - top.x) * s;
  const sy = top.y + (baseY - top.y) * s;
  g.fillStyle(shade(0xf1ece0, b), 1).fillTriangle(lx, sy, top.x, top.y, top.x, sy + 3);
  g.fillStyle(shade(0xc2bdb2, b), 1).fillTriangle(top.x, sy + 3, top.x, top.y, rx, sy);
}
