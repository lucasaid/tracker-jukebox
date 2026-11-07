// MilkDrop-lite: each frame redraws the previous one zoomed, rotated and faded, then draws the
// waveform on top. Note triggers kick the zoom. Click toggles a line or ring wave. Canvas 2D only.
import { createDrive, createModeLabel, createStill, idle } from './demo'
import type { VisualizerDef, VisualizerInstance } from './types'

const RES = 0.5 // feedback buffer resolution vs. the canvas, for speed
const ZOOM_PER_SEC = 0.35 // log zoom rate; a trigger pulse adds PULSE_ZOOM
const PULSE_ZOOM = 2
const ROT_PER_SEC = 0.15 // radians
const FADE_PER_SEC = 1.2
const HUE_PER_SEC = 25 // degrees

function warpInstance(): VisualizerInstance {
  const drive = createDrive()
  const skip = createStill()
  const buf = document.createElement('canvas')
  const bctx = buf.getContext('2d')
  let ring = true
  let t = 0
  const label = createModeLabel()
  return {
    click() {
      ring = !ring
      label.show(ring ? 'ring' : 'line')
    },
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
      const { intensity, pulse } = drive(f, dt)
      const step = f.reducedMotion ? 0 : dt
      t += step

      // feedback: zoom + rotate the last frame about the centre (canvas copies itself first)
      const zoom = Math.exp((ZOOM_PER_SEC + pulse * PULSE_ZOOM) * step)
      bctx.save()
      bctx.translate(bw / 2, bh / 2)
      bctx.rotate(ROT_PER_SEC * Math.sin(t * 0.3) * step * 4)
      bctx.scale(zoom, zoom)
      bctx.drawImage(buf, -bw / 2, -bh / 2)
      bctx.restore()
      bctx.fillStyle = `rgba(0,0,0,${1 - Math.exp(-FADE_PER_SEC * step)})`
      bctx.fillRect(0, 0, bw, bh)

      // the wave
      const hue = (t * HUE_PER_SEC) % 360
      bctx.strokeStyle = `hsl(${hue},100%,${55 + 25 * intensity}%)`
      bctx.lineWidth = Math.max(1, Math.min(bw, bh) * 0.006)
      bctx.beginPath()
      const n = f.time.length
      const pts = 256
      for (let i = 0; i <= pts; i++) {
        const v = f.time[Math.floor(((i % pts) / pts) * n)] ?? 0
        let x: number
        let y: number
        if (ring) {
          const a = (i / pts) * Math.PI * 2
          const r = Math.min(bw, bh) * (0.22 + v * 0.18)
          x = bw / 2 + Math.cos(a) * r
          y = bh / 2 + Math.sin(a) * r
        } else {
          x = (i / pts) * bw
          y = bh / 2 - v * bh * 0.3
        }
        if (i === 0) bctx.moveTo(x, y)
        else bctx.lineTo(x, y)
      }
      bctx.stroke()

      ctx.imageSmoothingEnabled = true
      ctx.drawImage(buf, 0, 0, f.width, f.height)
      label.draw(ctx, dt)
    },
  }
}

export const warp: VisualizerDef = { id: 'warp', name: 'Warp', create: warpInstance }
