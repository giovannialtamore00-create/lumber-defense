// In-memory loopback transport: everything sent is delivered straight back to this client (single player, tests).
import type { NetMessage, Transport } from './transport';

export class LocalTransport implements Transport {
  private handlers: ((msg: NetMessage) => void)[] = [];

  send(msg: NetMessage): void {
    for (const h of this.handlers) h(msg);
  }

  onMessage(handler: (msg: NetMessage) => void): void {
    this.handlers.push(handler);
  }

  peers(): string[] {
    return [];
  }
}
