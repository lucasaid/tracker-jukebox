import type { MidiTarget, ParseError, ParsedFile, UnsupportedFormatError } from '../formats'
import type { PlayerOptions, PlayerStats, SeekTarget, Snapshot } from '../engine'
import type { LoadError } from '../net'

export class AudioUnsupportedError extends Error {
  readonly name = 'AudioUnsupportedError'
}

export class PlaybackError extends Error {
  readonly name = 'PlaybackError'
  readonly songId: string | null
  constructor(message: string, songId: string | null) {
    super(message)
    this.songId = songId
  }
}

export type SongSource = { id: string; url: string } | { id: string; parsed: ParsedFile }
export interface Loaded {
  id: string
  song: ParsedFile
  durationSec: number
}
export type EngineStatus = 'locked' | 'idle' | 'loading' | 'playing' | 'paused'
export type EngineEvent =
  | { type: 'status'; status: EngineStatus; current: Loaded | null }
  | { type: 'ended'; id: string }
  | { type: 'error'; error: LoadError | ParseError | UnsupportedFormatError | PlaybackError }
  | { type: 'bankProgress'; loaded: number; total: number | null }
  | { type: 'stats'; stats: PlayerStats }

const NOT_YET = 'Not implemented (P13)'

export class AudioEngine {
  constructor(_opts?: { debug?: boolean; soundFontUrl?: string }) {}

  static isSupported(): boolean {
    return typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined'
  }

  get status(): EngineStatus {
    return 'locked'
  }
  get current(): Loaded | null {
    return null
  }
  get context(): AudioContext | null {
    return null
  }
  get analyser(): AnalyserNode | null {
    return null
  }

  unlock(): Promise<void> {
    throw new Error(NOT_YET)
  }
  load(
    _src: SongSource,
    _opts?: { midiTarget?: MidiTarget; fadeSec?: number; seek?: SeekTarget; autoplay?: boolean },
  ): Promise<Loaded> {
    throw new Error(NOT_YET)
  }
  play(): void {
    throw new Error(NOT_YET)
  }
  pause(): void {
    throw new Error(NOT_YET)
  }
  seek(_to: SeekTarget): void {
    throw new Error(NOT_YET)
  }
  setOptions(_o: Partial<PlayerOptions>): void {
    throw new Error(NOT_YET)
  }
  fadeOut(_sec: number): Promise<void> {
    throw new Error('Not implemented (P21)')
  }
  latest(): { snap: Snapshot; song: ParsedFile } | null {
    return null
  }
  on(_listener: (e: EngineEvent) => void): () => void {
    return () => {}
  }
  dispose(): Promise<void> {
    return Promise.resolve()
  }
}
