import { ByteReader, ParseError } from './bytes'
import { Fx, NOTE_CUT, NOTE_NONE } from './song'
import type { Cell, Pattern, Sample, Song } from './song'

const ROWS = 64

// Command letters (cmd 1 = A) → Fx. S (19), X (24) and unknown letters are handled separately.
const COMMANDS: Record<number, Fx> = {
  1: Fx.SetSpeed,
  2: Fx.PosJump,
  3: Fx.PatBreak,
  4: Fx.VolSlide,
  5: Fx.PortaDown,
  6: Fx.PortaUp,
  7: Fx.TonePorta,
  8: Fx.Vibrato,
  9: Fx.Tremor,
  10: Fx.Arpeggio,
  11: Fx.VibratoVolSlide,
  12: Fx.TonePortaVolSlide,
  15: Fx.Offset,
  17: Fx.Retrig,
  18: Fx.Tremolo,
  20: Fx.SetTempo,
  21: Fx.Vibrato, // U: fine vibrato, told apart by fxRaw = 21
  22: Fx.GlobalVolume,
}
const SUBCOMMANDS: Record<number, Fx> = {
  2: Fx.SetFinetune,
  3: Fx.VibratoWaveform,
  4: Fx.TremoloWaveform,
  10: Fx.StereoControl,
  11: Fx.PatLoop,
  12: Fx.NoteCut,
  13: Fx.NoteDelay,
  14: Fx.PatDelay,
}

/** Decision 9: S3M command letter (1 = A) + parameter → Fx. */
function s3mCommand(cmd: number, p: number): { fx: Fx; param: number } {
  if (cmd === 3) return { fx: Fx.PatBreak, param: (p >> 4) * 10 + (p & 15) }
  if (cmd === 24) return { fx: Fx.SetPan, param: Math.min(p * 2, 255) }
  if (cmd === 19) {
    const hi = p >> 4
    if (hi === 8) return { fx: Fx.SetPan, param: (p & 15) * 17 }
    const fx = SUBCOMMANDS[hi]
    return fx === undefined ? { fx: Fx.None, param: 0 } : { fx, param: p & 15 }
  }
  const fx = COMMANDS[cmd]
  return fx === undefined ? { fx: Fx.None, param: 0 } : { fx, param: p }
}

function emptyCell(): Cell {
  return { note: NOTE_NONE, ins: 0, vol: -1, fx: Fx.None, param: 0, fxRaw: -1, paramRaw: 0 }
}

