// WMP Ambience-style swirl: the waveform drawn along a radius and mirrored into a rotating
// kaleidoscope, over fading trails. Colour cycles faster when the music is louder.
import { createDrive, createStill, idle } from './demo'
import type { VisualizerDef, VisualizerInstance } from './types'

const WEDGES = 8 // even, so the mirrored pairs close the circle
const POINTS = 128
const FADE_PER_SEC = 2.5
const ROT_PER_SEC = 0.5 // radians; louder music spins faster
const HUE_PER_SEC = 30 // plus up to HUE_PER_SEC * 4 at full intensity

function swirlInstance(): VisualizerInstance {
  const drive = createDrive()
  const skip = createStill()
  let rot = 0
  let hue = 0
  let size = ''
  return {
    draw(ctx, f, dt) {
      if (!f) return idle(ctx, f)
      if (skip(f)) return
      const step = f.reducedMotion ? 0 : dt
      const { intensity, pulse } = drive(f, dt)
      rot += ROT_PER_SEC * (1 + intensity * 2) * step
      hue = (hue + HUE_PER_SEC * (1 + intensity * 4) * step) % 360
      // the canvas keeps the last frame; fading it leaves the trails (a resize clears it)
      const key = `${f.width}x${f.height}`
      const a = key === size && !f.reducedMotion ? 1 - Math.exp(-FADE_PER_SEC * dt) : 1
      size = key
      ctx.fillStyle = `rgba(0,0,0,${a})`
      ctx.fillRect(0, 0, f.width, f.height)

      const R = Math.hypot(f.width, f.height) / 2
      const r0 = R * 0.04
      const amp = R * 0.12 * (0.6 + pulse * 0.6)
      const n = f.time.length
      // one wedge's waveform, as a curve along the x axis from r0 to R, bending with the radius
      const wave = new Path2D()
      for (let i = 0; i <= POINTS; i++) {
        const p = i / POINTS
        const v = f.time[Math.floor(p * (n - 1))] ?? 0
        const x = r0 + p * (R - r0)
        const y = v * amp * p + Math.sin(p * Math.PI * 2 + rot * 2) * R * 0.05 * p
        if (i === 0) wave.moveTo(x, y)
        else wave.lineTo(x, y)
      }
      ctx.save()
      ctx.translate(f.width / 2, f.height / 2)
      ctx.lineWidth = 2
      for (let k = 0; k < WEDGES; k++) {
        ctx.save()
        ctx.rotate((k / WEDGES) * Math.PI * 2 + rot)
        if (k % 2) ctx.scale(1, -1)
        ctx.strokeStyle = `hsl(${(hue + (k % 2) * 40) % 360},100%,${50 + 25 * intensity}%)`
        ctx.stroke(wave)
        ctx.restore()
      }
      ctx.restore()
    },
  }
}

export const swirl: VisualizerDef = { id: 'swirl', name: 'Swirl', create: swirlInstance }
