import { ByteReader } from './bytes'
import { Fx, NOTE_NONE } from './song'
import type { Cell, Pattern, Sample, Song } from './song'

const CHANNELS = 4
const ROWS = 64
const SAMPLES = 31

// Command letters A..L (cmd 1..12) → Fx; anything else is None.
const COMMANDS: readonly Fx[] = [
  Fx.None,
  Fx.SetSpeed,
  Fx.PosJump,
  Fx.PatBreak,
  Fx.VolSlide,
  Fx.PortaDown,
  Fx.PortaUp,
  Fx.TonePorta,
  Fx.Vibrato,
  Fx.Tremor,
  Fx.Arpeggio,
  Fx.VibratoVolSlide,
  Fx.TonePortaVolSlide,
]

function stmParam(fx: Fx, p: number): number {
  if (fx === Fx.SetSpeed) return p >> 4
  if (fx === Fx.PatBreak) return (p >> 4) * 10 + (p & 15)
  return p
}

export function parseStm(bytes: Uint8Array): Song {
  const r = new ByteReader(bytes)
  const title = r.text(20)
  r.seek(31)
  const minor = r.u8()
  const tempo = r.u8()
  const patternCount = r.u8()
  const globalVolume = Math.min(r.u8(), 64)

  r.seek(48)
  const samples: Sample[] = []
  for (let i = 0; i < SAMPLES; i++) {
    const base = 48 + i * 32
    r.seek(base)
    const name = r.text(12)
    r.seek(base + 14)
    const offset = r.u16le() * 16
    const length = r.u16le()
    const loopStart = r.u16le()
    const loopEnd = r.u16le()
    const volume = Math.min(r.u8(), 64)
    r.seek(base + 24)
    const c2spd = r.u16le()
    // Truncated sample data is common in BBS files: subarray clamps to the file.
    const raw =
      offset > 0 && length > 0 ? bytes.subarray(offset, offset + length) : new Uint8Array(0)
    const data = new Float32Array(raw.length)
    for (let k = 0; k < raw.length; k++) data[k] = (((raw[k] as number) << 24) >> 24) / 128
    const end = Math.min(loopEnd, data.length)
    const looped = loopEnd !== 0xffff && end > loopStart
    samples.push({
      name,
      data,
      loopStart: looped ? loopStart : 0,
      loopEnd: looped ? end : 0,
      volume,
      c2spd,
    })
  }

  r.seek(1040)
  const orders: number[] = []
  for (const o of r.bytes(128)) {
    // ponytail: KTULHU lists pattern 42 of 42, so an index past the pattern count ends the list like
    // >= 99 does; a stray bad entry mid-list silently truncates the song, add a warning if one shows up
    if (o >= 99 || o >= patternCount) break
    orders.push(o)
  }

  r.seek(1168)
  const patterns: Pattern[] = []
  for (let p = 0; p < patternCount; p++) {
    const cells: Cell[] = []
    for (let i = 0; i < ROWS * CHANNELS; i++) {
      const b0 = r.u8()
      const b1 = r.u8()
      const b2 = r.u8()
      const b3 = r.u8()
      const ins = b1 >> 3
      const vol = (b1 & 7) | ((b2 & 0xf0) >> 1)
      const cmd = b2 & 15
      const fx = COMMANDS[cmd] ?? Fx.None
      cells.push({
        note: b0 >= 251 ? NOTE_NONE : (b0 >> 4) * 12 + (b0 & 15) + 36,
        ins: ins <= SAMPLES ? ins : 0,
        vol: vol > 64 ? -1 : vol,
        fx,
        param: fx === Fx.None ? 0 : stmParam(fx, b3),
        fxRaw: cmd === 0 ? -1 : cmd,
        paramRaw: b3,
      })
    }
    patterns.push({ rows: ROWS, speed: null, cells })
  }

  return {
    kind: 'tracker',
    format: 'stm',
    title,
    tracker: `Scream Tracker 2.${minor}`,
    message: samples
      .map((s) => s.name)
      .filter((n) => n !== '')
      .join('\n'),
    channels: CHANNELS,
    channelPan: [-1, 1, 1, -1],
    stereo: true,
    initialSpeed: tempo >> 4,
    initialTempo: 125,
    globalVolume,
    mixGain: 1,
    orders,
    patterns,
    samples,
  }
}
