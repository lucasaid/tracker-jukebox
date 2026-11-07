import { ByteReader, ParseError } from './bytes'
import { Fx, NOTE_NONE } from './song'
import type { Cell, Pattern, Sample, Song } from './song'

const CHANNELS = 8
const ROWS = 64

// High nibble 0..5; anything else is None.
const COMMANDS: readonly Fx[] = [
  Fx.PortaUp,
  Fx.PortaDown,
  Fx.TonePorta,
  Fx.FreqAdjust,
  Fx.Vibrato,
  Fx.SetSpeed,
]

export function parse669(bytes: Uint8Array): Song {
  const r = new ByteReader(bytes)
  const lines = [0, 1, 2].map((i) => r.seek(2 + i * 36).text(36))
  r.seek(0x6e)
  const sampleCount = r.u8()
  const patternCount = r.u8()
  r.seek(0x71)
  const orderTable = Array.from(r.bytes(128))
  const tempos = Array.from(r.bytes(128))
  const breaks = Array.from(r.bytes(128))
  const end = orderTable.indexOf(0xff)
  const orders = end < 0 ? orderTable : orderTable.slice(0, end)
  if (orders.some((o) => o >= patternCount)) throw new ParseError('Bad pattern index')

  const heads = Array.from({ length: sampleCount }, () => ({
    name: r.text(13),
    len: r.u32le(),
    loopStart: r.u32le(),
    loopEnd: r.u32le(),
  }))

  const patterns: Pattern[] = []
  for (let p = 0; p < patternCount; p++) {
    const rows = Math.min(breaks[p] ?? 63, 63) + 1
    const cells: Cell[] = []
    for (let row = 0; row < ROWS; row++) {
      for (let ch = 0; ch < CHANNELS; ch++) {
        const b0 = r.u8()
        const b1 = r.u8()
        const b2 = r.u8()
        if (row >= rows) continue
        const cmd = b2 >> 4
        const hasFx = b2 !== 0xff
        const ins = (((b0 & 3) << 4) | (b1 >> 4)) + 1
        cells.push({
          note: b0 < 0xfe ? (b0 >> 2) + 36 : NOTE_NONE,
          ins: b0 < 0xfe && ins <= sampleCount ? ins : 0,
          vol: b0 <= 0xfe ? Math.round(((b1 & 15) * 64) / 15) : -1,
          fx: hasFx ? (COMMANDS[cmd] ?? Fx.None) : Fx.None,
          param: hasFx && cmd < COMMANDS.length ? b2 & 15 : 0,
          fxRaw: hasFx ? cmd : -1,
          paramRaw: hasFx ? b2 & 15 : 0,
        })
      }
    }
    patterns.push({ rows, speed: tempos[p] ?? 4, cells })
  }

  const samples: Sample[] = heads.map((h) => {
    // Truncated sample data is common in BBS files: clamp instead of failing.
    const raw = r.bytes(Math.min(h.len, bytes.length - r.pos))
    const data = new Float32Array(raw.length)
    for (let i = 0; i < raw.length; i++) data[i] = ((raw[i] as number) - 128) / 128
    const loopEnd = Math.min(h.loopEnd, data.length)
    const looped = h.loopEnd <= h.len && loopEnd > h.loopStart
    return {
      name: h.name,
      data,
      loopStart: looped ? h.loopStart : 0,
      loopEnd: looped ? loopEnd : 0,
      volume: 64,
      c2spd: 8363,
    }
  })

  const messageLines = lines.filter((l) => l !== '')
  return {
    kind: 'tracker',
    format: '669',
    title: messageLines[0] ?? '',
    tracker: 'Composer 669',
    message: [...samples.map((s) => s.name).filter((n) => n !== ''), ...messageLines].join('\n'),
    channels: CHANNELS,
    channelPan: Array.from({ length: CHANNELS }, (_, c) => (c % 2 === 0 ? -1 : 1)),
    stereo: true,
    initialSpeed: tempos[0] ?? 4,
    initialTempo: 78,
    globalVolume: 64,
    mixGain: 1,
    orders,
    patterns,
    samples,
  }
}
