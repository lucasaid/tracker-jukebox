import type { MidiSong, ParsedFile, Song, SoundBank } from '../formats'
import { NOTE_NONE } from '../formats'
import { createChannel, runTick, startRow } from './effects'
import { FORMAT_GAIN, finishMix, mixVoice, skipVoice } from './mixer'
import { createMidiSynth, ticksToSeconds } from './midi-synth'
import { periodToHz } from './pitch'
import { createSequencer } from './sequencer'

export { ticksToSeconds } from './midi-synth'
export { createBeatDetector } from './beat'

export type Interpolation = 'nearest' | 'linear' | 'cubic'

export interface PlayerOptions {
  interpolation: Interpolation
  /** 0..1; 1 = pan as stored (authentic), 0 = mono */
  stereoSeparation: number
  /** bit n set = channel n muted (tracker: song channel; MIDI: MIDI channel) */
  muteMask: number
}

export const DEFAULT_PLAYER_OPTIONS: PlayerOptions = {
  interpolation: 'nearest',
  stereoSeparation: 1,
  muteMask: 0,
}
export const SCOPE_LEN = 256

export interface ChannelState {
  active: boolean
  note: number
  ins: number
  /** 0..1 effective */
  volume: number
  /** -1..1 */
  pan: number
  /** a note started since the previous snapshot() */
  triggered: boolean
}

export type Position =
  | {
      kind: 'tracker'
      order: number
      pattern: number
      row: number
      tick: number
      speed: number
      tempo: number
    }
  | { kind: 'midi'; tick: number; tempo: number }
  | { kind: 'stream' }

export interface Snapshot {
  frame: number
  seconds: number
  pos: Position
  ch: ChannelState[]
  /** one per ch entry, SCOPE_LEN mono post-volume samples, oldest first */
  scopes: Float32Array[]
}

export interface PlayerStats {
  unknownFx: number
  voices: number
}

export type SeekTarget = { order: number } | { seconds: number }

export interface Player {
  readonly sampleRate: number
  readonly ended: boolean
  readonly stats: PlayerStats
  /** Fills left/right[0..frames). Returns frames of real audio; zeros after the end. Never throws. */
  render(left: Float32Array, right: Float32Array, frames: number): number
  seek(to: SeekTarget): void
  setOptions(o: Partial<PlayerOptions>): void
  /** Preallocated objects, overwritten by the next call. Resets ChannelState.triggered. */
  snapshot(): Snapshot
}

