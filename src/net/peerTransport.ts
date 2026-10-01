// PeerJS (WebRTC data channels) implementation of Transport (ARCHITECTURE.md §7). The host's peer id is derived from
// the room code, so friends only need the code. Signalling uses the free public PeerJS server; STUN is the default.
import { type DataConnection, Peer } from 'peerjs';
import type { NetMessage } from './protocol';
import type { Transport } from './transport';

const ID_PREFIX = 'ikea-lumber-defense-';

export const hostPeerId = (roomCode: string) => ID_PREFIX + roomCode.toUpperCase();

export class PeerTransport implements Transport {
  private readonly conns = new Map<string, DataConnection>();
  private handlers: ((from: string, msg: NetMessage) => void)[] = [];
  private leftHandlers: ((peer: string) => void)[] = [];

  private constructor(private readonly peer: Peer) {
    peer.on('connection', (conn) => conn.on('open', () => this.add(conn)));
  }

  get id(): string {
    return this.peer.id;
  }

  /** Opens a room as its host. Rejects if the code is already in use. */
  static host(roomCode: string): Promise<PeerTransport> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(hostPeerId(roomCode));
      peer.on('open', () => resolve(new PeerTransport(peer)));
      peer.on('error', (e) => reject(new Error(e.type === 'unavailable-id' ? 'room code already in use' : e.message)));
    });
  }

  /** Joins a room by code. Rejects if the host can't be reached. */
  static join(roomCode: string): Promise<PeerTransport> {
    return new Promise((resolve, reject) => {
      const peer = new Peer();
      peer.on('error', (e) => reject(new Error(e.type === 'peer-unavailable' ? 'no room with that code' : e.message)));
      peer.on('open', () => {
        const t = new PeerTransport(peer);
        const conn = peer.connect(hostPeerId(roomCode), { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          t.add(conn);
          resolve(t);
        });
      });
    });
  }

  private add(conn: DataConnection): void {
    this.conns.set(conn.peer, conn);
    conn.on('data', (data) => {
      for (const h of this.handlers) h(conn.peer, data as NetMessage);
    });
    conn.on('close', () => {
      if (!this.conns.delete(conn.peer)) return;
      for (const h of this.leftHandlers) h(conn.peer);
    });
  }

  send(to: string, msg: NetMessage): void {
    this.conns.get(to)?.send(msg);
  }

  onMessage(handler: (from: string, msg: NetMessage) => void): void {
    this.handlers.push(handler);
  }

  onPeerLeft(handler: (peer: string) => void): void {
    this.leftHandlers.push(handler);
  }

  peers(): string[] {
    return [...this.conns.keys()];
  }

  close(): void {
    this.peer.destroy();
  }
}
