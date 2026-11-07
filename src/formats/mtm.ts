import { ByteReader, ParseError } from './bytes'
import { modCommand } from './mod'
import { NOTE_NONE } from './song'
import type { Cell, Pattern, Sample, Song } from './song'

const ROWS = 64
const TRACK_BYTES = ROWS * 3

export function parseMtm(bytes: Uint8Array): Song {
  const r = new ByteReader(bytes)
  const title = r.seek(4).text(20)
  const trackCount = r.u16le()
  const lastPattern = r.u8()
  const lastOrder = r.u8()
  const commentLength = r.u16le()
  const sampleCount = r.u8()
  r.u8() // attribute byte, unused
  r.u8() // beats per track; tracks are always 64 rows here
  const channels = r.u8()
  if (channels === 0 || channels > 32) throw new ParseError('Bad channel count', 33)
  const pans = Array.from(r.bytes(32))

  const heads = Array.from({ length: sampleCount }, () => ({
    name: r.text(22),
    len: r.u32le(),
    loopStart: r.u32le(),
    loopEnd: r.u32le(),
    ft: r.u8() & 15, // MOD-style finetune nibble, signed
    vol: Math.min(r.u8(), 64),
    wide: (r.u8() & 1) !== 0,
  }))

  const orderTable = Array.from(r.bytes(128))
  const orders = orderTable.slice(0, lastOrder + 1)
  if (orders.some((o) => o > lastPattern)) throw new ParseError('Bad pattern index')

  const tracksAt = r.pos
  r.seek(tracksAt + trackCount * TRACK_BYTES)
  const sequence = Array.from({ length: (lastPattern + 1) * 32 }, () => r.u16le())
  const commentLines: string[] = []
  for (let i = 0; i < Math.floor(commentLength / 40); i++) commentLines.push(r.text(40))
  r.seek(r.pos + (commentLength % 40))

  const patterns: Pattern[] = []
  for (let p = 0; p <= lastPattern; p++) {
    const cells: Cell[] = []
    for (let row = 0; row < ROWS; row++) {
      for (let ch = 0; ch < channels; ch++) {
        const track = sequence[p * 32 + ch] ?? 0
        if (track > trackCount) throw new ParseError('Bad track index')
        if (track === 0) {
          cells.push({ note: NOTE_NONE, ins: 0, vol: -1, fx: 0, param: 0, fxRaw: -1, paramRaw: 0 })
          continue
        }
        const at = tracksAt + (track - 1) * TRACK_BYTES + row * 3
        const b0 = bytes[at] as number
        const b1 = bytes[at + 1] as number
        const b2 = bytes[at + 2] as number
        const ins = ((b0 & 3) << 4) | (b1 >> 4)
        const cmd = b1 & 15
        cells.push({
          note: b0 >> 2 === 0 ? NOTE_NONE : (b0 >> 2) + 24,
          ins: ins <= sampleCount ? ins : 0,
          vol: -1,
          ...modCommand(cmd, b2),
          fxRaw: cmd === 0 && b2 === 0 ? -1 : cmd,
          paramRaw: b2,
        })
      }
    }
    patterns.push({ rows: ROWS, speed: null, cells })
  }

  const samples: Sample[] = heads.map((h) => {
    // Always consume the stored bytes so later samples stay aligned; truncated data is clamped.
    const raw = r.bytes(Math.min(h.len, bytes.length - r.pos))
    // 16-bit samples are not supported: zero-length, name kept.
    const data = new Float32Array(h.wide ? 0 : raw.length)
    for (let i = 0; i < data.length; i++) data[i] = ((raw[i] as number) - 128) / 128
    const end = Math.min(h.loopEnd, data.length)
    const looped = end > h.loopStart
    const ft = h.ft > 7 ? h.ft - 16 : h.ft
    return {
      name: h.name,
      data,
      loopStart: looped ? h.loopStart : 0,
      loopEnd: looped ? end : 0,
      volume: h.vol,
      c2spd: 8363 * 2 ** (ft / 96),
    }
  })

  return {
    kind: 'tracker',
    format: 'mtm',
    title,
    tracker: 'MultiTracker 1.0',
    message: [...samples.map((s) => s.name), ...commentLines].filter((l) => l !== '').join('\n'),
    channels,
    channelPan: pans.slice(0, channels).map((p) => ((p & 15) - 7.5) / 7.5),
    stereo: true,
    initialSpeed: 6,
    initialTempo: 125,
    globalVolume: 64,
    mixGain: 1,
    orders,
    patterns,
    samples,
  }
}
