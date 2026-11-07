// Per-tick effect handlers with per-format quirks (decision 9).
import { Fx, NOTE_CUT, NOTE_NONE } from '../formats'
import type { Cell, Song } from '../formats'
import { createVoice } from './mixer'
import type { Voice } from './mixer'
import type { PlayerStats } from './index'
import { clampPeriod, periodOf, periodUnit } from './pitch'

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
  /** S3M shared parameter memory for D E F I J K L Q */
  mem: number
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
    mem: 0,
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
  ch.period = periodOf(note, ch.c2spd, song.format)
  v.data = smp.data
  v.loopStart = smp.loopStart
  v.loopEnd = smp.loopEnd
  v.pos = offsetParam >= 0 ? ch.offset * 256 : 0
  v.active = v.pos < smp.data.length
  if (ch.vibWave < 4) ch.vibPos = 0
  if (ch.tremWave < 4) ch.tremPos = 0
}

const S3M_FINETUNE = [
  7895, 7941, 7985, 8046, 8107, 8169, 8232, 8280, 8363, 8413, 8463, 8529, 8581, 8651, 8723, 8757,
]
const finetuneHz = (p: number, song: Song): number =>
  song.format === 's3m' ? (S3M_FINETUNE[p & 15] as number) : nibbleFinetune(p)

/** Commands that reuse the channel's last non-zero parameter in S3M. */
const MEM_FX = new Set<number>([
  Fx.VolSlide,
  Fx.PortaUp,
  Fx.PortaDown,
  Fx.Arpeggio,
  Fx.VibratoVolSlide,
  Fx.TonePortaVolSlide,
  Fx.Retrig,
  Fx.Tremor,
])
const usesMem = (cell: Cell, song: Song): boolean => song.format === 's3m' && MEM_FX.has(cell.fx)

/** S3M D/K/L: DxF and DFx are fine (tick 0 only), the rest slide on ticks > 0. */
function s3mVolSlide(ch: Channel, p: number, tick0: boolean): void {
  const x = p >> 4
  const y = p & 15
  const fine = (y === 15 && x !== 0) || (x === 15 && y !== 0)
  if (fine !== tick0) return
  if (fine) ch.vol = clampVol(y === 15 ? ch.vol + x : ch.vol - y)
  else if (y === 0) ch.vol = clampVol(ch.vol + x)
  else if (x === 0) ch.vol = clampVol(ch.vol - y)
}

/** S3M E/F: Fx fine and Ex extra-fine (tick 0), the rest slide on ticks > 0. Up lowers the period. */
function s3mPorta(ch: Channel, up: boolean, p: number, tick0: boolean, song: Song): void {
  const hi = p >> 4
  let amount: number
  if (hi === 15) amount = tick0 ? (p & 15) * 4 : 0
  else if (hi === 14) amount = tick0 ? p & 15 : 0
  else amount = tick0 ? 0 : p * 4
  ch.period = clampPeriod(ch.period + (up ? -amount : amount), ch.c2spd, song.format)
}

/** S3M Qxy: volume change x on every y-th tick. */
function retrigVol(vol: number, x: number): number {
  if (x === 6) return clampVol(Math.floor((vol * 2) / 3))
  if (x === 7) return clampVol(vol >> 1)
  if (x === 14) return clampVol(Math.floor((vol * 3) / 2))
  if (x === 15) return clampVol(vol * 2)
  if (x === 0 || x === 8) return vol
  return clampVol(x < 8 ? vol - (1 << (x - 1)) : vol + (1 << (x - 9)))
}

const nibbleFinetune = (p: number): number => 8363 * 2 ** ((p > 7 ? p - 16 : p) / 96)

