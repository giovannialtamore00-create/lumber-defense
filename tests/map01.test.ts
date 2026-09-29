import { describe, expect, it } from 'vitest';
import config from '../src/data/config.json';
import map01 from '../src/data/maps/map01.json';
import type { MapData } from '../src/sim/map';
import { checkMap } from '../tools/mapChecks';

describe('map01', () => {
  it('passes every map rule check', () => {
    const failed = checkMap(map01 as MapData, config).filter((c) => !c.ok);
    expect(failed).toEqual([]);
  });
});
