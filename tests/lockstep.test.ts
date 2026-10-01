import { describe, expect, it } from 'vitest';
import config from '../src/data/config.json';
import map01 from '../src/data/maps/map01.json';
import { demoCommands } from '../src/game/demo';
import { SimRunner } from '../src/game/simRunner';
import { ClientLobby, HostLobby } from '../src/net/lobby';
import { LocalNetwork } from '../src/net/localTransport';
import { LockstepSession, type MatchInfo } from '../src/net/lockstep';
import { hashState } from '../src/sim/hash';
import type { MapData } from '../src/sim/map';
import type { Config } from '../src/sim/types';

const MAP = map01 as MapData;
const CFG = config as Config;
const TICK_MS = 1000 / CFG.tickRate;

/** A host and two clients go through the lobby over a simulated network with up to `maxLatency` pumps of delay. */
function makeMatch(maxLatency: number) {
  let seed = 7;
  const net = new LocalNetwork(() => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % (maxLatency + 1);
  });
  const hostT = net.join('host');
  const lobby = new HostLobby(hostT, 'Ana', 'v1');
  const clients = ['c1', 'c2'].map((id, k) => {
    const t = net.join(id);
    const cl = new ClientLobby(t, 'host', `Guest${k}`, 'v1');
    let info: MatchInfo | null = null;
    cl.onStart = (i) => (info = i);
    return { t, get info() { return info; } };
  });
  for (let i = 0; i < 20; i++) net.pump();
  // Slots fill in arrival order; the host is slot 0 and the fourth slot stays for a bot.
  expect(lobby.slots[0]!.name).toBe('Ana');
  expect(lobby.slots.slice(1, 3).map((s) => s.name).sort()).toEqual(['Guest0', 'Guest1']);
  expect(lobby.slots[3]!.name).toBeNull();

  const hostRunner = new SimRunner(MAP, CFG, new LockstepSession(hostT, lobby.start(), true, lobby.peerSlots));
  for (let i = 0; i < 20; i++) net.pump();
  const runners = [hostRunner, ...clients.map((c) => new SimRunner(MAP, CFG, new LockstepSession(c.t, c.info!, false)))];
  return { net, runners };
}

describe('lockstep over the network (ARCHITECTURE §7)', () => {
  it('host and clients stay identical every tick under random latency, playing real commands', () => {
    const { net, runners } = makeMatch(4);
    const hashes = runners.map(() => new Map<number, number>());

    for (let frame = 0; frame < 3000; frame++) {
      net.pump();
      runners.forEach((r, k) => {
        for (const c of demoCommands(r, r.localPlayer)) r.submit(c);
        r.update(TICK_MS);
        hashes[k]!.set(r.state.tick, hashState(r.state));
      });
    }
    for (let i = 0; i < 20; i++) {
      net.pump();
      runners.forEach((r, k) => {
        if (!r.session.isHost) r.update(TICK_MS);
        hashes[k]!.set(r.state.tick, hashState(r.state));
      });
    }

    const [host, ...clients] = runners;
    for (const c of clients) {
      expect(c!.state.tick).toBe(host!.state.tick); // caught up
      let compared = 0;
      for (const [tick, h] of hashes[runners.indexOf(c!)]!) {
        const hostHash = hashes[0]!.get(tick);
        if (hostHash === undefined) continue; // the host stepped past this tick within one frame
        expect(h).toBe(hostHash);
        compared++;
      }
      expect(compared).toBeGreaterThan(1000);
      expect(c!.session.desync).toBeNull();
    }
    expect(host!.session.desync).toBeNull();
    // The three humans started, and wood was flowing for all of them.
    const s = host!.state;
    expect([0, 1, 2].every((p) => s.players[p]!.started)).toBe(true);
    expect(s.players[3]!.bot).toBe(true);
    expect(s.entities.filter((e) => e.type === 'carrier')).toHaveLength(3);
  });

  it("a client can't send commands for another player's slot", () => {
    const { net, runners } = makeMatch(0);
    const [host, c1] = runners as [SimRunner, SimRunner];
    // c1 (slot 1) tries to take control of slot 2.
    c1.submit({ type: 'takeControl', player: 2 });
    host.state.players[2]!.bot = true;
    for (let i = 0; i < 10; i++) {
      net.pump();
      for (const r of runners) r.update(TICK_MS);
    }
    expect(host.state.players[2]!.bot).toBe(true);
  });

  it('a client leaving is flagged, the match goes on; the host leaving ends it for the others', () => {
    const { net, runners } = makeMatch(0);
    const [host, c1, c2] = runners as [SimRunner, SimRunner, SimRunner];
    (c2.session as unknown as { transport: { close(): void } }).transport.close();
    for (let i = 0; i < 5; i++) {
      net.pump();
      host.update(TICK_MS);
      c1.update(TICK_MS);
    }
    expect(host.session.left.has(2)).toBe(true);
    expect(c1.session.left.has(2)).toBe(true);
    const tick = host.state.tick;
    host.update(TICK_MS * 5);
    expect(host.state.tick).toBeGreaterThan(tick);

    (host.session as unknown as { transport: { close(): void } }).transport.close();
    net.pump();
    expect(c1.session.hostGone).toBe(true);
  });
});
