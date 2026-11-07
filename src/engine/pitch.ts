// Period tables and period → Hz per format (decision 14).
// ponytail: Amiga periods for every format until P11/P12 add the ST3 table; only MOD/MTM are right.

/** Amiga period of a note: 428 at C-4 for c2spd 8363, scaled by c2spd. */
export function periodOf(note: number, c2spd: number): number {
  return (428 * 2 ** ((48 - note) / 12) * 8363) / (c2spd > 0 ? c2spd : 8363)
}

export function periodToHz(period: number): number {
  return 3546895 / Math.max(period, 1)
}

/** Slides stop at the Amiga limits 113..856, scaled the same way as the period. */
export function clampPeriod(period: number, c2spd: number): number {
  const k = 8363 / (c2spd > 0 ? c2spd : 8363)
  return Math.min(Math.max(period, 113 * k), 856 * k)
}
