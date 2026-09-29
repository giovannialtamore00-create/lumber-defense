// Hex ↔ isometric screen projection (ARCHITECTURE.md §4). Rendering only; the sim never sees screen space.
import type { Hex } from '../sim/hex';

export const HEX_SIZE = 32; // pixels, pointy-top hex radius before squash
export const ISO_SQUASH = 0.62; // vertical squash that turns the flat grid into an isometric view
export const TILE_DEPTH = 7; // pixel height of the tile's side face

export interface Point {
  x: number;
  y: number;
}

export function hexToScreen(h: Hex): Point {
  return {
    x: HEX_SIZE * Math.sqrt(3) * (h.q + h.r / 2),
    y: HEX_SIZE * 1.5 * h.r * ISO_SQUASH,
  };
}

/** Screen (world) point → the hex whose top surface contains it. */
export function screenToHex(p: Point): Hex {
  const r = p.y / ISO_SQUASH / (HEX_SIZE * 1.5);
  const q = p.x / (HEX_SIZE * Math.sqrt(3)) - r / 2;
  // Cube rounding.
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 }; // + 0 turns -0 into 0
}

/** Corner i of a pointy-top hex at `c`, projected. Corner angles are 60°·i − 30° (screen y down). */
export function hexCorner(c: Point, i: number, scale = 1): Point {
  const a = ((60 * i - 30) * Math.PI) / 180;
  return { x: c.x + HEX_SIZE * scale * Math.cos(a), y: c.y + HEX_SIZE * scale * Math.sin(a) * ISO_SQUASH };
}

export function hexCorners(c: Point, scale = 1): Point[] {
  return [0, 1, 2, 3, 4, 5].map((i) => hexCorner(c, i, scale));
}

/** Corner indices of the edge shared with the neighbour in sim DIRECTIONS[k]. */
export function edgeCorners(k: number): [number, number] {
  return [(((-k + 1) % 6) + 6) % 6, (((-k) % 6) + 6) % 6];
}
