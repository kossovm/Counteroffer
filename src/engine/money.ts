import type { Direction } from "./types";

/** +1 when higher is better for the user, −1 when lower is better. */
export const sign = (d: Direction): 1 | -1 => (d === "up" ? 1 : -1);

/** How much better `a` is than `b` for the user (negative = worse). */
export const favour = (d: Direction, a: number, b: number): number => sign(d) * (a - b);

/** True when `a` is strictly better for the user than `b`. */
export const better = (d: Direction, a: number, b: number): boolean => favour(d, a, b) > 0;

/** True when `a` is at least as good for the user as `b`. */
export const atLeast = (d: Direction, a: number, b: number): boolean => favour(d, a, b) >= 0;

/** Of two numbers, the one better for the user. */
export const best = (d: Direction, a: number, b: number): number => (better(d, a, b) ? a : b);

/** Of two numbers, the one worse for the user. */
export const worst = (d: Direction, a: number, b: number): number => (better(d, a, b) ? b : a);

export const roundTo = (x: number, unit: number): number => Math.round(x / unit) * unit;

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/**
 * Next counterpart position when moving from `offer` toward `target`, never past `limit`.
 * Moves `fraction` of the remaining distance to the limit, at least one rounding unit.
 */
export function stepToward(
  d: Direction,
  offer: number,
  target: number,
  limit: number,
  fraction: number,
  rounding: number,
): number {
  const cap = worst(d, target, limit); // never beyond what the user asked or the hidden limit
  const room = favour(d, cap, offer);
  if (room <= 0) return offer;
  const raw = Math.max(rounding, roundTo(favour(d, limit, offer) * fraction, rounding));
  const move = Math.min(raw, room);
  return offer + sign(d) * move;
}

export const usd = (n: number): string =>
  "$" + Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
