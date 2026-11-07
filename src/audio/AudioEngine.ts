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

/** One worklet node and its gain. Messages are matched against this deck's own song id. */
interface Deck {
  node: AudioWorkletNode
  gain: GainNode
  /** id of the song this deck holds or is loading; messages for other ids are stale */
  activeId: string | null
  loaded: Loaded | null
  snapshots: Stamped[]
  lastPick: Stamped | null
  waiting: { id: string; ok: () => void; fail: (e: Error) => void } | null
}

const abortError = (): DOMException => new DOMException('Load aborted', 'AbortError')

export class AudioEngine {
  private ctx: AudioContext | null = null
  private decks: Deck[] = []
  /** index of the deck that is audible and that play/pause/seek/latest act on */
  private front = 0
  private analyserNode: AnalyserNode | null = null
  private unlocking: Promise<void> | null = null
  private state: EngineStatus = 'locked'
  private abort: AbortController | null = null
  private options: PlayerOptions = { ...DEFAULT_PLAYER_OPTIONS }
  private listeners = new Set<(e: EngineEvent) => void>()
  private fadeTimer: ReturnType<typeof setTimeout> | null = null
  private readonly debug: boolean

  constructor(opts?: { debug?: boolean; soundFontUrl?: string }) {
    this.debug = opts?.debug ?? false
  }

  static isSupported(): boolean {
    return typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined'
  }

  private get deck(): Deck | undefined {
    return this.decks[this.front]
  }
  private get back(): Deck | undefined {
    return this.decks[1 - this.front]
  }

  get status(): EngineStatus {
    return this.state
  }
  get current(): Loaded | null {
    return this.deck?.loaded ?? null
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
    this.emit({ type: 'status', status, current: this.current })
  }

