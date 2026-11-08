import type { ParsedFile } from '../formats'
import type { Snapshot } from '../engine'

/** CSS colour strings read by VisualizerHost from the theme's --pat-* / --scope-* / --fg / --dim / --accent tokens. */
export interface Palette {
  fg: string
  dim: string
  accent: string
  rownum: string
  note: string
  inst: string
  vol: string
  fx: string
  empty: string
  sep: string
  beat: string
  cur: string
  bg: string // --scope-bg
  grid: string // --scope-grid
  wave: string // --scope-wave
}

export interface Frame {
  snap: Snapshot
  song: ParsedFile
  /** analyser.getFloatTimeDomainData, length 2048 */
  time: Float32Array
  /** analyser.getByteFrequencyData, length 1024 */
  freq: Uint8Array
  /** CSS px; ctx is already scaled by dpr */
  width: number
  height: number
  dpr: number
  reducedMotion: boolean
  palette: Palette
}

export interface VisualizerInstance {
  /** f = null when nothing is loaded. dt = seconds since the previous call (0 on the first). */
  draw(ctx: CanvasRenderingContext2D, f: Frame | null, dt: number): void
  click?(x: number, y: number): void
  dispose?(): void
}

export interface VisualizerDef {
  id: string
  name: string
  create(): VisualizerInstance
  /** false → unavailable for streamed (MP3/FLAC) songs: the picker greys it out and the host draws Scope */
  streams?: false
}
