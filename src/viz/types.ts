import type { ParsedFile } from '../formats'
import type { Snapshot } from '../engine'

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
}
