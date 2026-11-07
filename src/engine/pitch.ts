// Period tables and period → Hz per format (decision 14).
import type { TrackerFormat } from '../formats'

const ST3_TABLE = [1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 907]

/** MOD/MTM use Amiga periods; STM, S3M and 669 use ST3 periods. */
export const isAmiga = (format: TrackerFormat): boolean => format === 'mod' || format === 'mtm'

/** Slide and vibrato amounts are in Amiga period units; ST3 periods are 4× finer at C-4. */
export const periodUnit = (format: TrackerFormat): number => (isAmiga(format) ? 1 : 4)

/** The STM and 669 parsers number notes with a +36 base, one octave above the engine's C-4 = c2spd
 *  (verified against openmpt123 in P11), so the engine plays them 12 semitones lower. */
const noteShift = (format: TrackerFormat): number =>
  format === 'stm' || format === '669' ? -12 : 0

export function periodOf(note: number, c2spd: number, format: TrackerFormat): number {
  const hz = c2spd > 0 ? c2spd : 8363
  if (isAmiga(format)) return (428 * 2 ** ((48 - note) / 12) * 8363) / hz
  const n = Math.max(note + noteShift(format), 0)
  return (8363 * 16 * ((ST3_TABLE[n % 12] as number) / 2 ** Math.floor(n / 12))) / hz
}

export function periodToHz(period: number, format: TrackerFormat): number {
  return (isAmiga(format) ? 3546895 : 14317056) / Math.max(period, 1)
}

/** Slides stop at the Amiga limits 113..856 (scaled by c2spd); ST3 periods get a wide fixed range. */
export function clampPeriod(period: number, c2spd: number, format: TrackerFormat): number {
  if (!isAmiga(format)) return Math.min(Math.max(period, 64), 32767 * 16)
  const k = 8363 / (c2spd > 0 ? c2spd : 8363)
  return Math.min(Math.max(period, 113 * k), 856 * k)
}
