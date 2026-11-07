// Analog stereo VU meters. L/R are rebuilt from the per-channel scopes and pans, since the analyser is mono.
// Keeps its own colours (a cream meter face), like bars.
import { SCOPE_LEN } from '../engine'
import type { Frame, VisualizerDef, VisualizerInstance } from './types'

const MIN_DB = -20
const MAX_DB = 3
// Calibration knob: the mix RMS (dBFS) that reads 0 VU. Raise it if the needles pin, lower it if they barely move.
const REF_DBFS = -12
const RISE_SEC = 0.1 // needle ballistics: time constant up / down
const FALL_SEC = 0.3
const PEAK_HOLD_SEC = 1
const SWING_RAD = (50 * Math.PI) / 180 // needle travel either side of vertical
const TICKS_DB = [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3]

/** Scale position 0..1 for a VU reading. A real VU scale is linear in amplitude, so dB marks bunch up at the top. */
/**
 * Rebuilds the stereo mix from the per-channel scopes and pans (linear pan law) into outL/outR
 * (SCOPE_LEN long). Returns the sample count written.
 */
export function mixLR(f: Frame, outL: Float32Array, outR: Float32Array): number {
  const { scopes, ch } = f.snap
  const len = Math.min(scopes[0]?.length ?? 0, outL.length, outR.length)
  outL.fill(0)
  outR.fill(0)
  for (let c = 0; c < scopes.length; c++) {
    const s = scopes[c]
    if (!s) continue
    const pan = ch[c]?.pan ?? 0
    const gl = (1 - pan) * 0.5
    const gr = (1 + pan) * 0.5
    for (let i = 0; i < len; i++) {
      const v = s[i] ?? 0
      outL[i] = (outL[i] ?? 0) + v * gl
      outR[i] = (outR[i] ?? 0) + v * gr
    }
  }
  return len
}

function scalePos(db: number): number {
  const lo = 10 ** (MIN_DB / 20)
  const hi = 10 ** (MAX_DB / 20)
  return Math.max(0, Math.min(1, (10 ** (db / 20) - lo) / (hi - lo)))
}

