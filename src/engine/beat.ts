// Energy-jump beat detector for streamed songs (P30): they have no note events to pulse on.

/** Energy must beat its moving average by this factor. */
const RATIO = 1.4
/** Window of the moving average. */
const AVG_SEC = 1
/** Below this (mean RMS², ≈ −40 dBFS) nothing is a beat. */
const FLOOR = 1e-4
/** Shortest gap between two beats. */
const MIN_GAP_SEC = 0.12

/** Feed one energy reading (mean RMS²) and the seconds since the last one; true on a beat. */
export function createBeatDetector(): (energy: number, dtSec: number) => boolean {
  let avg = -1
  let sinceSec = Infinity
  return (energy, dtSec) => {
    if (avg < 0) {
      avg = energy
      return false
    }
    sinceSec += dtSec
    const beat = energy > RATIO * avg && energy > FLOOR && sinceSec >= MIN_GAP_SEC
    avg += (energy - avg) * Math.min(1, dtSec / AVG_SEC)
    if (beat) sinceSec = 0
    return beat
  }
}
