import { readFileSync, writeFileSync } from 'node:fs'

/** 16-bit PCM, clamped to ±1. */
export function writeWav(
  path: string,
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
): void {
  writeFileSync(path, encodeWav(left, right, sampleRate))
}

/** The bytes writeWav writes; the library manager serves them as an audio preview. */
export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Uint8Array {
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
  return new Uint8Array(view.buffer)
}

/** 16-bit PCM or 32-bit float; anything else throws Error('Unsupported WAV'). */
export function readWav(path: string): { sampleRate: number; channels: Float32Array[] } {
  const buf = readFileSync(path)
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const tag = (at: number): string => buf.toString('latin1', at, at + 4)
  if (buf.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Unsupported WAV')
  let fmt: { code: number; ch: number; rate: number; bits: number } | undefined
  for (let at = 12; at + 8 <= buf.length;) {
    const size = view.getUint32(at + 4, true)
    const body = at + 8
    if (tag(at) === 'fmt ') {
      let code = view.getUint16(body, true)
      if (code === 0xfffe) code = view.getUint16(body + 24, true) // WAVE_FORMAT_EXTENSIBLE sub-format
      fmt = {
        code,
        ch: view.getUint16(body + 2, true),
        rate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      }
    } else if (tag(at) === 'data') {
      const ok = fmt && ((fmt.code === 1 && fmt.bits === 16) || (fmt.code === 3 && fmt.bits === 32))
      if (!fmt || !ok || fmt.ch < 1) throw new Error('Unsupported WAV')
      const bytes = fmt.bits / 8
      const end = Math.min(body + size, buf.length) // tolerate a streamed/truncated size field
      const frames = Math.floor((end - body) / (bytes * fmt.ch))
      const channels = Array.from({ length: fmt.ch }, () => new Float32Array(frames))
      for (let f = 0; f < frames; f++)
        for (let c = 0; c < fmt.ch; c++) {
          const o = body + (f * fmt.ch + c) * bytes
          ;(channels[c] as Float32Array)[f] =
            fmt.bits === 16 ? view.getInt16(o, true) / 32768 : view.getFloat32(o, true)
        }
      return { sampleRate: fmt.rate, channels }
    }
    at = body + size + (size & 1)
  }
  throw new Error('Unsupported WAV')
}