function drawMeter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pos: number,
  ledOn: boolean,
  label: string,
): void {
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(x, y, w, h)
  const m = Math.max(3, w * 0.025)
  ctx.fillStyle = '#efe3bd'
  ctx.fillRect(x + m, y + m, w - 2 * m, h - 2 * m)

  const cx = x + w / 2
  const pivotY = y + h * 0.92
  // 0.62: leaves room above the arc for the tick labels (drawn out to 1.1 r plus the font height)
  const r = Math.min(h * 0.62, (w / 2 - 2 * m) / Math.sin(SWING_RAD))
  const angle = (p: number): number => -SWING_RAD + p * 2 * SWING_RAD

  // scale arc, red above 0 VU
  ctx.lineWidth = Math.max(1, r * 0.012)
  const split = angle(scalePos(0)) - Math.PI / 2
  ctx.strokeStyle = '#222'
  ctx.beginPath()
  ctx.arc(cx, pivotY, r, -Math.PI / 2 - SWING_RAD, split)
  ctx.stroke()
  ctx.strokeStyle = '#c00000'
  ctx.lineWidth = Math.max(2, r * 0.04)
  ctx.beginPath()
  ctx.arc(cx, pivotY, r, split, -Math.PI / 2 + SWING_RAD)
  ctx.stroke()

  ctx.font = `${Math.max(8, Math.round(r * 0.08))}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.lineWidth = Math.max(1, r * 0.012)
  for (const db of TICKS_DB) {
    const a = angle(scalePos(db))
    const sin = Math.sin(a)
    const cos = Math.cos(a)
    ctx.strokeStyle = db > 0 ? '#c00000' : '#222'
    ctx.beginPath()
    ctx.moveTo(cx + sin * r, pivotY - cos * r)
    ctx.lineTo(cx + sin * r * 1.07, pivotY - cos * r * 1.07)
    ctx.stroke()
    ctx.fillStyle = db > 0 ? '#c00000' : '#222'
    ctx.fillText(db > 0 ? `+${db}` : String(db), cx + sin * r * 1.18, pivotY - cos * r * 1.1)
  }

  ctx.fillStyle = '#222'
  ctx.font = `bold ${Math.max(10, Math.round(r * 0.14))}px serif`
  ctx.fillText('VU', cx, pivotY - r * 0.35)
  ctx.font = `${Math.max(8, Math.round(r * 0.08))}px monospace`
  ctx.textAlign = 'left'
  ctx.fillText(label, x + m * 2, y + h - m * 2)

  // peak LED, top right
  const ledR = Math.max(3, r * 0.04)
  ctx.fillStyle = ledOn ? '#ff2020' : '#502020'
  ctx.beginPath()
  ctx.arc(x + w - m * 2 - ledR, y + m * 2 + ledR, ledR, 0, Math.PI * 2)
  ctx.fill()

  const a = angle(pos)
  ctx.strokeStyle = '#111'
  ctx.lineWidth = Math.max(1, r * 0.015)
  ctx.beginPath()
  ctx.moveTo(cx, pivotY)
  ctx.lineTo(cx + Math.sin(a) * r * 1.05, pivotY - Math.cos(a) * r * 1.05)
  ctx.stroke()
  ctx.fillStyle = '#111'
  ctx.beginPath()
  ctx.arc(cx, pivotY, Math.max(3, r * 0.05), 0, Math.PI * 2)
  ctx.fill()
}

function vuInstance(): VisualizerInstance {
  const needle = [0, 0]
  const ledSec = [0, 0]
  const rms = [0, 0]
  const peak = [0, 0]
  const left = new Float32Array(SCOPE_LEN)
  const right = new Float32Array(SCOPE_LEN)

  /** Fills rms/peak for L and R. */
  // ponytail: ignores settings.player.stereoSeparation and the MIDI/tracker master gain, so the
  // reading is relative; REF_DBFS is the calibration.
  function measure(f: Frame): void {
    const len = mixLR(f, left, right)
    let sumL = 0
    let sumR = 0
    peak[0] = 0
    peak[1] = 0
    for (let i = 0; i < len; i++) {
      const l = left[i] ?? 0
      const r = right[i] ?? 0
      sumL += l * l
      sumR += r * r
      peak[0] = Math.max(peak[0] ?? 0, Math.abs(l))
      peak[1] = Math.max(peak[1] ?? 0, Math.abs(r))
    }
    rms[0] = len ? Math.sqrt(sumL / len) : 0
    rms[1] = len ? Math.sqrt(sumR / len) : 0
  }

  return {
    draw(ctx, f, dt) {
      const w = f?.width ?? ctx.canvas.clientWidth
      const h = f?.height ?? ctx.canvas.clientHeight
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      if (f) measure(f)
      for (let s = 0; s < 2; s++) {
        const level = f ? (rms[s] ?? 0) : 0
        const db = level > 0 ? 20 * Math.log10(level) - REF_DBFS : MIN_DB
        const target = scalePos(db)
        const cur = needle[s] ?? 0
        const tau = target > cur ? RISE_SEC : FALL_SEC
        needle[s] = f?.reducedMotion ? target : cur + (target - cur) * Math.min(1, dt / tau)
        // LED: any sample past full scale in the rebuilt L/R mix
        if ((peak[s] ?? 0) >= 1) ledSec[s] = PEAK_HOLD_SEC
        else ledSec[s] = Math.max(0, (ledSec[s] ?? 0) - dt)
      }

      // side by side when wide, stacked when tall; each meter keeps a ~1.7:1 face
      const wide = w / 2 / h > 0.9
      const cellW = wide ? w / 2 : w
      const cellH = wide ? h : h / 2
      const mw = Math.min(cellW * 0.94, cellH * 0.94 * 1.7)
      const mh = mw / 1.7
      for (let s = 0; s < 2; s++) {
        const cx = (wide ? s * cellW : 0) + cellW / 2
        const cy = (wide ? 0 : s * cellH) + cellH / 2
        drawMeter(
          ctx,
          cx - mw / 2,
          cy - mh / 2,
          mw,
          mh,
          needle[s] ?? 0,
          (ledSec[s] ?? 0) > 0,
          s ? 'R' : 'L',
        )
      }
    },
  }
}

export const vu: VisualizerDef = { id: 'vu', name: 'VU', create: vuInstance }
