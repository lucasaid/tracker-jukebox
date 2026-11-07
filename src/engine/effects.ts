// Per-tick effect handlers with per-format quirks (decision 9).
// ponytail: only the MOD/MTM effect set so far; P11/P12 add the STM/669/S3M quirks.
import { Fx, NOTE_NONE } from '../formats'
import type { Cell, Song } from '../formats'
import { createVoice } from './mixer'
import type { Voice } from './mixer'
import type { PlayerStats } from './index'
import { clampPeriod, periodOf } from './pitch'

export interface Channel {
  voice: Voice
  /** 1-based, 0 = none */
  sample: number
  note: number
  c2spd: number
  /** base period incl. slides, without vibrato/arpeggio */
  period: number
  outPeriod: number
  /** 0..64 */
  vol: number
  outVol: number
  pan: number
  target: number
  portaSpeed: number
  vibSpeed: number
  vibDepth: number
  vibPos: number
  vibWave: number
  tremSpeed: number
  tremDepth: number
  tremPos: number
  tremWave: number
  offset: number
  /** note waiting for a note delay, or -1 */
  pendingNote: number
  triggered: boolean
}

export function createChannel(pan: number, scopeLen: number): Channel {
  return {
    voice: createVoice(scopeLen),
    sample: 0,
    note: NOTE_NONE,
    c2spd: 8363,
    period: 0,
    outPeriod: 0,
    vol: 0,
    outVol: 0,
    pan,
    target: 0,
    portaSpeed: 0,
    vibSpeed: 0,
    vibDepth: 0,
    vibPos: 0,
    vibWave: 0,
    tremSpeed: 0,
    tremDepth: 0,
    tremPos: 0,
    tremWave: 0,
    offset: 0,
    pendingNote: -1,
    triggered: false,
  }
}

/** Waveform value in ±255. Type 3 (random) is played as a sine. */
function wave(type: number, pos: number): number {
  const p = pos & 63
  switch (type & 3) {
    case 1:
      return 255 - (p * 255) / 31.5
    case 2:
      return p < 32 ? 255 : -255
    default:
      return Math.sin((p * Math.PI) / 32) * 255
  }
}

const clampVol = (v: number): number => Math.max(0, Math.min(64, v))

function trigger(ch: Channel, song: Song, note: number, offsetParam: number): void {
  const smp = song.samples[ch.sample - 1]
  if (smp === undefined) return
  const v = ch.voice
  ch.note = note
  ch.triggered = true
  ch.period = periodOf(note, ch.c2spd)
  v.data = smp.data
  v.loopStart = smp.loopStart
  v.loopEnd = smp.loopEnd
  v.pos = offsetParam >= 0 ? ch.offset * 256 : 0
  v.active = v.pos < smp.data.length
  if (ch.vibWave < 4) ch.vibPos = 0
  if (ch.tremWave < 4) ch.tremPos = 0
}

const nibbleFinetune = (p: number): number => 8363 * 2 ** ((p > 7 ? p - 16 : p) / 96)

