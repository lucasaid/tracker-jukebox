// Voices, resampling, pan/separation, FORMAT_GAIN, clamp (decisions 15–17).
import type { TrackerFormat } from '../formats'
import type { Interpolation } from './index'

/** Set once per format from the P10–P12 comparisons (decision 17).
 *  P10: mod, mtm; P11: stm, 669 (669 stays 1, mean dB delta +0.21). */
export const FORMAT_GAIN: Record<TrackerFormat, number> = {
  mod: 0.74,
  stm: 0.54,
  s3m: 3.3,
  '669': 1,
  mtm: 0.88,
}

export interface Voice {
  data: Float32Array
  /** frames, fractional */
  pos: number
  /** frames per output frame */
  step: number
  loopStart: number
  /** exclusive; loopEnd <= loopStart → no loop */
  loopEnd: number
  active: boolean
  /** ring buffer of post-volume mono samples; length is a power of two */
  scope: Float32Array
  scopeAt: number
}

export function createVoice(scopeLen: number): Voice {
  return {
    data: new Float32Array(0),
    pos: 0,
    step: 0,
    loopStart: 0,
    loopEnd: 0,
    active: false,
    scope: new Float32Array(scopeLen),
    scopeAt: 0,
  }
}

/** Sample at an integer index, following the loop; 0 outside the data. */
function tap(v: Voice, i: number): number {
  const len = v.loopEnd - v.loopStart
  const j = len > 0 && i >= v.loopEnd ? v.loopStart + ((i - v.loopStart) % len) : i
  return j >= 0 && j < v.data.length ? (v.data[j] as number) : 0
}

function read(v: Voice, interp: Interpolation): number {
  const i = Math.floor(v.pos)
  if (interp === 'nearest') return tap(v, i)
  const f = v.pos - i
  const y1 = tap(v, i)
  const y2 = tap(v, i + 1)
  if (interp === 'linear') return y1 + (y2 - y1) * f
  // 4-point Hermite
  const y0 = tap(v, i - 1)
  const y3 = tap(v, i + 2)
  const c1 = 0.5 * (y2 - y0)
  const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2)
  return ((c3 * f + c2) * f + c1) * f + y1
}

/** Wraps to loopStart, or stops the voice at the end of the data. */
function wrap(v: Voice): void {
  const len = v.loopEnd - v.loopStart
  if (len > 0) {
    if (v.pos >= v.loopEnd) v.pos = v.loopStart + ((v.pos - v.loopStart) % len)
  } else if (v.pos >= v.data.length) v.active = false
}

/** Adds `n` frames of the voice into left/right[start..]. Gains of 0 (mute) still advance it. */
export function mixVoice(
  v: Voice,
  left: Float32Array,
  right: Float32Array,
  start: number,
  n: number,
  interp: Interpolation,
  gainL: number,
  gainR: number,
): void {
  const mask = v.scope.length - 1
  for (let k = 0; k < n; k++) {
    let s = 0
    if (v.active) {
      s = read(v, interp)
      v.pos += v.step
      wrap(v)
    }
    left[start + k] = (left[start + k] as number) + s * gainL
    right[start + k] = (right[start + k] as number) + s * gainR
    v.scope[v.scopeAt] = s * (gainL + gainR)
    v.scopeAt = (v.scopeAt + 1) & mask
  }
}

/** Moves the voice forward without producing audio (seek). */
export function skipVoice(v: Voice, frames: number): void {
  if (!v.active) return
  v.pos += v.step * frames
  wrap(v)
}

/** Final level: scale, then hard-clamp to ±1. */
export function finishMix(left: Float32Array, right: Float32Array, n: number, scale: number): void {
  for (let i = 0; i < n; i++) {
    left[i] = Math.max(-1, Math.min(1, (left[i] as number) * scale))
    right[i] = Math.max(-1, Math.min(1, (right[i] as number) * scale))
  }
}
