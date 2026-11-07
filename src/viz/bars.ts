// Winamp 2.x style spectrum: log-spaced bars with falling peak caps. Keeps its own colours, like the demo effects.
import type { VisualizerDef, VisualizerInstance } from './types'

const BARS = 20
const MIN_HZ = 40
const MAX_HZ = 16000
// ponytail: the Frame carries no sample rate, so FFT bins are mapped as if it were 48 kHz.
const BIN_HZ = 48000 / 2048
const PEAK_HOLD_SEC = 0.4
const PEAK_FALL_PER_SEC = 0.8 // fraction of full height per second

function barsInstance(): VisualizerInstance {
  const peaks = new Float32Array(BARS)
  const holdSec = new Float32Array(BARS)
  let gradient: CanvasGradient | null = null
  let gradientH = 0
  return {
    draw(ctx, f, dt) {
      const w = f?.width ?? ctx.canvas.clientWidth
      const h = f?.height ?? ctx.canvas.clientHeight
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      if (!f) return
      if (!gradient || gradientH !== h) {
        gradient = ctx.createLinearGradient(0, h, 0, 0)
        gradient.addColorStop(0, '#00c000')
        gradient.addColorStop(0.55, '#e0e000')
        gradient.addColorStop(1, '#e00000')
        gradientH = h
      }
      const slotW = w / BARS
      const barW = Math.max(1, slotW - Math.max(1, slotW * 0.2))
      const capH = Math.max(2, h * 0.012)
      for (let b = 0; b < BARS; b++) {
        const lo = Math.floor((MIN_HZ * (MAX_HZ / MIN_HZ) ** (b / BARS)) / BIN_HZ)
        const hi = Math.max(
          lo + 1,
          Math.floor((MIN_HZ * (MAX_HZ / MIN_HZ) ** ((b + 1) / BARS)) / BIN_HZ),
        )
        let level = 0
        for (let i = lo; i < hi; i++) level = Math.max(level, f.freq[i] ?? 0)
        const v = level / 255
        const peak = peaks[b] ?? 0
        if (v >= peak) {
          peaks[b] = v
          holdSec[b] = PEAK_HOLD_SEC
        } else if ((holdSec[b] ?? 0) > 0) {
          holdSec[b] = (holdSec[b] ?? 0) - dt
        } else {
          peaks[b] = Math.max(v, peak - PEAK_FALL_PER_SEC * dt)
        }
        const x = b * slotW + (slotW - barW) / 2
        const bh = v * (h - capH)
        ctx.fillStyle = gradient
        ctx.fillRect(x, h - bh, barW, bh)
        ctx.fillStyle = '#c0c0c0'
        ctx.fillRect(x, h - capH - (peaks[b] ?? 0) * (h - capH), barW, capH)
      }
    },
  }
}

export const bars: VisualizerDef = { id: 'bars', name: 'Bars', create: barsInstance }