/** Tick 0 of a row: instrument, note, and the effects that act once. Continuous effects wait for tick 1. */
export function startRow(ch: Channel, cell: Cell, song: Song, stats: PlayerStats): void {
  const { fx, param: p } = cell
  ch.pendingNote = -1
  const smp = cell.ins > 0 ? song.samples[cell.ins - 1] : undefined
  if (smp !== undefined) {
    ch.sample = cell.ins
    ch.c2spd = smp.c2spd
    ch.vol = smp.volume
  }
  if (fx === Fx.SetFinetune) ch.c2spd = nibbleFinetune(p)
  if (fx === Fx.Offset && p > 0) ch.offset = p
  if (cell.note >= 0 && ch.sample > 0) {
    if (fx === Fx.NoteDelay && p > 0) ch.pendingNote = cell.note
    else if ((fx === Fx.TonePorta || fx === Fx.TonePortaVolSlide) && ch.period > 0)
      ch.target = periodOf(cell.note, ch.c2spd)
    else trigger(ch, song, cell.note, fx === Fx.Offset ? p : -1)
  }
  switch (fx) {
    case Fx.SetVolume:
      ch.vol = p
      break
    case Fx.SetPan:
      ch.pan = p / 127.5 - 1
      break
    case Fx.FineVolUp:
      ch.vol = clampVol(ch.vol + p)
      break
    case Fx.FineVolDown:
      ch.vol = clampVol(ch.vol - p)
      break
    case Fx.FinePortaUp:
      ch.period = clampPeriod(ch.period - p, ch.c2spd)
      break
    case Fx.FinePortaDown:
      ch.period = clampPeriod(ch.period + p, ch.c2spd)
      break
    case Fx.TonePorta:
      if (p > 0) ch.portaSpeed = p
      break
    case Fx.Vibrato:
      if (p >> 4) ch.vibSpeed = p >> 4
      if (p & 15) ch.vibDepth = p & 15
      break
    case Fx.Tremolo:
      if (p >> 4) ch.tremSpeed = p >> 4
      if (p & 15) ch.tremDepth = p & 15
      break
    case Fx.VibratoWaveform:
      ch.vibWave = p
      break
    case Fx.TremoloWaveform:
      ch.tremWave = p
      break
    case Fx.NoteCut:
      if (p === 0) ch.vol = 0
      break
    // Handled elsewhere (sequencer, ticks > 0, or above)
    case Fx.None:
    case Fx.Arpeggio:
    case Fx.PortaUp:
    case Fx.PortaDown:
    case Fx.TonePortaVolSlide:
    case Fx.VibratoVolSlide:
    case Fx.Offset:
    case Fx.VolSlide:
    case Fx.PosJump:
    case Fx.PatBreak:
    case Fx.SetSpeed:
    case Fx.SetTempo:
    case Fx.PatLoop:
    case Fx.PatDelay:
    case Fx.NoteDelay:
    case Fx.Retrig:
    case Fx.SetFinetune:
      break
    default:
      stats.unknownFx++
  }
  ch.outPeriod = ch.period
  ch.outVol = ch.vol
}

function volSlide(ch: Channel, p: number): void {
  ch.vol = clampVol(p >> 4 ? ch.vol + (p >> 4) : ch.vol - (p & 15))
}

function tonePorta(ch: Channel): void {
  if (ch.period < ch.target) ch.period = Math.min(ch.period + ch.portaSpeed, ch.target)
  else if (ch.period > ch.target) ch.period = Math.max(ch.period - ch.portaSpeed, ch.target)
}

function vibrato(ch: Channel): number {
  const d = (wave(ch.vibWave, ch.vibPos) * ch.vibDepth) / 128
  ch.vibPos = (ch.vibPos + ch.vibSpeed) & 63
  return d
}

/** Ticks after the first (`t` counts from the row start, including pattern-delay repeats). */
export function runTick(ch: Channel, cell: Cell, t: number, song: Song): void {
  const p = cell.param
  let dPeriod = 0
  let dVol = 0
  let mul = 1
  switch (cell.fx) {
    case Fx.Arpeggio: {
      const r = t % 3
      mul = 2 ** (-(r === 0 ? 0 : r === 1 ? p >> 4 : p & 15) / 12)
      break
    }
    case Fx.PortaUp:
      ch.period = clampPeriod(ch.period - p, ch.c2spd)
      break
    case Fx.PortaDown:
      ch.period = clampPeriod(ch.period + p, ch.c2spd)
      break
    case Fx.TonePorta:
      tonePorta(ch)
      break
    case Fx.TonePortaVolSlide:
      tonePorta(ch)
      volSlide(ch, p)
      break
    case Fx.Vibrato:
      dPeriod = vibrato(ch)
      break
    case Fx.VibratoVolSlide:
      dPeriod = vibrato(ch)
      volSlide(ch, p)
      break
    case Fx.Tremolo:
      dVol = (wave(ch.tremWave, ch.tremPos) * ch.tremDepth) / 64
      ch.tremPos = (ch.tremPos + ch.tremSpeed) & 63
      break
    case Fx.VolSlide:
      volSlide(ch, p)
      break
    case Fx.Retrig:
      if (p > 0 && t % p === 0) {
        ch.voice.pos = 0
        ch.voice.active = ch.voice.data.length > 0
        ch.triggered = true
      }
      break
    case Fx.NoteCut:
      if (t === p) ch.vol = 0
      break
    case Fx.NoteDelay:
      if (t === p && ch.pendingNote >= 0) {
        trigger(ch, song, ch.pendingNote, -1)
        ch.pendingNote = -1
      }
      break
    default:
      break
  }
  ch.outPeriod = ch.period * mul + dPeriod
  ch.outVol = clampVol(ch.vol + dVol)
}
