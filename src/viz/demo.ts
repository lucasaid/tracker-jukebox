// Plasma, starfield, copper (decision 31). These keep their own colours, not the theme palette,
// except the starfield's click-on colour mode.
import { themeColours } from './colours'
import type { Frame, VisualizerDef, VisualizerInstance } from './types'

const PULSE_SEC = 0.25
const TAU = Math.PI * 2

interface Drive {
  intensity: number
  pulse: number
}

/** Shared audio drive: intensity from the mix RMS, a pulse that decays after any channel trigger. */
export function createDrive(): (f: Frame, dt: number) => Drive {
  const d: Drive = { intensity: 0, pulse: 0 }
  return (f, dt) => {
    let sum = 0
    for (let i = 0; i < f.time.length; i++) sum += (f.time[i] ?? 0) ** 2
    d.intensity = Math.min(1, Math.sqrt(sum / f.time.length) * 4)
    if (f.snap.ch.some((c) => c.triggered)) d.pulse = 1
    else d.pulse = Math.max(0, d.pulse - dt / PULSE_SEC)
    return d
  }
}

/** With reducedMotion a visualizer draws once per canvas size and then stops. */
export function createStill(): (f: Frame) => boolean {
  let key = ''
  return (f) => {
    if (!f.reducedMotion) return false
    const k = `${f.width}x${f.height}`
    if (k === key) return true
    key = k
    return false
  }
}

export const idle = (ctx: CanvasRenderingContext2D, f: Frame | null): void => {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, f?.width ?? ctx.canvas.clientWidth, f?.height ?? ctx.canvas.clientHeight)
}

function plasmaInstance(): VisualizerInstance {
  const drive = createDrive()
  const skip = createStill()
  const small = document.createElement('canvas')
  const sctx = small.getContext('2d')
  const lut = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i++) {
    lut[i * 3] = 128 + 127 * Math.sin((i / 256) * TAU)
    lut[i * 3 + 1] = 128 + 127 * Math.sin((i / 256) * TAU + 2.1)
    lut[i * 3 + 2] = 128 + 127 * Math.sin((i / 256) * TAU + 4.2)
  }
  let t = 0
  return {
    draw(ctx, f, dt) {
      if (!f || !sctx) return idle(ctx, f)
      if (skip(f)) return
      const { intensity, pulse } = drive(f, dt)
      t += f.reducedMotion ? 1 : dt * (0.4 + 3 * intensity)
      const cols = 96
      const rows = Math.max(16, Math.round((cols * f.height) / Math.max(f.width, 1)))
      if (small.width !== cols || small.height !== rows) {
        small.width = cols
        small.height = rows
      }
      const img = sctx.createImageData(cols, rows)
      const bright = 0.35 + 0.5 * intensity + 0.15 * pulse
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v =
            Math.sin(x * 0.16 + t) +
            Math.sin(y * 0.22 + t * 1.3) +
            Math.sin((x + y) * 0.1 + t * 0.7) +
            Math.sin(Math.hypot(x - cols / 2, y - rows / 2) * 0.25 - t)
          const i = (Math.floor((v + 4) * 32) & 255) * 3
          const o = (y * cols + x) * 4
          img.data[o] = (lut[i] ?? 0) * bright
          img.data[o + 1] = (lut[i + 1] ?? 0) * bright
          img.data[o + 2] = (lut[i + 2] ?? 0) * bright
          img.data[o + 3] = 255
        }
      }
      sctx.putImageData(img, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(small, 0, 0, f.width, f.height)
    },
  }
}

interface Star {
  x: number
  y: number
  z: number
  /** picks the channel this star follows: group % channel count */
  group: number
}

/** Enough groups that any channel count up to this spreads evenly over the stars. */
const STAR_GROUPS = 64
/** A trail reaches back to where the star was this many seconds ago. */
const TRAIL_SEC = 0.12

