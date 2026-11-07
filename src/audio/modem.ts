// Synthesized modem handshake (decision 41), modelled on the real stages of a V.32-style call:
// DTMF dialling, a pause, the 2100 Hz answer tone with its phase reversal, V.21 FSK warble at
// 300 baud, a short scrambled-ones burst, then the long PSK/QAM "training hiss". Everything is
// band-limited to the 300-3400 Hz telephone channel. Rendered to one buffer, so it needs no node graph.
const DTMF: Record<string, readonly [number, number]> = {
  '1': [697, 1209],
  '3': [697, 1477],
  '5': [770, 1336],
  '9': [852, 1477],
}
const NUMBER = '5551993'
const TONE_SEC = 0.08
const GAP_SEC = 0.05
const LEVEL = 0.35
const TAU = Math.PI * 2

/** Deterministic noise, so the intro is the same every call. */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Second-order filter in place (RBJ cookbook, Q = 0.707). */
function biquad(x: Float32Array, type: 'high' | 'low', hz: number, rate: number): void {
  const w = (TAU * hz) / rate
  const alpha = Math.sin(w) / (2 * 0.707)
  const c = Math.cos(w)
  const hp = type === 'high'
  const b0 = hp ? (1 + c) / 2 : (1 - c) / 2
  const b1 = hp ? -(1 + c) : 1 - c
  const a0 = 1 + alpha
  const a1 = -2 * c
  const a2 = 1 - alpha
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < x.length; i++) {
    const xi = x[i] as number
    const y = (b0 * xi + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1
    x1 = xi
    y2 = y1
    y1 = y
    x[i] = y
  }
}

/** The whole intro as mono samples in [-1, 1], about 4.7 s long. */
export function renderModemIntro(rate: number): Float32Array<ArrayBuffer> {
  const rand = rng(1993)
  const out = new Float32Array(Math.ceil(rate * 4.8))
  const at = (sec: number): number => Math.round(sec * rate)
  /** Raised-edge window so segments start and stop without clicks. */
  const edge = (i: number, n: number, ramp = at(0.006)): number =>
    Math.min(1, i / ramp, (n - i) / ramp)

  let t = 0.04
  // 1. DTMF: 7 digits.
  for (const digit of NUMBER) {
    const [lo, hi] = DTMF[digit] ?? [770, 1336]
    const n = at(TONE_SEC)
    for (let i = 0; i < n; i++) {
      const s = Math.sin((TAU * lo * i) / rate) + Math.sin((TAU * hi * i) / rate)
      out[at(t) + i] = (s / 2) * edge(i, n) * 0.8
    }
    t += TONE_SEC + GAP_SEC
  }

  // 2. Line settles, then 3. the answer tone: 2100 Hz, 180 degree phase reversal every 450 ms.
  t += 0.3
  const ansN = at(0.8)
  for (let i = 0; i < ansN; i++) {
    const flip = Math.floor(i / at(0.45)) % 2 === 0 ? 1 : -1
    out[at(t) + i] = Math.sin((TAU * 2100 * i) / rate) * flip * edge(i, ansN) * 0.7
  }
  t += 0.8 + 0.15

  // 4. V.21 FSK at 300 baud: the originating (980/1180 Hz) and answering (1650/1850 Hz) sides at once.
  const fskN = at(0.6)
  const baud = at(1 / 300)
  let bitO = 0
  let bitA = 0
  let phaseO = 0
  let phaseA = 0
  for (let i = 0; i < fskN; i++) {
    if (i % baud === 0) {
      bitO = rand() < 0.5 ? 0 : 1
      bitA = rand() < 0.5 ? 0 : 1
    }
    phaseO += (TAU * (bitO ? 980 : 1180)) / rate
    phaseA += (TAU * (bitA ? 1650 : 1850)) / rate
    out[at(t) + i] = (Math.sin(phaseO) * 0.5 + Math.sin(phaseA) * 0.4) * edge(i, fskN)
  }
  t += 0.6 + 0.12

  // 5 + 6. Carrier training: random phase symbols on a carrier. A slow stage (1200 baud on 2400 Hz,
  // like a V.22 answerer), then the fast 2400 baud stage on 1800 Hz that gives the long hiss.
  const train = (
    startSec: number,
    sec: number,
    carrier: number,
    symbolRate: number,
    level: number,
  ): void => {
    const n = at(sec)
    const sym = rate / symbolRate
    let iPrev = 1
    let qPrev = 0
    let iNext = 1
    let qNext = 0
    for (let i = 0; i < n; i++) {
      const k = i / sym
      const frac = k - Math.floor(k)
      if (frac < 1 / sym || i === 0) {
        iPrev = iNext
        qPrev = qNext
        const ph = Math.floor(rand() * 8) * (TAU / 8) // 8-PSK
        iNext = Math.cos(ph)
        qNext = Math.sin(ph)
      }
      // smooth the symbol transition (raised cosine) so the spectrum stays inside the line band
      const m = (1 - Math.cos(Math.PI * Math.min(1, frac * 1.6))) / 2
      const ii = iPrev + (iNext - iPrev) * m
      const qq = qPrev + (qNext - qPrev) * m
      const w = (TAU * carrier * i) / rate
      out[at(startSec) + i] = (ii * Math.cos(w) - qq * Math.sin(w)) * level * edge(i, n, at(0.03))
    }
  }
  train(t, 0.55, 2400, 1200, 0.45)
  t += 0.55
  train(t, 1.25, 1800, 2400, 0.55)

  // The phone line: 300 Hz to 3.4 kHz, plus a little hiss.
  biquad(out, 'high', 300, rate)
  biquad(out, 'high', 300, rate)
  biquad(out, 'low', 3400, rate)
  biquad(out, 'low', 3400, rate)
  let peak = 0
  for (let i = 0; i < out.length; i++) {
    out[i] = (out[i] as number) + (rand() * 2 - 1) * 0.004
    peak = Math.max(peak, Math.abs(out[i] as number))
  }
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] = ((out[i] as number) / peak) * LEVEL
  return out
}

/** About 4.8s synthesized handshake through ctx.destination. Resolves when finished or aborted; never rejects. */
export function playModemIntro(ctx: AudioContext, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  const samples = renderModemIntro(ctx.sampleRate)
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate)
  buffer.copyToChannel(samples, 0)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(ctx.destination)
  return new Promise((resolve) => {
    const finish = (): void => {
      signal?.removeEventListener('abort', onAbort)
      src.disconnect()
      resolve()
    }
    const onAbort = (): void => {
      src.onended = null
      try {
        src.stop()
      } catch {
        // never started, or already stopped: it is silent either way
      }
      finish()
    }
    src.onended = finish
    signal?.addEventListener('abort', onAbort)
    src.start()
  })
}
