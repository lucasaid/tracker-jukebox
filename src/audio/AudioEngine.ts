import { parseFile } from '../formats'
import type { MidiTarget, ParseError, ParsedFile, UnsupportedFormatError } from '../formats'
import { DEFAULT_PLAYER_OPTIONS, computeLength } from '../engine'
import type { PlayerOptions, PlayerStats, SeekTarget, Snapshot } from '../engine'
import { fetchBytes } from '../net'
import type { LoadError } from '../net'
import type { FromWorklet, ToWorklet } from './protocol'
import { PROCESSOR_NAME } from './protocol'
import workletUrl from './worklet.ts?worker&url'

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

const KEPT_SNAPSHOTS = 32

interface Stamped {
  at: number
  snap: Snapshot
}

const abortError = (): DOMException => new DOMException('Load aborted', 'AbortError')

export class AudioEngine {
  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private analyserNode: AnalyserNode | null = null
  private unlocking: Promise<void> | null = null
  private state: EngineStatus = 'locked'
  private loaded: Loaded | null = null
  /** id of the song the worklet currently holds or is loading; messages for other ids are stale */
  private activeId: string | null = null
  private abort: AbortController | null = null
  private options: PlayerOptions = { ...DEFAULT_PLAYER_OPTIONS }
  private snapshots: Stamped[] = []
  private listeners = new Set<(e: EngineEvent) => void>()
  private waiting: { id: string; ok: () => void; fail: (e: PlaybackError) => void } | null = null
  private readonly debug: boolean

  constructor(opts?: { debug?: boolean; soundFontUrl?: string }) {
    this.debug = opts?.debug ?? false
  }

  static isSupported(): boolean {
    return typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined'
  }

  get status(): EngineStatus {
    return this.state
  }
  get current(): Loaded | null {
    return this.loaded
  }
  get context(): AudioContext | null {
    return this.ctx
  }
  get analyser(): AnalyserNode | null {
    return this.analyserNode
  }

  private emit(e: EngineEvent): void {
    for (const l of this.listeners) l(e)
  }

  private setStatus(status: EngineStatus): void {
    this.state = status
    this.emit({ type: 'status', status, current: this.loaded })
  }

  private send(m: ToWorklet): void {
    this.node?.port.postMessage(m)
  }

  unlock(): Promise<void> {
    this.unlocking ??= this.create().catch((err: unknown) => {
      this.unlocking = null
      throw err instanceof AudioUnsupportedError
        ? err
        : new AudioUnsupportedError(err instanceof Error ? err.message : 'Audio unavailable')
    })
    return this.unlocking.then(() => this.ctx?.resume()).then(() => undefined)
  }

  private async create(): Promise<void> {
    if (!AudioEngine.isSupported()) throw new AudioUnsupportedError('Web Audio is not supported')
    const ctx = new AudioContext()
    this.ctx = ctx
    await ctx.audioWorklet.addModule(workletUrl)
    const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
      numberOfInputs: 0,
      outputChannelCount: [2],
    })
    const gain = ctx.createGain()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    node.connect(gain).connect(analyser).connect(ctx.destination)
    node.port.onmessage = (e: MessageEvent<FromWorklet>) => this.onWorklet(e.data)
    this.node = node
    this.analyserNode = analyser
    if (this.debug) this.send({ type: 'debug', enabled: true })
    this.state = 'idle'
    this.emit({ type: 'status', status: 'idle', current: null })
  }

  private onWorklet(m: FromWorklet): void {
    if (m.id !== this.activeId) return
    switch (m.type) {
      case 'loaded':
        this.waiting?.ok()
        break
      case 'snapshot':
        this.snapshots.push({ at: m.at, snap: m.snap })
        if (this.snapshots.length > KEPT_SNAPSHOTS) this.snapshots.shift()
        break
      case 'ended':
        if (this.state === 'playing') this.setStatus('paused')
        this.emit({ type: 'ended', id: m.id })
        break
      case 'error': {
        const error = new PlaybackError(m.message, m.id)
        if (this.waiting) this.waiting.fail(error)
        else {
          if (this.state === 'playing') this.setStatus('paused')
          this.emit({ type: 'error', error })
        }
        break
      }
      case 'stats':
        this.emit({ type: 'stats', stats: m.stats })
        break
    }
  }

  async load(
    src: SongSource,
    opts?: { midiTarget?: MidiTarget; fadeSec?: number; seek?: SeekTarget; autoplay?: boolean },
  ): Promise<Loaded> {
    if (!this.node) throw new PlaybackError('Audio is locked', src.id)
    this.abort?.abort()
    const abort = new AbortController()
    this.abort = abort
    const stale = (): boolean => abort.signal.aborted
    this.setStatus('loading')
    try {
      let song: ParsedFile
      if ('parsed' in src) song = src.parsed
      else {
        const bytes = await fetchBytes(src.url, { signal: abort.signal })
        if (stale()) throw abortError()
        song = parseFile(bytes, opts?.midiTarget ? { midiTarget: opts.midiTarget } : undefined)
      }
      if (song.kind === 'midi') throw new PlaybackError('MIDI playback not available yet', src.id)
      const durationSec = computeLength(song).seconds
      this.activeId = src.id
      this.snapshots = []
      const ready = new Promise<void>((ok, fail) => {
        this.waiting = { id: src.id, ok, fail }
      })
      this.send({ type: 'load', id: src.id, song, options: this.options, seek: opts?.seek })
      await ready
      this.waiting = null
      if (stale()) throw abortError()
      this.loaded = { id: src.id, song, durationSec }
      this.setStatus('paused')
      if (opts?.autoplay !== false) this.play()
      return this.loaded
    } catch (err) {
      if (stale()) throw err instanceof DOMException ? err : abortError()
      this.waiting = null
      this.setStatus(this.loaded ? 'paused' : 'idle')
      this.emit({
        type: 'error',
        error: err as LoadError | ParseError | UnsupportedFormatError | PlaybackError,
      })
      throw err
    }
  }

  play(): void {
    if (!this.loaded) return
    void this.ctx?.resume()
    this.send({ type: 'play' })
    this.setStatus('playing')
  }
  pause(): void {
    if (!this.loaded) return
    this.send({ type: 'pause' })
    this.setStatus('paused')
  }
  seek(to: SeekTarget): void {
    if (this.loaded) this.send({ type: 'seek', to })
  }
  setOptions(o: Partial<PlayerOptions>): void {
    this.options = { ...this.options, ...o }
    this.send({ type: 'options', options: o })
  }
  fadeOut(_sec: number): Promise<void> {
    throw new Error('Not implemented (P21)')
  }

  latest(): { snap: Snapshot; song: ParsedFile } | null {
    const ctx = this.ctx
    if (!ctx || !this.loaded) return null
    const horizonSec = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0)
    let pick: Stamped | undefined
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      const s = this.snapshots[i]
      if (s && s.at / ctx.sampleRate <= horizonSec) {
        pick = s
        break
      }
    }
    pick ??= this.snapshots[0]
    return pick ? { snap: pick.snap, song: this.loaded.song } : null
  }

  on(listener: (e: EngineEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async dispose(): Promise<void> {
    this.abort?.abort()
    this.listeners.clear()
    this.node?.port.close()
    this.node = null
    this.loaded = null
    const ctx = this.ctx
    this.ctx = null
    await ctx?.close()
  }
}
