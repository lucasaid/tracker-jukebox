import type { MidiSong, ParsedFile, Song, SoundBank } from '../formats'
import { createSequencer } from './sequencer'

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
  _song: Song,
  _sampleRate: number,
  _opts?: Partial<PlayerOptions>,
): Player {
  throw new Error('Not implemented (P9)')
}

/** Throws RangeError if sampleRate <= 0. */
export function createMidiPlayer(
  _song: MidiSong,
  _bank: SoundBank,
  _sampleRate: number,
  _opts?: Partial<PlayerOptions>,
): Player {
  throw new Error('Not implemented (P25)')
}

/** Silent dry-run; never throws. */
export function computeLength(
  song: ParsedFile,
  maxSeconds = 1800,
): { seconds: number; loops: boolean; capped: boolean } {
  if (song.kind === 'midi') throw new Error('Not implemented (P23)')
  const seq = createSequencer(song)
  let seconds = 0
  // One tick lasts 2.5 / tempo seconds (decision 13).
  while (seq.advance()) {
    seconds += 2.5 / seq.state.tempo
    if (seconds >= maxSeconds) return { seconds: maxSeconds, loops: false, capped: true }
  }
  return { seconds, loops: seq.state.loops, capped: false }
}
