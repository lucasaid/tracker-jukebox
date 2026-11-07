import { ByteReader, ParseError, UnsupportedFormatError, decodeCp437 } from './bytes'
import type { MidiEvent, MidiSong, MidiTarget } from './song'

/** Standard MIDI File, format 0 or 1 (decision 44). */
export function parseMidi(bytes: Uint8Array, target: MidiTarget): MidiSong {
  const r = new ByteReader(bytes)
  if (r.u32be() !== 0x4d546864) throw new ParseError('Bad MIDI header', 0)
  const headerLen = r.u32be()
  const smfFormat = r.u16be()
  const trackCount = r.u16be()
  const division = r.u16be()
  if (smfFormat > 1) throw new UnsupportedFormatError('SMF format 2')
  if (division & 0x8000) throw new UnsupportedFormatError('SMPTE timing')
  if (division === 0) throw new ParseError('Bad MIDI division', 12)
  r.seek(8 + headerLen)

  const events: MidiEvent[] = []
  const tempos: { tick: number; usPerBeat: number }[] = []
  const texts: string[] = []
  let nameInTrack0 = ''
  let firstText = ''

  for (let t = 0; t < trackCount && r.pos < r.length; t++) {
    const id = r.u32be()
    const len = r.u32be()
    // Truncated last chunks are common in BBS files: clamp instead of failing.
    const body = r.bytes(Math.min(len, r.length - r.pos))
    if (id !== 0x4d54726b) continue // unknown chunk: skip
    const tr = new ByteReader(body)
    let tick = 0
    let status = 0
    const vlq = (): number => {
      let v = 0
      for (let i = 0; i < 4; i++) {
        const b = tr.u8()
        v = (v << 7) | (b & 0x7f)
        if (!(b & 0x80)) return v
      }
      throw new ParseError('Bad variable-length quantity', tr.pos)
    }
    while (tr.pos < tr.length) {
      tick += vlq()
      let b = tr.u8()
      if (b < 0x80) {
        if (status < 0x80) throw new ParseError('Bad running status', tr.pos)
        tr.pos-- // data byte belongs to the running status
        b = status
      } else if (b < 0xf0) status = b
      if (b === 0xff) {
        const type = tr.u8()
        const data = tr.bytes(vlq())
        if (type === 0x2f) break
        if (type === 0x51 && data.length === 3)
          tempos.push({
            tick,
            usPerBeat:
              ((data[0] as number) << 16) | ((data[1] as number) << 8) | (data[2] as number),
          })
        else if (type >= 1 && type <= 3) {
          const s = decodeCp437(data)
          texts.push(s)
          if (type === 3 && t === 0 && nameInTrack0 === '') nameInTrack0 = s
          if (type === 1 && firstText === '') firstText = s
        }
      } else if (b === 0xf0 || b === 0xf7) {
        tr.bytes(vlq())
      } else if (b >= 0xf1) {
        throw new ParseError('Bad MIDI status byte', tr.pos)
      } else {
        const ch = b & 0x0f
        const kind = b >> 4
        const d1 = tr.u8()
        const d2 = kind === 0xc || kind === 0xd ? 0 : tr.u8()
        if (kind === 0x9 && d2 > 0) events.push({ tick, ch, type: 'noteOn', key: d1, vel: d2 })
        else if (kind === 0x8 || kind === 0x9) events.push({ tick, ch, type: 'noteOff', key: d1 })
        else if (kind === 0xb) events.push({ tick, ch, type: 'cc', cc: d1, value: d2 })
        else if (kind === 0xc) events.push({ tick, ch, type: 'program', program: d1 })
        else if (kind === 0xe)
          events.push({ tick, ch, type: 'pitchBend', value: (d1 | (d2 << 7)) - 8192 })
        // 0xA polyphonic and 0xD channel aftertouch are dropped
      }
    }
  }

  // Array.sort is stable, so equal ticks keep track order.
  events.sort((a, b) => a.tick - b.tick)
  tempos.sort((a, b) => a.tick - b.tick)
  const tempoMap = tempos[0]?.tick === 0 ? tempos : [{ tick: 0, usPerBeat: 500000 }, ...tempos]
  const used = new Set<number>()
  for (const e of events) if (e.type === 'noteOn') used.add(e.ch)

  return {
    kind: 'midi',
    format: 'midi',
    title: nameInTrack0 || firstText,
    tracker: `Standard MIDI File (type ${smfFormat})`,
    message: texts.join('\n'),
    ticksPerBeat: division,
    tempoMap,
    events,
    channelsUsed: [...used].sort((a, b) => a - b),
    target,
  }
}
