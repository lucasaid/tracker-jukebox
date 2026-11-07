// Synthesized modem handshake (decision 41): DTMF for 5551993, a 2100 Hz answer tone, then noise and 1200/2400 Hz tones.
const DTMF: Record<string, readonly [number, number]> = {
  '1': [697, 1209],
  '3': [697, 1477],
  '5': [770, 1336],
  '9': [852, 1477],
}
const NUMBER = '5551993'
const TONE_SEC = 0.08
const GAP_SEC = 0.05
const ANSWER_HZ = 2100
const ANSWER_SEC = 0.8
const SCREECH_SEC = 2.2
const SLOT_SEC = 0.11
const LEVEL = 0.2

/** About 4s synthesized handshake through ctx.destination. Resolves when finished or aborted; never rejects. */
export function playModemIntro(ctx: AudioContext, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  const out = ctx.createGain()
  out.gain.value = LEVEL
  out.connect(ctx.destination)
  const sources: (OscillatorNode | AudioBufferSourceNode)[] = []

  /** A tone of one or two sine partials with a short fade at both ends so it doesn't click. */
  const tone = (freqs: readonly number[], at: number, sec: number): void => {
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, at)
    env.gain.linearRampToValueAtTime(1 / freqs.length, at + 0.005)
    env.gain.setValueAtTime(1 / freqs.length, at + sec - 0.005)
    env.gain.linearRampToValueAtTime(0, at + sec)
    env.connect(out)
    for (const hz of freqs) {
      const osc = ctx.createOscillator()
      osc.frequency.value = hz
      osc.connect(env)
      osc.start(at)
      osc.stop(at + sec)
      sources.push(osc)
    }
  }

  const noise = (at: number, sec: number): void => {
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * sec), ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1800
    band.Q.value = 1.2
    src.connect(band).connect(out)
    src.start(at)
    sources.push(src)
  }

  let t = ctx.currentTime + 0.05
  for (const digit of NUMBER) {
    tone(DTMF[digit] ?? [770, 1336], t, TONE_SEC)
    t += TONE_SEC + GAP_SEC
  }
  tone([ANSWER_HZ], t, ANSWER_SEC)
  t += ANSWER_SEC
  for (let i = 0; i * SLOT_SEC < SCREECH_SEC; i++) {
    const at = t + i * SLOT_SEC
    if (i % 2 === 0) noise(at, SLOT_SEC)
    else tone([i % 4 === 1 ? 1200 : 2400], at, SLOT_SEC)
  }
  t += SCREECH_SEC

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = (): void => {
      if (timer !== null) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }
    const onAbort = (): void => {
      out.gain.cancelScheduledValues(ctx.currentTime)
      out.gain.setValueAtTime(0, ctx.currentTime)
      for (const s of sources) {
        try {
          s.stop()
        } catch {
          // already stopped or never started: nothing left to silence
        }
      }
      out.disconnect()
      finish()
    }
    signal?.addEventListener('abort', onAbort)
    timer = setTimeout(finish, Math.max(0, (t - ctx.currentTime) * 1000) + 100)
  })
}
