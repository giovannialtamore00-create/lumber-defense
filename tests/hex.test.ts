import { describe, expect, it } from 'vitest';
import { distance, hexesInRadius, neighbours } from '../src/sim/hex';

describe('hex', () => {
  it('radius 3 covers 37 hexes (DESIGN §5)', () => {
    expect(hexesInRadius({ q: 0, r: 0 }, 3)).toHaveLength(37);
  });

  it('neighbours are all at distance 1', () => {
    const c = { q: 2, r: -1 };
    for (const n of neighbours(c)) expect(distance(c, n)).toBe(1);
  });
});
