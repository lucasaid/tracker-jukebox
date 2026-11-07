import { ByteReader, UnsupportedFormatError } from './bytes'
import { Fx, NOTE_NONE } from './song'
import type { Cell, Pattern, Sample, Song } from './song'

const ROWS = 64
const SAMPLES = 31

/** ProTracker-style channel count from the signature at 1080, or null if unknown. */
function channelsOf(magic: string): number | null {
  if (magic === 'M.K.' || magic === 'M!K!' || magic === 'FLT4' || magic === '4CHN') return 4
  if (magic === '6CHN') return 6
  if (magic === '8CHN' || magic === 'FLT8') return 8
  const m = /^(\d\d)CH$/.exec(magic)
  const n = m ? Number(m[1]) : 0
  return n >= 10 && n <= 32 ? n : null
}

const NONE = { fx: Fx.None, param: 0 } as const
const SIMPLE: readonly Fx[] = [
  Fx.None, // 0 is handled separately (Arpeggio)
  Fx.PortaUp,
  Fx.PortaDown,
  Fx.TonePorta,
  Fx.Vibrato,
  Fx.TonePortaVolSlide,
  Fx.VibratoVolSlide,
  Fx.Tremolo,
  Fx.SetPan,
  Fx.Offset,
  Fx.VolSlide,
  Fx.PosJump,
]
const EXTENDED: Record<number, Fx> = {
  1: Fx.FinePortaUp,
  2: Fx.FinePortaDown,
  4: Fx.VibratoWaveform,
  5: Fx.SetFinetune,
  6: Fx.PatLoop,
  7: Fx.TremoloWaveform,
  9: Fx.Retrig,
  10: Fx.FineVolUp,
  11: Fx.FineVolDown,
  12: Fx.NoteCut,
  13: Fx.NoteDelay,
  14: Fx.PatDelay,
}

/** Decision 9: MOD/MTM command nibble + parameter → Fx. */
export function modCommand(cmd: number, p: number): { fx: Fx; param: number } {
  const hi = p >> 4
  const lo = p & 15
  if (cmd === 0) return p === 0 ? NONE : { fx: Fx.Arpeggio, param: p }
  if (cmd <= 11) return { fx: SIMPLE[cmd] ?? Fx.None, param: p }
  if (cmd === 12) return { fx: Fx.SetVolume, param: Math.min(p, 64) }
  if (cmd === 13) return { fx: Fx.PatBreak, param: hi * 10 + lo }
  if (cmd === 15) {
    if (p === 0) return NONE
    return { fx: p < 0x20 ? Fx.SetSpeed : Fx.SetTempo, param: p }
  }
  if (cmd === 14) {
    if (hi === 8) return { fx: Fx.SetPan, param: lo * 17 }
    const fx = EXTENDED[hi]
    return fx === undefined ? NONE : { fx, param: lo }
  }
  return NONE
}

/** Amiga period → nearest note, where period(n) = 428 · 2^((48−n)/12). */
function periodToNote(period: number): number {
  if (period === 0) return NOTE_NONE
  return Math.min(119, Math.max(0, Math.round(48 - 12 * Math.log2(period / 428))))
}

export function parseMod(bytes: Uint8Array): Song {
  const r = new ByteReader(bytes)
  const title = r.text(20)
  const heads: { name: string; len: number; ft: number; vol: number; ls: number; ll: number }[] = []
  for (let i = 0; i < SAMPLES; i++) {
    heads.push({
      name: r.text(22),
      len: r.u16be() * 2,
      ft: r.u8() & 15,
      vol: Math.min(r.u8(), 64),
      ls: r.u16be(),
      ll: r.u16be(),
    })
  }
  const songLength = r.u8()
  r.u8() // restart position, unused
  const orderTable = Array.from(r.bytes(128))
  const magic = r.text(4)
  const channels = channelsOf(magic)
  if (channels === null) throw new UnsupportedFormatError('unknown format')

  const patternCount = Math.max(...orderTable) + 1
  const patterns: Pattern[] = []
  for (let p = 0; p < patternCount; p++) {
    const cells: Cell[] = []
    for (let i = 0; i < ROWS * channels; i++) {
      const b0 = r.u8()
      const b1 = r.u8()
      const b2 = r.u8()
      const b3 = r.u8()
      const ins = (b0 & 0xf0) | (b2 >> 4)
      const cmd = b2 & 15
      cells.push({
        note: periodToNote(((b0 & 15) << 8) | b1),
        ins: ins <= SAMPLES ? ins : 0,
        vol: -1,
        ...modCommand(cmd, b3),
        fxRaw: cmd === 0 && b3 === 0 ? -1 : cmd,
        paramRaw: b3,
      })
    }
    patterns.push({ rows: ROWS, speed: null, cells })
  }

  const samples: Sample[] = heads.map((h) => {
    // Truncated sample data is common in BBS files: clamp instead of failing.
    const raw = r.bytes(Math.min(h.len, bytes.length - r.pos))
    const data = new Float32Array(raw.length)
    for (let i = 0; i < raw.length; i++) data[i] = (((raw[i] as number) << 24) >> 24) / 128
    const loopStart = h.ls * 2
    const loopEnd = Math.min((h.ls + h.ll) * 2, data.length)
    const looped = h.ll > 1 && loopEnd > loopStart
    const ft = h.ft > 7 ? h.ft - 16 : h.ft
    return {
      name: h.name,
      data,
      loopStart: looped ? loopStart : 0,
      loopEnd: looped ? loopEnd : 0,
      volume: h.vol,
      c2spd: 8363 * 2 ** (ft / 96),
    }
  })

  return {
    kind: 'tracker',
    format: 'mod',
    title,
    tracker: `ProTracker (${magic})`,
    message: samples
      .map((s) => s.name)
      .filter((n) => n !== '')
      .join('\n'),
    channels,
    channelPan: Array.from({ length: channels }, (_, c) => (c % 4 === 0 || c % 4 === 3 ? -1 : 1)),
    stereo: true,
    initialSpeed: 6,
    initialTempo: 125,
    globalVolume: 64,
    mixGain: 1,
    orders: orderTable.slice(0, songLength),
    patterns,
    samples,
  }
}
