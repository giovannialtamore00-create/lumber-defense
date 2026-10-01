// Transport interface (ARCHITECTURE.md §7). The sim never sees it. Star topology: clients talk to the host only.
// PeerJS implements it for real play (peerTransport.ts); an in-memory network serves tests and solo play.
import type { NetMessage } from './protocol';

export interface Transport {
  /** Our own peer id. */
  readonly id: string;
  send(to: string, msg: NetMessage): void;
  onMessage(handler: (from: string, msg: NetMessage) => void): void;
  /** A peer's connection closed. */
  onPeerLeft(handler: (peer: string) => void): void;
  /** Connected peer ids (not counting ourselves). */
  peers(): string[];
  close(): void;
}

export function broadcast(t: Transport, msg: NetMessage): void {
  for (const p of t.peers()) t.send(p, msg);
}