/** Tick 0 of a row: instrument, note, and the effects that act once. Continuous effects wait for tick 1. */
export function startRow(ch: Channel, cell: Cell, song: Song, stats: PlayerStats): void {
  const fx = cell.fx
  const s3m = song.format === 's3m'
  if (usesMem(cell, song) && cell.param !== 0) ch.mem = cell.param
  const p = usesMem(cell, song) ? ch.mem : cell.param
  ch.pendingNote = -1
  const smp = cell.ins > 0 ? song.samples[cell.ins - 1] : undefined
  if (smp !== undefined) {
    ch.sample = cell.ins
    ch.c2spd = smp.c2spd
    ch.vol = smp.volume
  }
  const unit = periodUnit(song.format)
  if (fx === Fx.SetFinetune) ch.c2spd = finetuneHz(p, song)
  if (fx === Fx.Offset && p > 0) ch.offset = p
  if (cell.note >= 0 && ch.sample > 0) {
    if (fx === Fx.NoteDelay && p > 0) ch.pendingNote = cell.note
    else if ((fx === Fx.TonePorta || fx === Fx.TonePortaVolSlide) && ch.period > 0)
      ch.target = periodOf(cell.note, ch.c2spd, song.format)
    else trigger(ch, song, cell.note, fx === Fx.Offset ? p : -1)
  }
  if (cell.note === NOTE_CUT) ch.voice.active = false
  if (cell.vol >= 0) ch.vol = cell.vol
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
      ch.period = clampPeriod(ch.period - p * unit, ch.c2spd, song.format)
      break
    case Fx.FinePortaDown:
      ch.period = clampPeriod(ch.period + p * unit, ch.c2spd, song.format)
      break
    case Fx.PortaUp:
    case Fx.PortaDown:
      if (s3m) s3mPorta(ch, fx === Fx.PortaUp, p, true, song)
      break
    case Fx.VolSlide:
    case Fx.VibratoVolSlide:
    case Fx.TonePortaVolSlide:
      if (s3m) s3mVolSlide(ch, p, true)
      break
    case Fx.FreqAdjust:
      // 669: raises the period once, on tick 0
      ch.period = clampPeriod(ch.period + p * unit, ch.c2spd, song.format)
      break
    case Fx.TonePorta:
      if (p > 0) ch.portaSpeed = p * unit
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
    case Fx.Offset:
    case Fx.PosJump:
    case Fx.PatBreak:
    case Fx.SetSpeed:
    case Fx.SetTempo:
    case Fx.PatLoop:
    case Fx.PatDelay:
    case Fx.NoteDelay:
    case Fx.Retrig:
    case Fx.SetFinetune:
    case Fx.Tremor:
    case Fx.GlobalVolume: // sequencer
      break
    // ponytail: S3M SAy is not emulated, add if a file needs it
    case Fx.StereoControl:
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

const slideVol = (ch: Channel, p: number, s3m: boolean): void =>
  s3m ? s3mVolSlide(ch, p, false) : volSlide(ch, p)

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
  const p = usesMem(cell, song) ? ch.mem : cell.param
  const s3m = song.format === 's3m'
  const unit = periodUnit(song.format)
  let dPeriod = 0
  let dVol = 0
  let mul = 1
  let mute = false
  switch (cell.fx) {
    case Fx.Arpeggio: {
      const r = t % 3
      mul = 2 ** (-(r === 0 ? 0 : r === 1 ? p >> 4 : p & 15) / 12)
      break
    }
    case Fx.PortaUp:
    case Fx.PortaDown:
      if (s3m) s3mPorta(ch, cell.fx === Fx.PortaUp, p, false, song)
      else
        ch.period = clampPeriod(
          ch.period + (cell.fx === Fx.PortaUp ? -p : p) * unit,
          ch.c2spd,
          song.format,
        )
      break
    case Fx.TonePorta:
      tonePorta(ch)
      break
    case Fx.TonePortaVolSlide:
      tonePorta(ch)
      slideVol(ch, p, s3m)
      break
    case Fx.Vibrato:
      dPeriod = (vibrato(ch) * unit) / (cell.fxRaw === 21 ? 4 : 1) // S3M U is fine vibrato
      break
    case Fx.VibratoVolSlide:
      dPeriod = vibrato(ch) * unit
      slideVol(ch, p, s3m)
      break
    case Fx.Tremor: {
      // ponytail: on/off counted from the row start (ST3 keeps the counter across rows)
      const on = (p >> 4) + 1
      if (t % (on + (p & 15) + 1) >= on) mute = true
      break
    }
    case Fx.Tremolo:
      dVol = (wave(ch.tremWave, ch.tremPos) * ch.tremDepth) / 64
      ch.tremPos = (ch.tremPos + ch.tremSpeed) & 63
      break
    case Fx.VolSlide:
      slideVol(ch, p, s3m)
      break
    case Fx.Retrig:
      if (s3m) {
        if ((p & 15) > 0 && t % (p & 15) === 0) {
          ch.vol = retrigVol(ch.vol, p >> 4)
          ch.voice.pos = 0
          ch.voice.active = ch.voice.data.length > 0
          ch.triggered = true
        }
      } else if (p > 0 && t % p === 0) {
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
  ch.outVol = mute ? 0 : clampVol(ch.vol + dVol)
}
