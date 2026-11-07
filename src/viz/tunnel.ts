// WMP Battery-style tunnel: polygons spawn on note triggers and shrink toward a drifting
// vanishing point. The triggering channel picks the shape's sides and colour.
import { createDrive, createStill, idle } from './demo'
import type { VisualizerDef, VisualizerInstance } from './types'

const POOL = 64
const MIN_SPAWN_SEC = 0.06 // at most ~16 shapes a second
const IDLE_SPAWN_SEC = 0.5 // keeps the tunnel going through quiet passages
const MAX_DEPTH = 6
const DEPTH_PER_SEC = 1.2 // louder music flies faster
const PERSPECTIVE = 1.5

interface Ring {
  depth: number // < 0 = free slot
  sides: number
  hue: number
  spin: number
  rot: number
}

function tunnelInstance(): VisualizerInstance {
  const drive = createDrive()
  const skip = createStill()
  const rings: Ring[] = Array.from({ length: POOL }, () => ({
    depth: -1,
    sides: 4,
    hue: 0,
    spin: 0,
    rot: 0,
  }))
  let sinceSpawn = 0
  let t = 0
  const spawn = (channel: number): void => {
    // reuse a free slot, else the deepest ring
    let slot = rings[0]
    for (const r of rings) {
      if (r.depth < 0) {
        slot = r
        break
      }
      if (slot && r.depth > slot.depth) slot = r
    }
    if (!slot) return
    slot.depth = 0
    slot.sides = 3 + (channel % 4)
    slot.hue = (channel * 47 + t * 20) % 360
    slot.spin = (Math.random() - 0.5) * 2
    slot.rot = Math.random() * Math.PI
    sinceSpawn = 0
  }
  return {
    draw(ctx, f, dt) {
      if (!f) return idle(ctx, f)
      if (skip(f)) return
      const step = f.reducedMotion ? 0 : dt
      const { intensity, pulse } = drive(f, dt)
      t += step
      sinceSpawn += step
      if (sinceSpawn >= MIN_SPAWN_SEC) {
        const c = f.snap.ch.findIndex((ch) => ch.triggered)
        if (c >= 0) spawn(c)
        else if (sinceSpawn >= IDLE_SPAWN_SEC) spawn(Math.floor(t))
      }

      ctx.fillStyle = `rgb(${Math.round(pulse * 20)},0,${Math.round(10 + pulse * 30)})`
      ctx.fillRect(0, 0, f.width, f.height)
      // vanishing point drifts in a slow figure eight
      const vx = f.width / 2 + Math.sin(t * 0.4) * f.width * 0.15
      const vy = f.height / 2 + Math.sin(t * 0.8) * f.height * 0.1
      const R = Math.hypot(f.width, f.height) * 0.6
      const speed = DEPTH_PER_SEC * (0.6 + intensity * 1.6)
      for (const r of rings) {
        if (r.depth < 0) continue
        r.depth += speed * step
        r.rot += r.spin * step
        if (r.depth > MAX_DEPTH) r.depth = -1
      }
      // far rings first, so near ones draw on top
      for (let pass = MAX_DEPTH; pass > 0; pass--) {
        for (const r of rings) {
          if (r.depth < pass - 1 || r.depth >= pass) continue
          const s = 1 / (1 + r.depth * PERSPECTIVE)
          const cx = vx + (f.width / 2 - vx) * s
          const cy = vy + (f.height / 2 - vy) * s
          const rad = R * s
          ctx.strokeStyle = `hsla(${r.hue},100%,60%,${1 - r.depth / MAX_DEPTH})`
          ctx.lineWidth = Math.max(1, 6 * s)
          ctx.beginPath()
          for (let i = 0; i <= r.sides; i++) {
            const a = r.rot + (i / r.sides) * Math.PI * 2
            const x = cx + Math.cos(a) * rad
            const y = cy + Math.sin(a) * rad
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }
      }
    },
  }
}

export const tunnel: VisualizerDef = { id: 'tunnel', name: 'Tunnel', create: tunnelInstance }
