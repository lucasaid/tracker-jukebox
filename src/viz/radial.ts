// Radial spectrum: log-spaced bars around a circle (mirrored left/right), with a centre disc that
// pulses on note triggers. Hue follows the angle and slowly rotates.
import { createDrive, idle } from './demo'
import type { VisualizerDef, VisualizerInstance } from './types'

const HALF = 48 // bars per side; the right half mirrors the left
const MIN_HZ = 40
const MAX_HZ = 16000
// ponytail: the Frame carries no sample rate, so FFT bins are mapped as if it were 48 kHz.
const BIN_HZ = 48000 / 2048
const HUE_PER_SEC = 15

function radialInstance(): VisualizerInstance {
  const drive = createDrive()
  const lo = new Uint16Array(HALF)
  const hi = new Uint16Array(HALF)
  for (let b = 0; b < HALF; b++) {
    lo[b] = Math.floor((MIN_HZ * (MAX_HZ / MIN_HZ) ** (b / HALF)) / BIN_HZ)
    hi[b] = Math.max(
      (lo[b] ?? 0) + 1,
      Math.floor((MIN_HZ * (MAX_HZ / MIN_HZ) ** ((b + 1) / HALF)) / BIN_HZ),
    )
  }
  let t = 0
  return {
    draw(ctx, f, dt) {
      if (!f) return idle(ctx, f)
      const { intensity, pulse } = drive(f, dt)
      if (!f.reducedMotion) t += dt
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, f.width, f.height)

      const cx = f.width / 2
      const cy = f.height / 2
      const R = Math.min(f.width, f.height) / 2
      const inner = R * (0.28 + pulse * 0.06)
      const len = R * 0.66
      const barW = Math.max(1.5, ((Math.PI * inner) / HALF) * 0.7)
      ctx.lineWidth = barW
      ctx.lineCap = 'round'
      for (let b = 0; b < HALF; b++) {
        let level = 0
        for (let i = lo[b] ?? 0; i < (hi[b] ?? 0); i++) level = Math.max(level, f.freq[i] ?? 0)
        const l = inner + 2 + (level / 255) * len
        // bass at the bottom, treble at the top, on both sides
        const off = ((b + 0.5) / HALF) * Math.PI
        for (const side of [1, -1]) {
          const a = Math.PI / 2 + side * off
          ctx.strokeStyle = `hsl(${(off * 57 + t * HUE_PER_SEC) % 360},100%,${45 + (level / 255) * 25}%)`
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(a) * (inner + 2), cy + Math.sin(a) * (inner + 2))
          ctx.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l)
          ctx.stroke()
        }
      }

      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, inner)
      glow.addColorStop(0, `hsla(${(t * HUE_PER_SEC) % 360},100%,${60 + pulse * 30}%,1)`)
      glow.addColorStop(1, `hsla(${(t * HUE_PER_SEC + 60) % 360},100%,${20 + intensity * 30}%,1)`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, inner, 0, Math.PI * 2)
      ctx.fill()
    },
  }
}

export const radial: VisualizerDef = { id: 'radial', name: 'Radial', create: radialInstance }
