import { describe, expect, it } from 'vitest';
import config from '../src/data/config.json';
import map02 from '../src/data/maps/map02.json';
import type { MapData } from '../src/sim/map';
import { checkMap } from '../tools/mapChecks';

describe('map02', () => {
  it('passes every map rule check', () => {
    const failed = checkMap(map02 as MapData, config).filter((c) => !c.ok);
    expect(failed).toEqual([]);
  });
});
