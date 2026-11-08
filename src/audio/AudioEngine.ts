import { parseFile, parseSoundBank } from '../formats'
import { NOTE_NONE } from '../formats'
import type {
  MidiTarget,
  ParseError,
  ParsedFile,
  SoundBank,
  StreamFile,
  UnsupportedFormatError,
} from '../formats'
import { DEFAULT_PLAYER_OPTIONS, SCOPE_LEN, computeLength, createBeatDetector } from '../engine'
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

export type SongSource =
  | { id: string; url: string }
  | { id: string; parsed: ParsedFile }
  /** played by the deck's <audio>, never fetched by us */
  | { id: string; url: string; stream: StreamFile }
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
/** Streamed-channel RMS → ChannelState.volume; music sits around 0.1–0.3 RMS. */
const STREAM_VOLUME_GAIN = 3
/** Stream beats come from the audio below this. */
const BASS_HZ = 150

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
  hasBank: boolean
  waiting: { id: string; ok: () => void; fail: (e: Error) => void } | null
  /** MP3/FLAC path: the deck's own <audio>, feeding `gain` beside the worklet */
  media: HTMLAudioElement
  /** true while `media` (not the worklet) holds this deck's song */
  streaming: boolean
  /** L/R analysers on `media` only, for the snapshot scopes */
  scopeL: AnalyserNode
  scopeR: AnalyserNode
  bufL: Float32Array<ArrayBuffer>
  bufR: Float32Array<ArrayBuffer>
  /** filled by latest() while streaming; preallocated */
  streamSnap: Snapshot
  /** low-passed analyser on `media`: the beat detector listens to the kick, not the hats */
  bass: AnalyserNode
  bassBuf: Float32Array<ArrayBuffer>
  beat: (energy: number, dtSec: number) => boolean
  /** ctx time at which a detected beat reaches the speakers, or -1 */
  beatDueSec: number
  lastStreamSec: number
}

const abortError = (): DOMException => new DOMException('Load aborted', 'AbortError')

const mediaMessage = (media: HTMLAudioElement): string =>
  media.error?.message || 'This browser could not play the file'