function starfieldInstance(): VisualizerInstance {
  const drive = createDrive()
  const skip = createStill()
  const stars: Star[] = Array.from({ length: 220 }, () => ({
    x: Math.random() * 2 - 1,
    y: Math.random() * 2 - 1,
    z: Math.random() * 0.95 + 0.05,
    group: Math.floor(Math.random() * STAR_GROUPS),
  }))
  /** per-channel pulse, 1 on a trigger, decaying over PULSE_SEC */
  const pulses = new Float32Array(STAR_GROUPS)
  /** click cycles: plain, coloured, plain + trails, coloured + trails */
  let mode = 0
  return {
    click() {
      mode = (mode + 1) % 4
    },
    draw(ctx, f, dt) {
      if (!f) return idle(ctx, f)
      if (skip(f)) return
      const { intensity } = drive(f, dt)
      const chs = f.snap.ch
      const nCh = Math.max(1, Math.min(chs.length, STAR_GROUPS))
      for (let i = 0; i < nCh; i++)
        pulses[i] = chs[i]?.triggered ? 1 : Math.max(0, (pulses[i] ?? 0) - dt / PULSE_SEC)
      const colours = mode & 1 ? themeColours(f.palette) : []
      const trails = (mode & 2) !== 0
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, f.width, f.height)
      const speed = f.reducedMotion ? 0 : 0.25 + 1.2 * intensity
      const cx = f.width / 2
      const cy = f.height / 2
      const scale = Math.max(f.width, f.height) / 2
      for (const s of stars) {
        s.z -= speed * dt
        if (s.z <= 0.02) {
          s.x = Math.random() * 2 - 1
          s.y = Math.random() * 2 - 1
          s.z = 1
        }
        const px = cx + (s.x / s.z) * scale * 0.5
        const py = cy + (s.y / s.z) * scale * 0.5
        if (px < 0 || px >= f.width || py < 0 || py >= f.height) {
          s.z = 1
          continue
        }
        // Each star follows one channel: on its hits nearer stars swell, whiten and get a halo.
        // Coloured mode fades the group into its theme colour instead of white.
        const ch = s.group % nCh
        const pulse = pulses[ch] ?? 0
        const tint = colours[ch % Math.max(1, colours.length)]
        const near = 1 - s.z
        const size = (near * 2.5 + 0.5) * (1 + pulse * (0.5 + 1.5 * near))
        const c = Math.round(120 + 135 * near + (tint ? 0 : (135 - 135 * near) * pulse))
        const base = `rgb(${c},${c},255)`
        // Trails flash with the channel, like the halo: full on a hit, gone once the pulse decays.
        if (trails && speed > 0 && pulse > 0.05) {
          const tz = s.z + speed * TRAIL_SEC
          ctx.beginPath()
          ctx.moveTo(cx + (s.x / tz) * scale * 0.5, cy + (s.y / tz) * scale * 0.5)
          ctx.lineTo(px, py)
          ctx.lineWidth = size * 0.7
          ctx.globalAlpha = 0.6 * pulse
          ctx.strokeStyle = tint ?? base
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        if (pulse > 0.05) {
          const halo = size * 3
          ctx.globalAlpha = 0.25 * pulse * (0.3 + near)
          ctx.fillStyle = tint ?? base
          ctx.fillRect(px - halo / 2, py - halo / 2, halo, halo)
          ctx.globalAlpha = 1
        }
        ctx.fillStyle = base
        ctx.fillRect(px - size / 2, py - size / 2, size, size)
        if (tint && pulse > 0) {
          ctx.globalAlpha = pulse
          ctx.fillStyle = tint
          ctx.fillRect(px - size / 2, py - size / 2, size, size)
          ctx.globalAlpha = 1
        }
      }
    },
  }
}

function copperInstance(): VisualizerInstance {
  const drive = createDrive()
  const skip = createStill()
  let t = 0
  return {
    draw(ctx, f, dt) {
      if (!f) return idle(ctx, f)
      if (skip(f)) return
      const { intensity, pulse } = drive(f, dt)
      t += f.reducedMotion ? 1 : dt
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, f.width, f.height)
      const amp = 0.15 + 0.85 * intensity
      const bar = Math.max(6, f.height / 14)
      for (let i = 0; i < 8; i++) {
        const y = f.height / 2 + Math.sin(t * 1.7 + i * 0.6) * f.height * 0.4 * amp
        const hue = (i * 40 + pulse * 140 + t * 20) % 360
        ctx.fillStyle = `hsl(${hue} 90% 25%)`
        ctx.fillRect(0, y - bar / 2, f.width, bar)
        ctx.fillStyle = `hsl(${hue} 90% 50%)`
        ctx.fillRect(0, y - bar / 3, f.width, (bar * 2) / 3)
        ctx.fillStyle = `hsl(${hue} 90% 80%)`
        ctx.fillRect(0, y - bar / 8, f.width, bar / 4)
      }
    },
  }
}

export const plasma: VisualizerDef = { id: 'plasma', name: 'Plasma', create: plasmaInstance }
export const starfield: VisualizerDef = {
  id: 'starfield',
  name: 'Starfield',
  create: starfieldInstance,
}
export const copper: VisualizerDef = { id: 'copper', name: 'Copper', create: copperInstance }