/** Throws RangeError if sampleRate <= 0. */
export function createTrackerPlayer(
  song: Song,
  sampleRate: number,
  opts: Partial<PlayerOptions> = {},
): Player {
  if (!(sampleRate > 0)) throw new RangeError('sampleRate must be > 0')
  let options: PlayerOptions = { ...DEFAULT_PLAYER_OPTIONS, ...opts }
  const n = song.channels
  const newChannels = () => song.channelPan.map((pan) => createChannel(pan, SCOPE_LEN))
  let chans = newChannels()
  let seq = createSequencer(song)
  const stats: PlayerStats = { unknownFx: 0, voices: 0 }
  let ended = false
  let frame = 0
  /** frames left in the current tick; may dip below 0 so fractional ticks average out */
  let tickLeft = 0
  let tickFrames = 0
  const scale = (song.mixGain * FORMAT_GAIN[song.format]) / Math.sqrt(n)

  /** Advances one tick and updates every channel. False at the end of the song. */
  const tick = (): boolean => {
    if (!seq.advance()) return false
    const s = seq.state
    const cells = song.patterns[s.pattern]?.cells
    const rowStart = s.tick === 0 && s.repeat === 0
    const t = s.tick + s.repeat * s.speed
    for (let c = 0; c < n; c++) {
      const ch = chans[c]
      const cell = cells?.[s.row * n + c]
      if (ch === undefined || cell === undefined) continue
      if (rowStart) startRow(ch, cell, song, stats)
      else runTick(ch, cell, t, song)
      ch.voice.step = periodToHz(ch.outPeriod, song.format) / sampleRate
    }
    tickFrames = Math.floor((sampleRate * 2.5) / s.tempo)
    return true
  }

  const mix = (left: Float32Array, right: Float32Array, start: number, count: number): void => {
    const globalGain = seq.state.globalVolume / 64
    for (let c = 0; c < n; c++) {
      const ch = chans[c]
      if (ch === undefined) continue
      const pan = song.stereo ? ch.pan * options.stereoSeparation : 0
      const vol = options.muteMask & (1 << c) ? 0 : (ch.outVol / 64) * globalGain
      const gl = ((1 - pan) / 2) * vol
      const gr = ((1 + pan) / 2) * vol
      mixVoice(ch.voice, left, right, start, count, options.interpolation, gl, gr)
    }
  }

  /** Silently plays ticks until `stop` says the tick just processed is where playback resumes. */
  const fastForward = (stop: () => boolean): void => {
    let framePos = 0
    while (tick()) {
      if (stop()) {
        tickLeft = tickFrames
        break
      }
      framePos += tickFrames
      for (const ch of chans) skipVoice(ch.voice, tickFrames)
    }
    frame = Math.floor(framePos)
    ended = seq.state.ended
  }

  const pos: Extract<Position, { kind: 'tracker' }> = {
    kind: 'tracker',
    order: 0,
    pattern: 0,
    row: 0,
    tick: 0,
    speed: song.initialSpeed,
    tempo: song.initialTempo,
  }
  const snap: Snapshot = {
    frame: 0,
    seconds: 0,
    pos,
    ch: chans.map(() => ({
      active: false,
      note: NOTE_NONE,
      ins: 0,
      volume: 0,
      pan: 0,
      triggered: false,
    })),
    scopes: chans.map(() => new Float32Array(SCOPE_LEN)),
  }

  return {
    sampleRate,
    get ended() {
      return ended
    },
    stats,
    render(left, right, frames) {
      left.fill(0, 0, frames)
      right.fill(0, 0, frames)
      let done = 0
      while (done < frames && !ended) {
        if (tickLeft <= 0) {
          if (!tick()) {
            ended = true
            break
          }
          tickLeft += tickFrames
        }
        const count = Math.min(frames - done, Math.ceil(tickLeft))
        mix(left, right, done, count)
        tickLeft -= count
        done += count
      }
      finishMix(left, right, done, scale)
      frame += done
      stats.voices = 0
      for (const ch of chans) if (ch.voice.active) stats.voices++
      return done
    },
    seek(to) {
      chans = newChannels()
      seq = createSequencer(song)
      stats.unknownFx = 0
      ended = false
      tickLeft = 0
      if ('order' in to) {
        const target = Math.max(0, Math.min(to.order, song.orders.length - 1))
        fastForward(() => seq.state.order >= target && seq.state.tick === 0)
      } else {
        const target = Math.max(0, to.seconds) * sampleRate
        let framePos = 0
        fastForward(() => {
          framePos += tickFrames
          return framePos > target
        })
      }
    },
    setOptions(o) {
      options = { ...options, ...o }
    },
    snapshot() {
      const s = seq.state
      snap.frame = frame
      snap.seconds = frame / sampleRate
      pos.order = s.order
      pos.pattern = s.pattern
      pos.row = s.row
      pos.tick = s.tick
      pos.speed = s.speed
      pos.tempo = s.tempo
      for (let c = 0; c < n; c++) {
        const ch = chans[c]
        const out = snap.ch[c]
        const scope = snap.scopes[c]
        if (ch === undefined || out === undefined || scope === undefined) continue
        out.active = ch.voice.active
        out.note = ch.note
        out.ins = ch.sample
        out.volume = (ch.outVol / 64) * (s.globalVolume / 64)
        out.pan = ch.pan
        out.triggered = ch.triggered
        ch.triggered = false
        for (let k = 0; k < SCOPE_LEN; k++)
          scope[k] = ch.voice.scope[(ch.voice.scopeAt + k) & (SCOPE_LEN - 1)] as number
      }
      return snap
    },
  }
}

/** Throws RangeError if sampleRate <= 0. */
export function createMidiPlayer(
  song: MidiSong,
  bank: SoundBank,
  sampleRate: number,
  opts: Partial<PlayerOptions> = {},
): Player {
  if (!(sampleRate > 0)) throw new RangeError('sampleRate must be > 0')
  return createMidiSynth(song, bank, sampleRate, { ...DEFAULT_PLAYER_OPTIONS, ...opts }, SCOPE_LEN)
}

/** Silent dry-run; never throws. */
export function computeLength(
  song: ParsedFile,
  maxSeconds = 1800,
): { seconds: number; loops: boolean; capped: boolean } {
  if (song.kind === 'stream') return { seconds: song.durationSec, loops: false, capped: false }
  if (song.kind === 'midi') {
    const last = song.events[song.events.length - 1]
    const seconds = ticksToSeconds(song, last?.tick ?? 0) + 1
    return seconds >= maxSeconds
      ? { seconds: maxSeconds, loops: false, capped: true }
      : { seconds, loops: false, capped: false }
  }
  const seq = createSequencer(song)
  let seconds = 0
  // One tick lasts 2.5 / tempo seconds (decision 13).
  while (seq.advance()) {
    seconds += 2.5 / seq.state.tempo
    if (seconds >= maxSeconds) return { seconds: maxSeconds, loops: false, capped: true }
  }
  return { seconds, loops: seq.state.loops, capped: false }
}
