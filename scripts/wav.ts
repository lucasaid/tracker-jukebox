import { writeFileSync } from 'node:fs'

/** 16-bit PCM, clamped to ±1. */
export function writeWav(
  path: string,
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
): void {
  const frames = left.length
  const dataBytes = frames * 4
  const view = new DataView(new ArrayBuffer(44 + dataBytes))
  const tag = (at: number, text: string): void => {
    for (let i = 0; i < 4; i++) view.setUint8(at + i, text.charCodeAt(i))
  }
  tag(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  tag(8, 'WAVE')
  tag(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 2, true) // channels
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 4, true)
  view.setUint16(32, 4, true)
  view.setUint16(34, 16, true)
  tag(36, 'data')
  view.setUint32(40, dataBytes, true)
  const pcm = (x: number): number => Math.round(Math.max(-1, Math.min(1, x)) * 32767)
  for (let i = 0; i < frames; i++) {
    view.setInt16(44 + i * 4, pcm(left[i] as number), true)
    view.setInt16(46 + i * 4, pcm(right[i] as number), true)
  }
  writeFileSync(path, new Uint8Array(view.buffer))
}

/** 16-bit PCM or 32-bit float; anything else throws Error('Unsupported WAV'). */
export function readWav(_path: string): { sampleRate: number; channels: Float32Array[] } {
  throw new Error('Not implemented (P10)')
}