const meanSquare = (buf: Float32Array): number => {
  let sum = 0
  for (const v of buf) sum += v * v
  return sum / buf.length
}

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
  private readonly soundFontUrl: string
  /** fetched once per session; cleared on failure so the next MIDI play retries */
  private bank: Promise<SoundBank> | null = null

  constructor(opts?: { debug?: boolean; soundFontUrl?: string }) {
    this.debug = opts?.debug ?? false
    this.soundFontUrl = opts?.soundFontUrl ?? './soundfonts/GeneralUser-GS.sf2'
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
    // iOS Safari only honours resume() inside the user gesture, which ends at the first await below.
    void ctx.resume()
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
      const media = new Audio()
      media.preload = 'auto'
      const source = ctx.createMediaElementSource(media)
      source.connect(gain)
      // A mono file is up-mixed to both outputs, so L and R scopes both show it.
      const split = ctx.createChannelSplitter(2)
      source.connect(split)
      const scopeL = ctx.createAnalyser()
      const scopeR = ctx.createAnalyser()
      scopeL.fftSize = SCOPE_LEN
      scopeR.fftSize = SCOPE_LEN
      split.connect(scopeL, 0)
      split.connect(scopeR, 1)
      const bufL = new Float32Array(SCOPE_LEN)
      const bufR = new Float32Array(SCOPE_LEN)
      const lowpass = ctx.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = BASS_HZ
      const bass = ctx.createAnalyser()
      // 1024 frames ≈ 23 ms: longer than a 60 fps frame and than one cycle of a kick's body
      bass.fftSize = 1024
      source.connect(lowpass).connect(bass)
      const side = (pan: number) => ({
        active: false,
        note: NOTE_NONE,
        ins: 0,
        volume: 0,
        pan,
        triggered: false,
      })
      const deck: Deck = {
        node,
        gain,
        activeId: null,
        loaded: null,
        snapshots: [],
        lastPick: null,
        hasBank: false,
        waiting: null,
        media,
        streaming: false,
        scopeL,
        scopeR,
        bufL,
        bufR,
        streamSnap: {
          frame: 0,
          seconds: 0,
          pos: { kind: 'stream' },
          ch: [side(-1), side(1)],
          scopes: [bufL, bufR],
        },
        bass,
        bassBuf: new Float32Array(1024),
        beat: createBeatDetector(),
        beatDueSec: -1,
        lastStreamSec: 0,
      }
      node.port.onmessage = (e: MessageEvent<FromWorklet>) => this.onWorklet(deck, e.data)
      media.addEventListener('ended', () => {
        if (deck.streaming && deck.loaded?.id === deck.activeId) this.onEnded(deck)
      })
      media.addEventListener('error', () => {
        // Only a song that already loaded; errors while opening are handled by openMedia.
        if (!deck.streaming || deck.loaded?.id !== deck.activeId || deck !== this.deck) return
        if (this.state === 'playing') this.setStatus('paused')
        this.emit({ type: 'error', error: new PlaybackError(mediaMessage(media), deck.activeId) })
      })
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
        this.onEnded(deck)
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

  private onEnded(deck: Deck): void {
    const id = deck.activeId
    if (deck !== this.deck || id === null) return // the song fading out underneath a crossfade
    if (this.state === 'playing') this.setStatus('paused')
    this.emit({ type: 'ended', id })
  }

  /** Points the deck's <audio> at `url` and waits for its metadata. Rejects PlaybackError or AbortError. */
  private openMedia(deck: Deck, url: string, signal: AbortSignal, id: string): Promise<void> {
    const media = deck.media
    return new Promise<void>((ok, fail) => {
      const done = (): void => {
        media.removeEventListener('loadedmetadata', onMeta)
        media.removeEventListener('error', onError)
        signal.removeEventListener('abort', onAbort)
      }
      const onMeta = (): void => {
        done()
        ok()
      }
      const onError = (): void => {
        done()
        fail(new PlaybackError(mediaMessage(media), id))
      }
      const onAbort = (): void => {
        done()
        fail(abortError())
      }
      media.addEventListener('loadedmetadata', onMeta)
      media.addEventListener('error', onError)
      signal.addEventListener('abort', onAbort)
      media.src = url
      media.load()
    })
  }

  /** Stops and empties the deck's <audio> if it holds the song. */
  private stopMedia(deck: Deck): void {
    if (!deck.streaming) return
    deck.streaming = false
    deck.media.pause()
    deck.media.removeAttribute('src')
    deck.media.load()
  }

  /** Fetches and parses the SoundFont on first use (not tied to any load's abort signal, so a
   *  newer load never throws the download away), then hands it to each deck once. */
  private async ensureBank(songId: string): Promise<void> {
    this.bank ??= fetchBytes(this.soundFontUrl, {
      onProgress: (loaded, total) => this.emit({ type: 'bankProgress', loaded, total }),
    })
      .then((bytes) => {
        const bank = parseSoundBank(bytes)
        this.emit({ type: 'bankProgress', loaded: bytes.length, total: bytes.length })
        return bank
      })
      .catch((err: unknown) => {
        this.bank = null
        throw err
      })
    let bank: SoundBank
    try {
      bank = await this.bank
    } catch (err) {
      throw new PlaybackError(
        `Sound bank unavailable: ${err instanceof Error ? err.message : 'unknown error'}`,
        songId,
      )
    }
    for (const d of this.decks)
      if (!d.hasBank) {
        d.hasBank = true
        this.send(d, { type: 'bank', bank })
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
      this.stopMedia(back)
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
    // Only this load's handle is cleared on the way out: an aborted load settles after the newer
    // one has already installed its own on the same deck.
    let mine: Deck['waiting'] = null
    try {
      let song: ParsedFile
      if ('stream' in src) song = src.stream
      else if ('parsed' in src) song = src.parsed
      else {
        const bytes = await fetchBytes(src.url, { signal: abort.signal })
        if (stale()) throw abortError()
        song = parseFile(bytes, opts?.midiTarget ? { midiTarget: opts.midiTarget } : undefined)
      }
      if (song.kind === 'midi') {
        await this.ensureBank(src.id)
        if (stale()) throw abortError()
      }
      let durationSec = computeLength(song).seconds

      // Crossfade onto the idle deck only while something is actually audible.
      this.settleFade()
      const fadeSec = opts?.fadeSec ?? 0
      const crossfade = fadeSec > 0 && before === 'playing' && this.current !== null
      const target = crossfade ? this.back : this.deck
      if (!target) throw new PlaybackError('Audio is locked', src.id)
      target.activeId = src.id
      target.snapshots = []
      target.lastPick = null
      if ('stream' in src) {
        this.send(target, { type: 'unload' })
        target.streaming = true
        await this.openMedia(target, src.url, abort.signal, src.id)
        if (stale()) throw abortError()
        const media = target.media
        if (Number.isFinite(media.duration) && media.duration > 0) durationSec = media.duration
        song = { ...src.stream, durationSec }
        const seek = opts?.seek
        if (seek && 'seconds' in seek) media.currentTime = seek.seconds
        target.lastStreamSec = media.currentTime
        target.beat = createBeatDetector()
        target.beatDueSec = -1
      } else {
        this.stopMedia(target)
        const ready = new Promise<void>((ok, fail) => {
          mine = { id: src.id, ok, fail }
          target.waiting = mine
          abort.signal.addEventListener('abort', () => fail(abortError()))
        })
        this.send(target, {
          type: 'load',
          id: src.id,
          song,
          options: this.options,
          seek: opts?.seek,
        })
        await ready
        if (target.waiting === mine) target.waiting = null
        if (stale()) throw abortError()
      }
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
      if (opts?.autoplay !== false) {
        // A refused <audio> start (e.g. iOS outside a gesture) fails the load, so the jukebox skips.
        if (target.streaming) await this.startMedia(target)
        else this.play()
      }
      return target.loaded
    } catch (err) {
      for (const d of this.decks) if (d.waiting === mine) d.waiting = null
      if (stale()) throw err instanceof DOMException ? err : abortError()
      this.setStatus(before)
      this.emit({
        type: 'error',
        error: err as LoadError | ParseError | UnsupportedFormatError | PlaybackError,
      })
      throw err
    }
  }

  /** Starts the deck's <audio>. Rejects PlaybackError if the browser refuses. */
  private async startMedia(deck: Deck): Promise<void> {
    void this.ctx?.resume()
    this.setStatus('playing')
    try {
      await deck.media.play()
    } catch (err) {
      if (deck === this.deck && this.state === 'playing') this.setStatus('paused')
      throw new PlaybackError(
        err instanceof Error ? err.message : 'Playback was refused',
        deck.activeId,
      )
    }
  }

  play(): void {
    const deck = this.deck
    if (!this.current || !deck) return
    if (deck.streaming) {
      this.startMedia(deck).catch((error: unknown) => {
        if (error instanceof PlaybackError) this.emit({ type: 'error', error })
      })
      return
    }
    void this.ctx?.resume()
    this.send(deck, { type: 'play' })
    this.setStatus('playing')
  }
  pause(): void {
    if (!this.current) return
    for (const d of this.decks) {
      this.send(d, { type: 'pause' })
      if (d.streaming) d.media.pause()
    }
    this.setStatus('paused')
  }
  /** `{ order }` does nothing for a streamed song. */
  seek(to: SeekTarget): void {
    const deck = this.deck
    if (!this.current || !deck) return
    if (!deck.streaming) this.send(deck, { type: 'seek', to })
    else if ('seconds' in to) {
      deck.media.currentTime = to.seconds
      deck.lastStreamSec = to.seconds
    }
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
    if (deck.streaming) return { snap: this.streamSnapshot(ctx, deck), song: deck.loaded.song }
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

  /** Overwrites the deck's preallocated snapshot from its <audio> and L/R analysers. */
  private streamSnapshot(ctx: AudioContext, deck: Deck): Snapshot {
    const s = deck.streamSnap
    const sec = deck.media.currentTime
    const dtSec = sec - deck.lastStreamSec
    deck.lastStreamSec = sec
    s.seconds = sec
    s.frame = Math.round(sec * ctx.sampleRate)
    deck.scopeL.getFloatTimeDomainData(deck.bufL)
    deck.scopeR.getFloatTimeDomainData(deck.bufR)
    const msL = meanSquare(deck.bufL)
    const msR = meanSquare(deck.bufR)
    // Only moving time counts: paused, or a seek backwards, never makes a beat.
    deck.bass.getFloatTimeDomainData(deck.bassBuf)
    const now = ctx.currentTime
    // The analysers hear the audio before the speakers do: hold the beat back by the output
    // latency, as latest() does for tracker snapshots.
    // ponytail: one pending beat, a second beat within the latency (Bluetooth) is dropped
    if (dtSec > 0 && dtSec < 1 && deck.beat(meanSquare(deck.bassBuf), dtSec) && deck.beatDueSec < 0)
      deck.beatDueSec = now + (ctx.outputLatency || ctx.baseLatency || 0)
    const beat = deck.beatDueSec >= 0 && now >= deck.beatDueSec
    if (beat || dtSec < 0) deck.beatDueSec = -1
    const playing = !deck.media.paused
    s.ch.forEach((c, i) => {
      c.active = playing
      c.volume = Math.min(1, Math.sqrt(i === 0 ? msL : msR) * STREAM_VOLUME_GAIN)
      c.triggered = beat
    })
    return s
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
      this.stopMedia(d)
      d.loaded = null
    }
    this.decks = []
    const ctx = this.ctx
    this.ctx = null
    await ctx?.close()
  }
}