  private send(deck: Deck | undefined, m: ToWorklet): void {
    deck?.node.port.postMessage(m)
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
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.connect(ctx.destination)
    for (let i = 0; i < 2; i++) {
      const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
        numberOfInputs: 0,
        outputChannelCount: [2],
      })
      const gain = ctx.createGain()
      node.connect(gain).connect(analyser)
      const deck: Deck = {
        node,
        gain,
        activeId: null,
        loaded: null,
        snapshots: [],
        lastPick: null,
        waiting: null,
      }
      node.port.onmessage = (e: MessageEvent<FromWorklet>) => this.onWorklet(deck, e.data)
      this.decks.push(deck)
      if (this.debug) this.send(deck, { type: 'debug', enabled: true })
    }
    this.analyserNode = analyser
    this.state = 'idle'
    this.emit({ type: 'status', status: 'idle', current: null })
  }

  private onWorklet(deck: Deck, m: FromWorklet): void {
    if (m.id !== deck.activeId) return
    const audible = deck === this.deck
    switch (m.type) {
      case 'loaded':
        deck.waiting?.ok()
        break
      case 'snapshot':
        deck.snapshots.push({ at: m.at, snap: m.snap })
        if (deck.snapshots.length > KEPT_SNAPSHOTS) deck.snapshots.shift()
        break
      case 'ended':
        if (!audible) break // the song fading out underneath a crossfade
        if (this.state === 'playing') this.setStatus('paused')
        this.emit({ type: 'ended', id: m.id })
        break
      case 'error': {
        const error = new PlaybackError(m.message, m.id)
        if (deck.waiting) deck.waiting.fail(error)
        else if (audible) {
          if (this.state === 'playing') this.setStatus('paused')
          this.emit({ type: 'error', error })
        }
        break
      }
      case 'stats':
        if (audible) this.emit({ type: 'stats', stats: m.stats })
        break
    }
  }

  /** Ends a crossfade early: the deck that was fading out is silenced and emptied. */
  private settleFade(): void {
    if (this.fadeTimer !== null) clearTimeout(this.fadeTimer)
    this.fadeTimer = null
    const back = this.back
    if (back) {
      back.gain.gain.cancelScheduledValues(0)
      back.gain.gain.value = 0
      this.send(back, { type: 'unload' })
      back.loaded = null
      back.activeId = null
    }
  }

  async load(
    src: SongSource,
    opts?: { midiTarget?: MidiTarget; fadeSec?: number; seek?: SeekTarget; autoplay?: boolean },
  ): Promise<Loaded> {
    const ctx = this.ctx
    if (!ctx || this.decks.length === 0) throw new PlaybackError('Audio is locked', src.id)
    this.abort?.abort()
    const abort = new AbortController()
    this.abort = abort
    const stale = (): boolean => abort.signal.aborted
    const before: EngineStatus =
      this.state === 'loading' ? (this.current ? 'paused' : 'idle') : this.state
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

      // Crossfade onto the idle deck only while something is actually audible.
      this.settleFade()
      const fadeSec = opts?.fadeSec ?? 0
      const crossfade = fadeSec > 0 && before === 'playing' && this.current !== null
      const target = crossfade ? this.back : this.deck
      if (!target) throw new PlaybackError('Audio is locked', src.id)
      target.activeId = src.id
      target.snapshots = []
      target.lastPick = null
      const ready = new Promise<void>((ok, fail) => {
        target.waiting = { id: src.id, ok, fail }
        abort.signal.addEventListener('abort', () => fail(abortError()))
      })
      this.send(target, { type: 'load', id: src.id, song, options: this.options, seek: opts?.seek })
      await ready
      target.waiting = null
      if (stale()) throw abortError()
      target.loaded = { id: src.id, song, durationSec }

      const old = this.deck
      if (crossfade && old && old !== target) {
        const now = ctx.currentTime
        target.gain.gain.cancelScheduledValues(now)
        target.gain.gain.setValueAtTime(0, now)
        target.gain.gain.linearRampToValueAtTime(1, now + fadeSec)
        old.gain.gain.cancelScheduledValues(now)
        old.gain.gain.setValueAtTime(old.gain.gain.value, now)
        old.gain.gain.linearRampToValueAtTime(0, now + fadeSec)
        this.front = this.decks.indexOf(target)
        this.fadeTimer = setTimeout(() => this.settleFade(), fadeSec * 1000 + 100)
      } else {
        target.gain.gain.cancelScheduledValues(0)
        target.gain.gain.value = 1
      }
      this.setStatus('paused')
      if (opts?.autoplay !== false) this.play()
      return target.loaded
    } catch (err) {
      for (const d of this.decks) d.waiting = null
      if (stale()) throw err instanceof DOMException ? err : abortError()
      this.setStatus(before)
      this.emit({
        type: 'error',
        error: err as LoadError | ParseError | UnsupportedFormatError | PlaybackError,
      })
      throw err
    }
  }

  play(): void {
    if (!this.current) return
    void this.ctx?.resume()
    this.send(this.deck, { type: 'play' })
    this.setStatus('playing')
  }
  pause(): void {
    if (!this.current) return
    for (const d of this.decks) this.send(d, { type: 'pause' })
    this.setStatus('paused')
  }
  seek(to: SeekTarget): void {
    if (this.current) this.send(this.deck, { type: 'seek', to })
  }
  setOptions(o: Partial<PlayerOptions>): void {
    this.options = { ...this.options, ...o }
    for (const d of this.decks) this.send(d, { type: 'options', options: o })
  }

  /** Linear fade to silence, then pause. The gain is restored afterwards so the next play is audible. */
  fadeOut(sec: number): Promise<void> {
    const ctx = this.ctx
    const deck = this.deck
    if (!ctx || !deck || !this.current || this.state !== 'playing') return Promise.resolve()
    const now = ctx.currentTime
    deck.gain.gain.cancelScheduledValues(now)
    deck.gain.gain.setValueAtTime(deck.gain.gain.value, now)
    deck.gain.gain.linearRampToValueAtTime(0, now + sec)
    return new Promise((resolve) => {
      setTimeout(() => {
        // A new load in the meantime owns the deck; leave it alone.
        if (this.deck === deck && this.state === 'playing') {
          this.pause()
          deck.gain.gain.cancelScheduledValues(0)
          deck.gain.gain.value = 1
        }
        resolve()
      }, sec * 1000)
    })
  }

  latest(): { snap: Snapshot; song: ParsedFile } | null {
    const ctx = this.ctx
    const deck = this.deck
    if (!ctx || !deck?.loaded) return null
    const horizonSec = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0)
    let pick: Stamped | undefined
    for (let i = deck.snapshots.length - 1; i >= 0; i--) {
      const s = deck.snapshots[i]
      if (s && s.at / ctx.sampleRate <= horizonSec) {
        pick = s
        break
      }
    }
    pick ??= deck.snapshots[0]
    if (!pick) return null
    // ChannelState.triggered is true in one snapshot only. Carry the flags of snapshots skipped
    // since the last pick into this one, and report each trigger once.
    // ponytail: one consumer at a time, a second latest() caller would miss triggers.
    const flags = pick.snap.ch
    if (pick === deck.lastPick) for (const c of flags) c.triggered = false
    else {
      const from = deck.lastPick?.at ?? -1
      for (const s of deck.snapshots) {
        if (s.at <= from || s.at >= pick.at) continue
        s.snap.ch.forEach((c, i) => {
          const t = flags[i]
          if (c.triggered && t) t.triggered = true
        })
      }
      deck.lastPick = pick
    }
    return { snap: pick.snap, song: deck.loaded.song }
  }

  on(listener: (e: EngineEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async dispose(): Promise<void> {
    this.abort?.abort()
    if (this.fadeTimer !== null) clearTimeout(this.fadeTimer)
    this.listeners.clear()
    for (const d of this.decks) {
      d.node.port.close()
      d.loaded = null
    }
    this.decks = []
    const ctx = this.ctx
    this.ctx = null
    await ctx?.close()
  }
}
