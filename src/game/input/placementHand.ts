// The placement hand (ARCHITECTURE.md §8): what the local player is placing, green/red previews and clicks.
// Legality always comes from the sim's own placement functions, so the preview can't disagree with the sim.
import { idx } from '../../sim/context';
import type { Hex } from '../../sim/hex';
import { carrierRouteError, dropOffs, pickupError, placementError } from '../../sim/systems/placement';
import type { ItemKind } from '../../sim/types';
import type { SimRunner } from '../simRunner';
import { ITEM_NAMES } from '../ui/items';

export interface Preview {
  /** Hexes to tint: green if ok, red if not. */
  cells: { hex: Hex; ok: boolean }[];
  /** Carrier route being drawn, A → B. */
  route?: { a: Hex; b: Hex };
  /** The icon of the item being placed, shown on the hovered hex. */
  ghost?: { hex: Hex; item: ItemKind; ok: boolean };
  /** One line for the UI: what to do, or why the hovered hex is illegal. */
  message: string;
}

export class PlacementHand {
  /** Carrier pickup chosen, waiting for a drop-off. */
  private carrierA: Hex | null = null;

  constructor(
    private readonly runner: SimRunner,
    private readonly player: number,
  ) {}

  /** The item being placed: the first outpost before the start, then the oldest item in hand. */
  current(): ItemKind | null {
    const p = this.runner.state.players[this.player]!;
    if (!p.started) return 'outpost';
    return p.hand[0] ?? null;
  }

  cancel(): void {
    this.carrierA = null;
  }

  preview(hover: Hex | null): Preview {
    const { state, ctx } = this.runner;
    const item = this.current();
    const started = state.players[this.player]!.started;
    if (!item) return { cells: [], message: '' };
    const onMap = hover && idx(ctx, hover) !== undefined ? hover : null;

    if (item === 'carrier') {
      if (!this.carrierA) {
        const pickups = ctx.map.hexes.filter((h) => pickupError(state, ctx, this.player, h.q, h.r) === null);
        const err = onMap ? pickupError(state, ctx, this.player, onMap.q, onMap.r) : null;
        return {
          ghost: onMap ? { hex: onMap, item, ok: !err } : undefined,
          cells: [...pickups.map((h): Preview['cells'][number] => ({ hex: h, ok: true })), ...(onMap && err ? [{ hex: onMap, ok: false }] : [])],
          message: err ? `Carrier pickup: ${err}` : 'Carrier: click a pickup A (a wood pile, woodchopper or dock). Right-click cancels.',
        };
      }
      const a = this.carrierA;
      const options = dropOffs(state, ctx, this.player, a.q, a.r);
      const target = onMap && onMap.r === a.r && options.some((d) => d.q === onMap.q) ? onMap : null;
      return {
        ghost: onMap ? { hex: onMap, item, ok: !!target } : undefined,
        cells: [{ hex: a, ok: true }, ...options.map((d) => ({ hex: { q: d.q, r: a.r }, ok: true }))],
        route: target ? { a, b: target } : undefined,
        message: options.length ? 'Carrier: click a drop-off B on the same row (green). Right-click cancels.' : 'Carrier: no drop-off on this row. Right-click cancels.',
      };
    }

    const err = onMap ? placementError(state, ctx, this.player, item, onMap.q, onMap.r) : null;
    const what = started ? `${ITEM_NAMES[item]} in hand` : 'Place your first outpost in your region';
    return {
      ghost: onMap ? { hex: onMap, item, ok: !err } : undefined,
      cells: onMap ? [{ hex: onMap, ok: !err }] : [],
      message: err ? `${what}: ${err}` : `${what}: click to place.`,
    };
  }

  click(hex: Hex): void {
    const { state, ctx } = this.runner;
    const item = this.current();
    const p = state.players[this.player]!;
    if (!item) return;

    if (!p.started) {
      if (!placementError(state, ctx, this.player, 'outpost', hex.q, hex.r))
        this.runner.submit({ type: 'placeOutpost', player: this.player, q: hex.q, r: hex.r });
      return;
    }
    if (item === 'carrier') {
      if (!this.carrierA) {
        if (!pickupError(state, ctx, this.player, hex.q, hex.r)) this.carrierA = hex;
        return;
      }
      const a = this.carrierA;
      if (hex.r === a.r && !carrierRouteError(state, ctx, this.player, a.q, hex.q, a.r)) {
        this.runner.submit({ type: 'placeCarrier', player: this.player, aQ: a.q, bQ: hex.q, r: a.r });
        this.carrierA = null;
      }
      return;
    }
    if (!placementError(state, ctx, this.player, item, hex.q, hex.r))
      this.runner.submit({ type: 'place', player: this.player, item, q: hex.q, r: hex.r });
  }
}
