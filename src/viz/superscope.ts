// AVS-style superscope: a parametric curve whose radius follows the waveform, over fading trails.
// Click cycles ring → spiral → starburst → lissajous.
import { createDrive, createStill, idle } from './demo'
import type { VisualizerDef, VisualizerInstance } from './types'

const SHAPES = ['ring', 'spiral', 'starburst', 'lissajous'] as const
const POINTS = 512
const RAYS = 96 // starburst
const FADE_PER_SEC = 4
const ROT_PER_SEC = 0.4 // radians; a trigger pulse spins it faster
const HUE_PER_SEC = 40
const LABEL_SEC = 1.5

function superscopeInstance(start = 0): VisualizerInstance {
  const drive = createDrive()
  const skip = createStill()
  let shape = start % SHAPES.length
  let labelSec = 0
  let rot = 0
  let t = 0
  let size = ''
  return {
    click() {
      shape = (shape + 1) % SHAPES.length
      labelSec = LABEL_SEC
      return shape
    },
    draw(ctx, f, dt) {
      if (!f) return idle(ctx, f)
      if (skip(f)) return
      const step = f.reducedMotion ? 0 : dt
      const { intensity, pulse } = drive(f, dt)
      t += step
      rot += (ROT_PER_SEC + pulse * 1.5) * step
      // the canvas keeps the last frame; fading it leaves the trails (a resize clears it)
      const key = `${f.width}x${f.height}`
      const a = key === size && !f.reducedMotion ? 1 - Math.exp(-FADE_PER_SEC * dt) : 1
      size = key
      ctx.fillStyle = `rgba(0,0,0,${a})`
      ctx.fillRect(0, 0, f.width, f.height)

      const cx = f.width / 2
      const cy = f.height / 2
      const R = Math.min(f.width, f.height) * 0.42
      const n = f.time.length
      const s = SHAPES[shape]
      ctx.strokeStyle = `hsl(${(t * HUE_PER_SEC) % 360},100%,${55 + 25 * intensity}%)`
      ctx.lineWidth = 1.5 + pulse * 1.5
      ctx.beginPath()
      if (s === 'starburst') {
        for (let i = 0; i < RAYS; i++) {
          const v = Math.abs(f.time[Math.floor((i / RAYS) * n)] ?? 0)
          const ang = (i / RAYS) * Math.PI * 2 + rot
          const r = R * Math.min(1, 0.15 + v * 1.6)
          ctx.moveTo(cx + Math.cos(ang) * R * 0.08, cy + Math.sin(ang) * R * 0.08)
          ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r)
        }
      } else {
        for (let i = 0; i <= POINTS; i++) {
          const p = i / POINTS
          const v = f.time[Math.floor(((i % POINTS) / POINTS) * n)] ?? 0
          let x: number
          let y: number
          if (s === 'spiral') {
            const ang = p * Math.PI * 8 + rot
            const r = R * p * (0.85 + v * 0.5)
            x = cx + Math.cos(ang) * r
            y = cy + Math.sin(ang) * r
          } else if (s === 'lissajous') {
            const k = 0.7 + v * 0.4
            x = cx + Math.sin(p * Math.PI * 6 + rot) * R * k
            y = cy + Math.cos(p * Math.PI * 4 + rot * 0.5) * R * k
          } else {
            const ang = p * Math.PI * 2 + rot
            const r = R * (0.6 + v * 0.5)
            x = cx + Math.cos(ang) * r
            y = cy + Math.sin(ang) * r
          }
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
      }
      ctx.stroke()

      if (labelSec > 0) {
        labelSec -= dt
        ctx.fillStyle = '#c0c0c0'
        ctx.font = '12px monospace'
        ctx.fillText(s ?? '', 6, 16)
      }
    },
  }
}

export const superscope: VisualizerDef = {
  id: 'superscope',
  name: 'Superscope',
  create: superscopeInstance,
}
