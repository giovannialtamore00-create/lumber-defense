import { describe, expect, it } from 'vitest';
import map01 from '../src/data/maps/map01.json';
import { HEX_SIZE, hexToScreen, screenToHex } from '../src/game/iso';

describe('isometric picking', () => {
  it('a point near a hex centre picks that hex', () => {
    for (const h of map01.hexes) {
      const c = hexToScreen(h);
      for (const [dx, dy] of [[0, 0], [HEX_SIZE * 0.5, 0], [-HEX_SIZE * 0.5, 0], [0, HEX_SIZE * 0.3], [0, -HEX_SIZE * 0.3]] as const) {
        expect(screenToHex({ x: c.x + dx, y: c.y + dy })).toEqual({ q: h.q, r: h.r });
      }
    }
  });
});
