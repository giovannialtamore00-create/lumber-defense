// In-memory transports for tests and solo play. Messages go through a queue that `pump()` delivers, optionally with a
// per-message delay, to exercise lockstep under latency.
import type { NetMessage } from './protocol';
import type { Transport } from './transport';

interface Pending {
  at: number;
  from: string;
  to: string;
  msg: NetMessage;
}

export class LocalNetwork {
  private readonly nodes = new Map<string, LocalTransport>();
  private queue: Pending[] = [];
  private now = 0;

  /** `latency(from, to)` returns a delay in pump steps for each message (default: delivered on the next pump). */
  constructor(private readonly latency: (from: string, to: string) => number = () => 0) {}

  join(id: string): LocalTransport {
    const t = new LocalTransport(id, this);
    this.nodes.set(id, t);
    return t;
  }

  connected(id: string): boolean {
    return this.nodes.has(id);
  }

  ids(): string[] {
    return [...this.nodes.keys()];
  }

  enqueue(from: string, to: string, msg: NetMessage): void {
    // Copy through JSON, as a real network would.
    this.queue.push({ at: this.now + this.latency(from, to), from, to, msg: JSON.parse(JSON.stringify(msg)) as NetMessage });
  }

  leave(id: string): void {
    this.nodes.delete(id);
    for (const n of this.nodes.values()) n.peerLeft(id);
  }

  /** Delivers every message that is due, in send order. */
  pump(): void {
    const due = this.queue.filter((p) => p.at <= this.now);
    this.queue = this.queue.filter((p) => p.at > this.now);
    for (const p of due) this.nodes.get(p.to)?.deliver(p.from, p.msg);
    this.now++;
  }
}

export class LocalTransport implements Transport {
  private handlers: ((from: string, msg: NetMessage) => void)[] = [];
  private leftHandlers: ((peer: string) => void)[] = [];

  constructor(
    readonly id: string,
    private readonly net: LocalNetwork,
  ) {}

  send(to: string, msg: NetMessage): void {
    if (this.net.connected(to)) this.net.enqueue(this.id, to, msg);
  }

  onMessage(handler: (from: string, msg: NetMessage) => void): void {
    this.handlers.push(handler);
  }

  onPeerLeft(handler: (peer: string) => void): void {
    this.leftHandlers.push(handler);
  }

  peers(): string[] {
    return this.net.ids().filter((id) => id !== this.id);
  }

  close(): void {
    this.net.leave(this.id);
  }

  deliver(from: string, msg: NetMessage): void {
    for (const h of this.handlers) h(from, msg);
  }

  peerLeft(peer: string): void {
    for (const h of this.leftHandlers) h(peer);
  }
}
