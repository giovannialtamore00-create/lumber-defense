import { describe, expect, it } from 'vitest';
import config from '../src/data/config.json';
import map02 from '../src/data/maps/map02.json';
import { demoCommands } from '../src/game/demo';
import { SimRunner } from '../src/game/simRunner';
import { LocalNetwork } from '../src/net/localTransport';
import { LockstepSession, type MatchInfo } from '../src/net/lockstep';
import { hashState } from '../src/sim/hash';
import { distance } from '../src/sim/hex';
import { placementError } from '../src/sim/systems/placement';
import type { MapData } from '../src/sim/map';
import type { Structure } from '../src/sim/types';
import type { Config } from '../src/sim/types';

const MAP = map02 as MapData;
const CFG = config as Config;
const TICK_MS = 1000 / CFG.tickRate;

/** Host (slot 0) and one client (slot 1) play with the demo script; slots 2 and 3 are bots. Capped at `minutes`. */
function playMatch(seed: number, minutes: number) {
  const net = new LocalNetwork(() => 1);
  const hostT = net.join('host');
  const clientT = net.join('c1');
  const slots = [{ name: 'Ana' }, { name: 'Ben' }, { name: null }, { name: null }];
  const info = (you: number): MatchInfo => ({ seed, slots, you, hostId: 'host' });
  const host = new SimRunner(MAP, CFG, new LockstepSession(hostT, info(0), true, new Map([['c1', 1]])));
  const client = new SimRunner(MAP, CFG, new LockstepSession(clientT, info(1), false));
  const runners = [host, client];
  for (let frame = 0; frame < minutes * 600 + 600; frame++) {
    net.pump();
    for (const r of runners) {
      for (const c of demoCommands(r, r.localPlayer)) r.submit(c);
      r.update(TICK_MS);
    }
  }
  for (let i = 0; i < 20; i++) {
    net.pump();
    for (const r of runners) r.update(0);
  }
  return { host, client };
}

describe('bots in a real match (M7)', () => {
  it('the host runs the empty slots: bots place, chop and deliver wood, and the client stays in sync', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { host, client } = playMatch(seed, 5);
      // Like battle-sim at 5 minutes (b6 cut238): an outpost, a factory-mill, choppers, wood flowing.
      for (const id of [2, 3]) {
        const p = host.state.players[id]!;
        const kinds = host.state.entities.filter((e) => e.type === 'structure' && e.owner === id).map((e) => (e.type === 'structure' ? e.kind : ''));
        expect(p.bot).toBe(true);
        expect(kinds, `seed ${seed} bot ${id}`).toContain('castle');
        expect(kinds, `seed ${seed} bot ${id}`).toContain('factory');
        expect(kinds.length, `seed ${seed} bot ${id}`).toBeGreaterThanOrEqual(4);
        // The production loop: a dock right next to a factory-mill or the castle.
        const mine = host.state.entities.filter((e): e is Structure => e.type === 'structure' && e.owner === id);
        const feeders = mine.filter((s) => s.kind === 'factory' || s.kind === 'castle');
        // Unless a neighbouring bot's castle took the last free riverside hexes at the same moment: then no dock spot exists.
        const loop = mine.some((d) => d.kind === 'dock' && feeders.some((f) => distance(f, d) === 1));
        const spotLeft = host.ctx.map.hexes.some(
          (h) => feeders.some((f) => distance(f, h) === 1) && placementError(host.state, host.ctx, id, 'dock', h.q, h.r, true) === null,
        );
        expect(loop || !spotLeft, `seed ${seed} bot ${id} has a dock next to a mill`).toBe(true);
        expect(p.stats.woodChopped, `seed ${seed} bot ${id}`).toBeGreaterThan(100_000);
      }
      expect(host.state.tick).toBeGreaterThanOrEqual(5 * 600);
      expect(client.state.tick).toBe(host.state.tick);
      expect(hashState(client.state)).toBe(hashState(host.state));
      expect(host.session.desync).toBeNull();
    }
  });

  it("a client can't send bot commands", () => {
    const net = new LocalNetwork(() => 0);
    const hostT = net.join('host');
    const clientT = net.join('c1');
    const slots = [{ name: 'Ana' }, { name: 'Ben' }];
    const session = new LockstepSession(hostT, { seed: 1, slots, you: 0, hostId: 'host' }, true, new Map([['c1', 1]]));
    clientT.send('host', { t: 'cmd', command: { type: 'store', player: 1, bot: true } });
    clientT.send('host', { t: 'cmd', command: { type: 'store', player: 1 } });
    net.pump();
    expect((session as unknown as { queue: unknown[] }).queue).toEqual([{ type: 'store', player: 1 }]);
  });
});
