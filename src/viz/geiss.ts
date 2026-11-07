// Geiss-style flowing waves: the image drifts upward in wobbling strips (sub-pixel moves smear it
// like liquid), fades, and fresh colour-cycling waveforms are drawn on top each frame.
import { createDrive, createStill, idle } from './demo'
import type { VisualizerDef, VisualizerInstance } from './types'

const RES = 0.5 // buffer resolution vs. the canvas, for speed
const STRIP = 4 // buffer px per flow strip
const FLOW_PER_SEC = 0.08 // upward drift, fraction of the height per second; louder flows faster
const WOBBLE = 0.012 // sideways strip wobble, fraction of the width
const FADE_PER_SEC = 0.9
const HUE_PER_SEC = 35

function geissInstance(): VisualizerInstance {
  const drive = createDrive()
  const skip = createStill()
  const buf = document.createElement('canvas')
  const bctx = buf.getContext('2d')
  let t = 0
  return {
    draw(ctx, f, dt) {
      if (!f || !bctx) return idle(ctx, f)
      if (skip(f)) return
      const bw = Math.max(1, Math.round(f.width * RES))
      const bh = Math.max(1, Math.round(f.height * RES))
      if (buf.width !== bw || buf.height !== bh) {
        buf.width = bw
        buf.height = bh
        bctx.fillStyle = '#000'
        bctx.fillRect(0, 0, bw, bh)
      }
      const step = f.reducedMotion ? 0 : dt
      const { intensity, pulse } = drive(f, dt)
      t += step

      // flow: top to bottom, each strip moves up, so no strip reads pixels already moved this frame
      const flow = bh * FLOW_PER_SEC * (1 + intensity * 2) * step
      if (flow > 0) {
        for (let sy = 0; sy < bh; sy += STRIP) {
          const dx = Math.sin(sy * 0.05 + t * 1.7) * bw * WOBBLE * step * 8
          bctx.drawImage(buf, 0, sy, bw, STRIP, dx, sy - flow, bw, STRIP)
        }
      }
      bctx.fillStyle = `rgba(0,0,0,${1 - Math.exp(-FADE_PER_SEC * step)})`
      bctx.fillRect(0, 0, bw, bh)

      // two waves: the mix, and the same mirrored, in complementary hues
      const n = f.time.length
      const hue = (t * HUE_PER_SEC) % 360
      bctx.lineWidth = Math.max(1, bh * 0.006) * (1 + pulse)
      for (let k = 0; k < 2; k++) {
        const mid = bh * (0.62 + k * 0.12)
        const amp = bh * 0.22 * (k ? -0.7 : 1)
        bctx.strokeStyle = `hsl(${(hue + k * 150) % 360},100%,${55 + intensity * 25}%)`
        bctx.beginPath()
        for (let x = 0; x <= bw; x += 2) {
          const v = f.time[Math.floor((x / bw) * (n - 1))] ?? 0
          const y = mid - v * amp
          if (x === 0) bctx.moveTo(x, y)
          else bctx.lineTo(x, y)
        }
        bctx.stroke()
      }

      ctx.imageSmoothingEnabled = true
      ctx.drawImage(buf, 0, 0, f.width, f.height)
    },
  }
}

export const geiss: VisualizerDef = { id: 'geiss', name: 'Flow', create: geissInstance }
