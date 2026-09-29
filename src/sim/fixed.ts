// Fixed-point helpers (ARCHITECTURE.md §5). Sim state holds integers only:
//   wood in milli-wood (1 wood = 1000), movement in milli-hex (1 hex = 1000).
// Config values are human units (wood, seconds); they are converted once, when the context is built.

export const MILLI = 1000;

/** A per-second amount in config units → milli-units per tick. 1 wood/s at 10 ticks/s = 100. */
export function perTick(perSecond: number, tickRate: number): number {
  return Math.round((perSecond * MILLI) / tickRate);
}

/** Whole config units → milli-units. */
export function toMilli(units: number): number {
  return Math.round(units * MILLI);
}

/** Milli-units → whole units, rounded down (what the player sees). */
export function wholeUnits(milli: number): number {
  return Math.floor(milli / MILLI);
}