export function parseS3m(bytes: Uint8Array): Song {
  const r = new ByteReader(bytes)
  const title = r.text(28)
  r.seek(0x20)
  const ordNum = r.u16le()
  const insNum = r.u16le()
  const patNum = r.u16le()
  r.seek(0x28)
  const cwt = r.u16le()
  const ffi = r.u16le()
  r.seek(0x30)
  const globalVolume = Math.min(r.u8(), 64)
  const initialSpeed = r.u8()
  const initialTempo = r.u8()
  const master = r.u8()
  r.seek(0x35)
  const hasPanTable = r.u8() === 0xfc
  const settings = Array.from(r.seek(0x40).bytes(32))
  const rawOrders = Array.from(r.seek(0x60).bytes(ordNum))
  const insPointers = Array.from({ length: insNum }, () => r.u16le() * 16)
  const patPointers = Array.from({ length: patNum }, () => r.u16le() * 16)
  const panTable = hasPanTable ? Array.from(r.bytes(32)) : []

  // Enabled channels (setting < 16) are renumbered densely, in order.
  const channelMap: number[] = settings.map(() => -1)
  const channelPan: number[] = []
  settings.forEach((setting, i) => {
    if (setting >= 16) return
    channelMap[i] = channelPan.length
    const entry = panTable[i]
    channelPan.push(
      entry !== undefined && entry & 0x20 ? ((entry & 15) - 7.5) / 7.5 : setting < 8 ? -0.6 : 0.6,
    )
  })
  const channels = channelPan.length
  if (channels === 0) throw new ParseError('No channels')

  const orders: number[] = []
  for (const o of rawOrders) {
    if (o === 0xff) break
    if (o === 0xfe) continue
    if (o >= patNum) throw new ParseError('Bad pattern index')
    orders.push(o)
  }

  const patterns: Pattern[] = patPointers.map((offset) => {
    const cells = Array.from({ length: ROWS * channels }, emptyCell)
    if (offset > 0) {
      r.seek(offset)
      r.u16le() // packed length; rows are self-terminating
      for (let row = 0; row < ROWS; row++) {
        for (let what = r.u8(); what !== 0; what = r.u8()) {
          let note = NOTE_NONE
          let ins = 0
          let vol = -1
          let cmd = 0
          let par = 0
          if (what & 0x20) {
            const n = r.u8()
            note = n === 255 ? NOTE_NONE : n === 254 ? NOTE_CUT : (n >> 4) * 12 + (n & 15)
            ins = r.u8()
          }
          if (what & 0x40) vol = r.u8()
          if (what & 0x80) {
            cmd = r.u8()
            par = r.u8()
          }
          const ch = channelMap[what & 31] ?? -1
          if (ch < 0) continue
          cells[row * channels + ch] = {
            note,
            ins: ins <= insNum ? ins : 0,
            vol: vol > 64 ? -1 : vol,
            ...s3mCommand(cmd, par),
            fxRaw: cmd === 0 ? -1 : cmd,
            paramRaw: par,
          }
        }
      }
    }
    return { rows: ROWS, speed: null, cells }
  })

  const samples: Sample[] = insPointers.map((base) => {
    r.seek(base)
    const type = r.u8()
    r.seek(base + 0x0d)
    const hi = r.u8()
    const offset = (hi * 65536 + r.u16le()) * 16
    const length = r.u32le()
    const loopStart = r.u32le()
    const loopEnd = r.u32le()
    const volume = Math.min(r.u8(), 64)
    r.seek(base + 0x1f)
    const flags = r.u8()
    const c2spd = r.u32le()
    r.seek(base + 0x30)
    const name = r.text(28)

    // Truncated sample data is common in BBS files: subarray clamps to the file.
    // ponytail: mono, add stereo if a file needs it (stereo samples read the left half only)
    const wide = (flags & 4) !== 0
    const raw =
      type === 1 && offset > 0
        ? bytes.subarray(offset, offset + length * (wide ? 2 : 1))
        : new Uint8Array(0)
    const frames = wide ? raw.length >> 1 : raw.length
    const data = new Float32Array(frames)
    const unsigned = ffi === 2
    for (let i = 0; i < frames; i++) {
      if (wide) {
        const v = (raw[2 * i] as number) | ((raw[2 * i + 1] as number) << 8)
        data[i] = unsigned ? (v - 32768) / 32768 : ((v << 16) >> 16) / 32768
      } else {
        const v = raw[i] as number
        data[i] = unsigned ? (v - 128) / 128 : ((v << 24) >> 24) / 128
      }
    }
    const end = Math.min(loopEnd, frames)
    const looped = (flags & 1) !== 0 && end > loopStart
    return {
      name,
      data,
      loopStart: looped ? loopStart : 0,
      loopEnd: looped ? end : 0,
      volume,
      c2spd,
    }
  })

  return {
    kind: 'tracker',
    format: 's3m',
    title,
    tracker: `Scream Tracker ${(cwt >> 8) & 15}.${(cwt & 0xff).toString(16).padStart(2, '0')}`,
    message: samples
      .map((s) => s.name)
      .filter((n) => n !== '')
      .join('\n'),
    channels,
    channelPan,
    stereo: (master & 0x80) !== 0,
    initialSpeed,
    initialTempo,
    globalVolume,
    mixGain: (master & 0x7f) / 127,
    orders,
    patterns,
    samples,
  }
}
