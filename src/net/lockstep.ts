// Deterministic lockstep over a Transport (ARCHITECTURE.md §7).
// - Clients send their commands to the host.
// - The host schedules every command for `current tick + INPUT_DELAY_TICKS` and broadcasts one bundle per tick, even
//   when empty. Everyone (host included) steps a tick only once they hold its bundle.
// - Every HASH_EVERY_TICKS ticks clients send their state hash; the host compares and flags a desync.
import type { Command } from '../sim/types';
import type { SlotInfo } from './protocol';
import { type Transport, broadcast } from './transport';

export const INPUT_DELAY_TICKS = 3;
export const HASH_EVERY_TICKS = 20;

export interface MatchInfo {
  seed: number;
  slots: SlotInfo[];
  /** Our slot. */
  you: number;
  hostId: string;
}

export class LockstepSession {
  private readonly bundles = new Map<number, Command[]>();
  private queue: Command[] = [];
  private nextBundleTick = INPUT_DELAY_TICKS;
  private readonly hostHashes = new Map<number, number>();
  private readonly clientHashes = new Map<number, { slot: number; hash: number }[]>();
  /** First desync seen: the tick and the slot whose hash differed. */
  desync: { tick: number; slot: number } | null = null;
  /** Slots whose player disconnected. */
  readonly left = new Set<number>();
  hostGone = false;

  /**
   * @param peerSlots host only: which peer id plays which slot, so a client can only send its own slot's commands.
   */
  constructor(
    private readonly transport: Transport,
    readonly info: MatchInfo,
    readonly isHost: boolean,
    private readonly peerSlots: Map<string, number> = new Map(),
  ) {
    for (let t = 0; t < INPUT_DELAY_TICKS; t++) this.bundles.set(t, []);
    transport.onMessage((from, msg) => {
      switch (msg.t) {
        case 'cmd':
          // Only the host schedules commands, and only for the sender's own slot.
          if (this.isHost && this.peerSlots.get(from) === msg.command.player) this.queue.push(msg.command);
          break;
        case 'bundle':
          if (!this.isHost) this.bundles.set(msg.tick, msg.commands);
          break;
        case 'hash': {
          const slot = this.peerSlots.get(from);
          if (this.isHost && slot !== undefined) {
            const list = this.clientHashes.get(msg.tick) ?? [];
            list.push({ slot, hash: msg.hash });
            this.clientHashes.set(msg.tick, list);
            this.compareHashes(msg.tick);
          }
          break;
        }
        case 'desync':
          this.desync ??= { tick: msg.tick, slot: msg.slot };
          break;
        case 'left':
          this.left.add(msg.slot);
          break;
      }
    });
    transport.onPeerLeft((peer) => {
      if (!this.isHost) {
        if (peer === info.hostId) this.hostGone = true;
        return;
      }
      const slot = this.peerSlots.get(peer);
      if (slot === undefined) return;
      this.left.add(slot);
      broadcast(this.transport, { t: 'left', slot });
    });
  }

  submit(command: Command): void {
    if (this.isHost) this.queue.push(command);
    else this.transport.send(this.info.hostId, { t: 'cmd', command });
  }

  /** Host only, once per tick of real time: close the next bundle and send it to everyone. */
  hostTick(): void {
    if (!this.isHost) return;
    const bundle = { t: 'bundle' as const, tick: this.nextBundleTick++, commands: this.queue };
    this.queue = [];
    this.bundles.set(bundle.tick, bundle.commands);
    broadcast(this.transport, bundle);
  }

  /** The commands for `tick`, once its bundle has arrived (and forgets it). */
  takeBundle(tick: number): Command[] | undefined {
    const b = this.bundles.get(tick);
    if (b) this.bundles.delete(tick);
    return b;
  }

  /** Called after stepping to a hash tick. */
  reportHash(tick: number, hash: number): void {
    if (this.isHost) {
      this.hostHashes.set(tick, hash);
      this.compareHashes(tick);
    } else {
      this.transport.send(this.info.hostId, { t: 'hash', tick, hash });
    }
  }

  private compareHashes(tick: number): void {
    const mine = this.hostHashes.get(tick);
    const theirs = this.clientHashes.get(tick);
    if (mine === undefined || !theirs) return;
    for (const c of theirs) {
      if (c.hash !== mine && !this.desync) {
        this.desync = { tick, slot: c.slot };
        console.warn(`desync at tick ${tick}: host ${mine.toString(16)}, slot ${c.slot} ${c.hash.toString(16)}`);
        broadcast(this.transport, { t: 'desync', tick, slot: c.slot });
      }
    }
    this.clientHashes.delete(tick);
    this.hostHashes.delete(tick);
  }
}
