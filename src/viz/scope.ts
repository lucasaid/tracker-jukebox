// Mix oscilloscope + spectrum (decision 29).
import type { VisualizerDef } from './types'

const BARS = 32
const MIN_HZ = 40
const MAX_HZ = 16000
// ponytail: the Frame carries no sample rate, so FFT bins are mapped as if it were 48 kHz.
const BIN_HZ = 48000 / 2048

export const scope: VisualizerDef = {
  id: 'scope',
  name: 'Scope',
  create: () => ({
    draw(ctx, f, _dt) {
      const w = f?.width ?? ctx.canvas.clientWidth
      const h = f?.height ?? ctx.canvas.clientHeight
      const p = f?.palette
      ctx.fillStyle = p?.bg ?? '#000'
      ctx.fillRect(0, 0, w, h)
      if (!f || !p) return
      const waveH = h * 0.6
      ctx.strokeStyle = p.grid
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, waveH / 2)
      ctx.lineTo(w, waveH / 2)
      ctx.stroke()

      ctx.strokeStyle = p.wave
      ctx.beginPath()
      const n = f.time.length
      for (let x = 0; x < w; x++) {
        const v = f.time[Math.floor((x / w) * n)] ?? 0
        const y = waveH / 2 - v * (waveH / 2 - 2)
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      const barW = w / BARS
      const base = h - 2
      const maxH = h - waveH - 6
      ctx.fillStyle = p.wave
      for (let b = 0; b < BARS; b++) {
        const lo = Math.floor((MIN_HZ * (MAX_HZ / MIN_HZ) ** (b / BARS)) / BIN_HZ)
        const hi = Math.max(
          lo + 1,
          Math.floor((MIN_HZ * (MAX_HZ / MIN_HZ) ** ((b + 1) / BARS)) / BIN_HZ),
        )
        let peak = 0
        for (let i = lo; i < hi; i++) peak = Math.max(peak, f.freq[i] ?? 0)
        const bh = (peak / 255) * maxH
        ctx.fillRect(b * barW + 1, base - bh, Math.max(1, barW - 2), bh)
      }
    },
  }),
}
