// Axial hex coordinates (q, r). Pure, deterministic helpers (ARCHITECTURE.md §4).

export interface Hex {
  q: number;
  r: number;
}

// Fixed neighbour order: deterministic iteration everywhere (ARCHITECTURE.md §5).
export const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexKey(h: Hex): string {
  return `${h.q},${h.r}`;
}

export function neighbours(h: Hex): Hex[] {
  return DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

export function distance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** All hexes within `radius` of `center`, in a fixed order. Radius 3 → 37 hexes. */
export function hexesInRadius(center: Hex, radius: number): Hex[] {
  const out: Hex[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius);
    const rMax = Math.min(radius, -dq + radius);
    for (let dr = rMin; dr <= rMax; dr++) out.push({ q: center.q + dq, r: center.r + dr });
  }
  return out;
}
