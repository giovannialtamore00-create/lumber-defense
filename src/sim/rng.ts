// Seeded PRNG (mulberry32). The state is a single uint32 so it can live in GameState (ARCHITECTURE.md §5).

export interface Rng {
  state: number;
}

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** Next uint32. Mutates `rng`. */
export function nextU32(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Integer in [0, n). */
export function nextInt(rng: Rng, n: number): number {
  return nextU32(rng) % n;
}
