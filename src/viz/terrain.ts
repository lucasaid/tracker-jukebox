// 3D spectrum terrain: past spectra as ridge lines receding toward a horizon, newest at the front.
// Themed: --scope-bg behind, --scope-wave ridges fading into the background with depth.
// Click cycles the colour through the theme's palette; each time the colours wrap around it
// switches between ridge lines and a smooth shaded surface.
import { createColourCycle } from './colours'
import type { VisualizerDef, VisualizerInstance } from './types'

const BANDS = 48
const DEPTH = 40
const MIN_HZ = 40
const MAX_HZ = 16000
// ponytail: the Frame carries no sample rate, so FFT bins are mapped as if it were 48 kHz.
const BIN_HZ = 48000 / 2048
const ROW_SEC = 1 / 30 // how often a new ridge is pushed
const PERSPECTIVE = 3 // larger = stronger shrink toward the horizon

type Rgb = [number, number, number]

/** '#rgb' / '#rrggbb' → [r, g, b]; anything else (a CSS colour the canvas can't hand back) → null. */
function parseHex(css: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css.trim())
  if (!m?.[1]) return null
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  const n = parseInt(hex, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function terrainInstance(): VisualizerInstance {
  // ring buffer of DEPTH spectra, `head` is the newest row
  const rows = new Uint8Array(DEPTH * BANDS)
  let head = 0
  let pendingSec = 0
  const lo = new Uint16Array(BANDS)
  const hi = new Uint16Array(BANDS)
  for (let b = 0; b < BANDS; b++) {
    lo[b] = Math.floor((MIN_HZ * (MAX_HZ / MIN_HZ) ** (b / BANDS)) / BIN_HZ)
    hi[b] = Math.max(
      (lo[b] ?? 0) + 1,
      Math.floor((MIN_HZ * (MAX_HZ / MIN_HZ) ** ((b + 1) / BANDS)) / BIN_HZ),
    )
  }
  const cycle = createColourCycle()
  // screen position and height (0..1) of every grid point, row-major by depth
  const xs = new Float32Array(DEPTH * BANDS)
  const ys = new Float32Array(DEPTH * BANDS)
  const hs = new Float32Array(DEPTH * BANDS)
  const bases = new Float32Array(DEPTH) // screen y of zero height per depth row
  /** Back to front: each ridge is filled with the background to hide the ones behind it. */
  function drawRidges(ctx: CanvasRenderingContext2D, colour: string, bg: string): void {
    ctx.lineWidth = 1.25
    ctx.strokeStyle = colour
    ctx.fillStyle = bg
    for (let d = DEPTH - 1; d >= 0; d--) {
      const o = d * BANDS
      const baseY = bases[d] ?? 0
      ctx.beginPath()
      ctx.moveTo(xs[o] ?? 0, baseY)
      for (let b = 0; b < BANDS; b++) ctx.lineTo(xs[o + b] ?? 0, ys[o + b] ?? 0)
      ctx.lineTo(xs[o + BANDS - 1] ?? 0, baseY)
      ctx.fill()
      ctx.globalAlpha = 1 - (d / (DEPTH - 1)) * 0.8
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  /** Back to front: one shaded quad per grid cell, lit by height and by slope toward the viewer. */
  function drawSurface(ctx: CanvasRenderingContext2D, c: Rgb, bg: Rgb): void {
    ctx.lineWidth = 1 // stroking each quad in its own colour hides the anti-aliasing seams
    for (let d = DEPTH - 1; d >= 1; d--) {
      const fade = 1 - (d / (DEPTH - 1)) * 0.75
      const back = d * BANDS
      const front = (d - 1) * BANDS
      for (let b = 0; b < BANDS - 1; b++) {
        const hb = ((hs[back + b] ?? 0) + (hs[back + b + 1] ?? 0)) / 2
        const hf = ((hs[front + b] ?? 0) + (hs[front + b + 1] ?? 0)) / 2
        const light = Math.max(0.12, Math.min(1, 0.22 + 0.6 * (hb + hf) * 0.5 + 1.2 * (hb - hf)))
        const k = light * fade
        const col = `rgb(${Math.round(bg[0] + (c[0] - bg[0]) * k)},${Math.round(bg[1] + (c[1] - bg[1]) * k)},${Math.round(bg[2] + (c[2] - bg[2]) * k)})`
        ctx.fillStyle = col
        ctx.strokeStyle = col
        ctx.beginPath()
        ctx.moveTo(xs[back + b] ?? 0, ys[back + b] ?? 0)
        ctx.lineTo(xs[back + b + 1] ?? 0, ys[back + b + 1] ?? 0)
        ctx.lineTo(xs[front + b + 1] ?? 0, ys[front + b + 1] ?? 0)
        ctx.lineTo(xs[front + b] ?? 0, ys[front + b] ?? 0)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
    }
  }

  return {
    click: cycle.next,
    draw(ctx, f, dt) {
      const w = f?.width ?? ctx.canvas.clientWidth
      const h = f?.height ?? ctx.canvas.clientHeight
      ctx.fillStyle = f?.palette.bg ?? '#000'
      ctx.fillRect(0, 0, w, h)
      if (!f) return
      const p = f.palette
      const wave = cycle.colour(p)
      pendingSec += dt
      // ponytail: at most 4 rows per frame, so a long stall doesn't fill the field with one spectrum
      const steps = Math.min(4, Math.floor(pendingSec / ROW_SEC))
      pendingSec -= steps * ROW_SEC
      for (let s = 0; s < steps; s++) {
        head = (head + DEPTH - 1) % DEPTH
        for (let b = 0; b < BANDS; b++) {
          let level = 0
          for (let i = lo[b] ?? 0; i < (hi[b] ?? 0); i++) level = Math.max(level, f.freq[i] ?? 0)
          rows[head * BANDS + b] = level
        }
      }

      const cx = w / 2
      const horizonY = h * 0.22
      const groundY = h * 0.97
      const spanX = w * 0.95
      const ampY = h * 0.45
      for (let d = 0; d < DEPTH; d++) {
        const z = d / (DEPTH - 1)
        const sc = 1 / (1 + z * PERSPECTIVE)
        const baseY = horizonY + (groundY - horizonY) * sc
        const row = ((head + d) % DEPTH) * BANDS
        bases[d] = baseY
        for (let b = 0; b < BANDS; b++) {
          const k = d * BANDS + b
          const v = (rows[row + b] ?? 0) / 255
          hs[k] = v
          xs[k] = cx + (b / (BANDS - 1) - 0.5) * spanX * sc
          ys[k] = baseY - v * ampY * sc
        }
      }
      const c = parseHex(wave)
      const bg = parseHex(p.bg)
      if (cycle.lap(p) % 2 === 1 && c && bg) drawSurface(ctx, c, bg)
      else drawRidges(ctx, wave, p.bg)
    },
  }
}

export const terrain: VisualizerDef = { id: 'terrain', name: 'Terrain', create: terrainInstance }
