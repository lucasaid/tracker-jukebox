// Spectrogram waterfall: time runs left → right (newest column on the right), log frequency bottom → top.
import type { VisualizerDef, VisualizerInstance } from './types'

const COLS = 320
const ROWS = 160
const MIN_HZ = 40
const MAX_HZ = 16000
// ponytail: the Frame carries no sample rate, so FFT bins are mapped as if it were 48 kHz.
const BIN_HZ = 48000 / 2048
const COL_SEC = 1 / 60 // scroll speed, independent of the display refresh rate

/** Heat colours: black → blue → magenta → red → yellow → white. */
function heatLut(): Uint8Array {
  const stops: [number, number, number][] = [
    [0, 0, 0],
    [0, 0, 160],
    [160, 0, 160],
    [230, 30, 0],
    [255, 210, 0],
    [255, 255, 255],
  ]
  const lut = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1)
    const k = Math.min(stops.length - 2, Math.floor(t))
    const a = stops[k] ?? [0, 0, 0]
    const b = stops[k + 1] ?? a
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = (a[c] ?? 0) + ((b[c] ?? 0) - (a[c] ?? 0)) * (t - k)
  }
  return lut
}

function spectrogramInstance(): VisualizerInstance {
  const buf = document.createElement('canvas')
  buf.width = COLS
  buf.height = ROWS
  const bctx = buf.getContext('2d')
  const lut = heatLut()
  const column = bctx?.createImageData(1, ROWS)
  // FFT bin range per row, row 0 = top = highest frequency
  const lo = new Uint16Array(ROWS)
  const hi = new Uint16Array(ROWS)
  for (let r = 0; r < ROWS; r++) {
    const k = ROWS - 1 - r
    lo[r] = Math.floor((MIN_HZ * (MAX_HZ / MIN_HZ) ** (k / ROWS)) / BIN_HZ)
    hi[r] = Math.max(
      (lo[r] ?? 0) + 1,
      Math.floor((MIN_HZ * (MAX_HZ / MIN_HZ) ** ((k + 1) / ROWS)) / BIN_HZ),
    )
  }
  if (bctx) {
    bctx.fillStyle = '#000'
    bctx.fillRect(0, 0, COLS, ROWS)
  }
  let pendingSec = 0
  return {
    draw(ctx, f, dt) {
      const w = f?.width ?? ctx.canvas.clientWidth
      const h = f?.height ?? ctx.canvas.clientHeight
      if (!f || !bctx || !column) {
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, w, h)
        return
      }
      pendingSec += dt
      // ponytail: at most 4 columns per frame, so a long stall doesn't smear one spectrum across the screen
      const steps = Math.min(4, Math.floor(pendingSec / COL_SEC))
      pendingSec -= steps * COL_SEC
      if (steps > 0) {
        for (let r = 0; r < ROWS; r++) {
          let level = 0
          for (let i = lo[r] ?? 0; i < (hi[r] ?? 0); i++) level = Math.max(level, f.freq[i] ?? 0)
          const o = r * 4
          column.data[o] = lut[level * 3] ?? 0
          column.data[o + 1] = lut[level * 3 + 1] ?? 0
          column.data[o + 2] = lut[level * 3 + 2] ?? 0
          column.data[o + 3] = 255
        }
        bctx.drawImage(buf, -steps, 0)
        for (let s = 0; s < steps; s++) bctx.putImageData(column, COLS - 1 - s, 0)
      }
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(buf, 0, 0, w, h)
    },
  }
}

export const spectrogram: VisualizerDef = {
  id: 'spectrogram',
  name: 'Waterfall',
  create: spectrogramInstance,
}
