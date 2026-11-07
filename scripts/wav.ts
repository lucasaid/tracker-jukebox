/** 16-bit PCM, clamped to ±1. */
export function writeWav(
  _path: string,
  _left: Float32Array,
  _right: Float32Array,
  _sampleRate: number,
): void {
  throw new Error('Not implemented (P9)')
}

/** 16-bit PCM or 32-bit float; anything else throws Error('Unsupported WAV'). */
export function readWav(_path: string): { sampleRate: number; channels: Float32Array[] } {
  throw new Error('Not implemented (P10)')
}
