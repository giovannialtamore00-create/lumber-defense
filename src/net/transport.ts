// Transport interface (ARCHITECTURE.md §7). The sim never sees it; the runner sends commands and receives tick
// bundles. localTransport serves single player and tests; peerTransport (PeerJS) comes in M4.
import type { Command } from '../sim/types';

export type NetMessage = { type: 'command'; command: Command } | { type: 'bundle'; tick: number; commands: Command[] };

export interface Transport {
  send(msg: NetMessage): void;
  onMessage(handler: (msg: NetMessage) => void): void;
  /** Connected peer ids (not counting ourselves). */
  peers(): string[];
}
