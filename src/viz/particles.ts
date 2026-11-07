// WMP Alchemy-style particle fountain: emission rate and colour follow the loudness, and each
// note trigger fires a burst coloured by its channel. Additive blending over fading trails.
import { createDrive, createStill, idle } from './demo'
import type { VisualizerDef, VisualizerInstance } from './types'

const MAX = 1500
const BASE_PER_SEC = 40 // fountain emission, plus up to RATE_PER_SEC at full loudness
const RATE_PER_SEC = 400
const BURST = 40 // particles per triggered channel
const LIFE_SEC = 2.2
const GRAVITY = 0.9 // fraction of the canvas height per second²
const FADE_PER_SEC = 6

function particlesInstance(): VisualizerInstance {
  const drive = createDrive()
  const skip = createStill()
  // positions and velocities in canvas-height units, so the look is size-independent
  const x = new Float32Array(MAX)
  const y = new Float32Array(MAX)
  const vx = new Float32Array(MAX)
  const vy = new Float32Array(MAX)
  const life = new Float32Array(MAX) // seconds left; <= 0 = free
  const hue = new Float32Array(MAX)
  let next = 0
  let owed = 0
  let t = 0
  let size = ''
  const emit = (ex: number, ey: number, speed: number, spread: number, h: number): void => {
    // ponytail: ring-buffer reuse, so a flood overwrites the oldest particles
    const i = next
    next = (next + 1) % MAX
    const a = -Math.PI / 2 + (Math.random() - 0.5) * spread
    const s = speed * (0.6 + Math.random() * 0.6)
    x[i] = ex
    y[i] = ey
    vx[i] = Math.cos(a) * s
    vy[i] = Math.sin(a) * s
    life[i] = LIFE_SEC * (0.6 + Math.random() * 0.4)
    hue[i] = h
  }
  return {
    draw(ctx, f, dt) {
      if (!f) return idle(ctx, f)
      if (skip(f)) return
      const step = f.reducedMotion ? 0 : dt
      const { intensity } = drive(f, dt)
      t += step
      const aspect = f.width / Math.max(1, f.height)
      const ex = aspect / 2 + Math.sin(t * 0.7) * aspect * 0.2
      const ey = 0.95

      owed += (BASE_PER_SEC + RATE_PER_SEC * intensity) * step
      const baseHue = (200 - intensity * 200 + t * 10 + 360) % 360
      for (; owed >= 1; owed--) emit(ex, ey, 0.9 + intensity * 0.6, 0.5, baseHue)
      if (step > 0) {
        f.snap.ch.forEach((c, n) => {
          if (!c.triggered) return
          const bx = aspect * ((n + 0.5) / f.snap.ch.length)
          for (let k = 0; k < BURST; k++) emit(bx, ey, 0.7 + c.volume * 0.6, 1.4, (n * 47) % 360)
        })
      }

      const key = `${f.width}x${f.height}`
      const a = key === size && !f.reducedMotion ? 1 - Math.exp(-FADE_PER_SEC * dt) : 1
      size = key
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = `rgba(0,0,0,${a})`
      ctx.fillRect(0, 0, f.width, f.height)

      ctx.globalCompositeOperation = 'lighter'
      const scale = f.height
      for (let i = 0; i < MAX; i++) {
        const l = life[i] ?? 0
        if (l <= 0) continue
        vy[i] = (vy[i] ?? 0) + GRAVITY * step
        x[i] = (x[i] ?? 0) + (vx[i] ?? 0) * step
        y[i] = (y[i] ?? 0) + (vy[i] ?? 0) * step
        life[i] = l - step
        const k = l / LIFE_SEC
        const r = 1 + k * 2.5
        ctx.fillStyle = `hsla(${hue[i] ?? 0},100%,${45 + k * 30}%,${Math.min(1, k * 1.5)})`
        ctx.fillRect((x[i] ?? 0) * scale - r / 2, (y[i] ?? 0) * scale - r / 2, r, r)
      }
      ctx.globalCompositeOperation = 'source-over'
    },
  }
}

export const particles: VisualizerDef = {
  id: 'particles',
  name: 'Particles',
  create: particlesInstance,
}
