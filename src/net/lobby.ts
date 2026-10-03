// Lobby (ARCHITECTURE.md §7): the host opens a room with a short code; friends join by code. The host sees the slots
// fill (empty ones become bots) and presses Start, which sends everyone the seed and their slot.
import type { MatchInfo } from './lockstep';
import type { NetMessage, SlotInfo } from './protocol';
import type { Transport } from './transport';

export const MAX_PLAYERS = 4;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I look-alikes

export function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

export class HostLobby {
  readonly slots: SlotInfo[] = Array.from({ length: MAX_PLAYERS }, () => ({ name: null }));
  /** Peer id → slot. */
  readonly peerSlots = new Map<string, number>();
  private started = false;
  onChange: () => void = () => {};
  /** Set once the match runs: lets a dropped player back in. True if they were let in. */
  onLateHello: (peer: string, name: string) => boolean = () => false;

  constructor(
    private readonly transport: Transport,
    hostName: string,
    private readonly version: string,
  ) {
    this.slots[0] = { name: hostName };
    transport.onMessage((from, msg) => {
      if (msg.t !== 'hello') return;
      if (msg.version !== version) return transport.send(from, { t: 'refused', reason: 'different game version: reload the page' });
      if (this.started) {
        // Mid-match: only a player who dropped can come back into their slot.
        if (this.onLateHello(from, msg.name)) return;
        return transport.send(from, { t: 'refused', reason: 'the match has already started (to rejoin, use the same name as before)' });
      }
      const free = this.slots.findIndex((s) => s.name === null);
      if (free < 0) return transport.send(from, { t: 'refused', reason: 'the room is full' });
      this.slots[free] = { name: msg.name.slice(0, 16) || `Player ${free + 1}` };
      this.peerSlots.set(from, free);
      this.announce();
    });
    transport.onPeerLeft((peer) => {
      const slot = this.peerSlots.get(peer);
      if (this.started || slot === undefined) return;
      this.slots[slot] = { name: null };
      this.peerSlots.delete(peer);
      this.announce();
    });
  }

  private announce(): void {
    for (const [peer, you] of this.peerSlots) this.transport.send(peer, { t: 'lobby', slots: this.slots, you });
    this.onChange();
  }

  /** Starts the match: everyone gets the same seed and slots. */
  start(): MatchInfo {
    this.started = true;
    const seed = newSeed();
    for (const [peer, you] of this.peerSlots) this.transport.send(peer, { t: 'start', seed, slots: this.slots, you });
    return { seed, slots: this.slots, you: 0, hostId: this.transport.id };
  }
}

export class ClientLobby {
  slots: SlotInfo[] = [];
  you = -1;
  onChange: () => void = () => {};
  onRefused: (reason: string) => void = () => {};
  onStart: (info: MatchInfo) => void = () => {};
  /** The match was already running and we're back in our slot. */
  onRejoin: (msg: Extract<NetMessage, { t: 'rejoin' }>) => void = () => {};

  constructor(transport: Transport, hostId: string, name: string, version: string) {
    transport.onMessage((_from, msg) => {
      if (msg.t === 'rejoin') {
        this.onRejoin(msg);
      } else if (msg.t === 'lobby') {
        this.slots = msg.slots;
        this.you = msg.you;
        this.onChange();
      } else if (msg.t === 'refused') {
        this.onRefused(msg.reason);
      } else if (msg.t === 'start') {
        this.onStart({ seed: msg.seed, slots: msg.slots, you: msg.you, hostId });
      }
    });
    transport.send(hostId, { t: 'hello', name, version });
  }
}
