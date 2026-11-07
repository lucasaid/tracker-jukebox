// 3D spectrum terrain: past spectra as ridge lines receding toward a horizon, newest at the front.
// Themed: --scope-bg behind, --scope-wave ridges fading into the background with depth.
// Click cycles the ridge colour through the theme's palette.
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
      ctx.lineWidth = 1.25
      // back to front: each ridge is filled black to hide the ones behind it
      for (let d = DEPTH - 1; d >= 0; d--) {
        const z = d / (DEPTH - 1)
        const s = 1 / (1 + z * PERSPECTIVE)
        const baseY = horizonY + (groundY - horizonY) * s
        const row = ((head + d) % DEPTH) * BANDS
        ctx.beginPath()
        ctx.moveTo(cx - spanX * s * 0.5, baseY)
        for (let b = 0; b < BANDS; b++) {
          const x = cx + (b / (BANDS - 1) - 0.5) * spanX * s
          ctx.lineTo(x, baseY - ((rows[row + b] ?? 0) / 255) * ampY * s)
        }
        ctx.lineTo(cx + spanX * s * 0.5, baseY)
        ctx.fillStyle = p.bg
        ctx.fill()
        ctx.strokeStyle = wave
        ctx.globalAlpha = 1 - z * 0.8
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    },
  }
}

export const terrain: VisualizerDef = { id: 'terrain', name: 'Terrain', create: terrainInstance }
