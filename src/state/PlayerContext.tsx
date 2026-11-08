import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { detectFormat, parseFile } from '../formats'
import type { MidiTarget, ParsedFile } from '../formats'
import { computeLength } from '../engine'
import type { SeekTarget } from '../engine'
import { AudioEngine } from '../audio/AudioEngine'
import type { EngineStatus } from '../audio/AudioEngine'
import { describe, loadManifest } from '../library/manifest'
import { filterEntries, sortEntries, EMPTY_FILTERS } from '../library/search'
import { createQueue } from '../library/shuffle'
import type { Queue } from '../library/shuffle'
import type { ManifestEntry } from '../library/manifest'
import { LoadError } from '../net'
import { useSettings } from './SettingsContext'
import { loadFavorites, saveFavorites } from './settings'

export interface PlayerApi {
  engine: AudioEngine
  status: EngineStatus
  current: ManifestEntry | null
  entries: ManifestEntry[]
  manifestError: LoadError | null
  retryManifest(): void
  mode: 'single' | 'jukebox'
  muteMask: number
  /** Unlocks if needed (call from a gesture). Unknown id → rejects Error('Song not found'). Sets mode 'single'.
   *  opts.fadeSec is used by the jukebox. MIDI entries pass entry.midiTarget (or the InfoPanel override). */
  play(
    id: string,
    opts?: { seek?: SeekTarget; fadeSec?: number; midiTarget?: MidiTarget },
  ): Promise<void>
  toggle(): void
  setMuted(ch: number, muted: boolean): void
  solo(ch: number | null): void // ch → mute all others; null → unmute all
  favorites: ReadonlySet<string>
  toggleFavorite(id: string): void // local ids are ignored
  /** Rejects with Error('File too large (max 16 MB)') | Error('Not a supported music file') | the parse error. Never uploads. */
  addLocal(file: File): Promise<ManifestEntry>
  /** Builds the Queue from settings.jukebox and entries, sets mode 'jukebox' and plays the first song. Rejects Error('No songs match the jukebox filter'). */
  startJukebox(): Promise<void>
  next(): Promise<void> // jukebox mode only; no-op in single mode
  prev(): Promise<void>
  /** Jukebox mode only (no-op in single mode): plays a random song from the jukebox filter, other than the current one, and stays in jukebox mode. */
  random(): Promise<void>
}

const Ctx = createContext<PlayerApi | null>(null)
const DEBUG = new URLSearchParams(location.search).get('debug') === '1'
const MANIFEST_URL = './manifest.json'
const MAX_LOCAL_BYTES = 16 * 1024 * 1024
const FAIL_LIMIT = 3
const TICK_MS = 250
const FADE_LEAD_SEC = 4
/** Same event Toast listens to; state may not import ui, so the name is repeated here. */
const toast = (text: string): void => {
  window.dispatchEvent(new CustomEvent<string>('tj-toast', { detail: text }))
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings()
  const [engine] = useState(() => new AudioEngine({ debug: DEBUG }))
  const [status, setStatus] = useState<EngineStatus>('locked')
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [manifestEntries, setEntries] = useState<ManifestEntry[]>([])
  const [locals, setLocals] = useState<{ entry: ManifestEntry; parsed: ParsedFile }[]>([])
  // The ref lets play() see a file added in the same tick (drop, then play).
  const localsRef = useRef<{ entry: ManifestEntry; parsed: ParsedFile }[]>([])
  const [favorites, setFavorites] = useState(() => loadFavorites())
  const entries = [...manifestEntries, ...locals.map((l) => l.entry)]
  const [manifestError, setManifestError] = useState<LoadError | null>(null)
  const [manifestTry, setManifestTry] = useState(0)
  const [muteMask, setMuteMask] = useState(0)
  const [mode, setMode] = useState<'single' | 'jukebox'>('single')
  const queue = useRef<Queue | null>(null)
  const fails = useRef(0)
  /** the Loaded object whose successor was already requested, so each song advances once */
  const advancedFrom = useRef<unknown>(null)

  useEffect(() => {
    return engine.on((e) => {
      if (e.type === 'status') {
        setStatus(e.status)
        setCurrentId(e.current?.id ?? null)
      } else if (e.type === 'error') {
        console.error(e.error.message, e.error)
      } else if (e.type === 'stats') {
        console.table(e.stats)
      }
    })
  }, [engine])

  useEffect(() => {
    let live = true
    loadManifest(MANIFEST_URL).then(
      (list) => {
        if (!live) return
        setEntries(list)
        setManifestError(null)
      },
      (err: unknown) => {
        if (live)
          setManifestError(
            err instanceof LoadError
              ? err
              : new LoadError(err instanceof Error ? err.message : 'Manifest failed', MANIFEST_URL),
          )
      },
    )
    return () => {
      live = false
    }
  }, [manifestTry])

  const { interpolation, stereoSeparation } = settings.player
  useEffect(() => {
    engine.setOptions({ interpolation, stereoSeparation })
  }, [engine, interpolation, stereoSeparation])

  /** Loads and starts a song. false if it failed (the engine already reported why). */
  const playSong = async (
    id: string,
    opts?: { seek?: SeekTarget; fadeSec?: number; midiTarget?: MidiTarget },
  ): Promise<boolean> => {
    const local = localsRef.current.find((l) => l.entry.id === id)
    const entry = local?.entry ?? manifestEntries.find((e) => e.id === id)
    if (!entry) throw new Error('Song not found')
    try {
      await engine.unlock()
    } catch (err) {
      // Callers fire play() from click handlers without awaiting, so report it here.
      const message = err instanceof Error ? err.message : 'Audio is not available'
      console.error(message, err)
      toast(message)
      return false
    }
    // Mutes belong to one song, so a new song starts unmuted.
    setMuteMask(0)
    engine.setOptions({ muteMask: 0 })
    const target = opts?.midiTarget ?? entry.midiTarget ?? undefined
    try {
      // A dropped MIDI is never re-parsed, so the MT-32 toggle sets its target directly.
      const parsed =
        local?.parsed.kind === 'midi' && target ? { ...local.parsed, target } : local?.parsed
      await engine.load(parsed ? { id, parsed } : { id, url: entry.url ?? '' }, {
        seek: opts?.seek,
        fadeSec: opts?.fadeSec,
        midiTarget: target,
      })
      return true
    } catch {
      // The engine already reported the failure as an 'error' event (logged above); a newer
      // load aborting this one is not an error either.
      return false
    }
  }

  const jukeIds = (): string[] => {
    const j = settings.jukebox
    const filters = { ...EMPTY_FILTERS, formats: j.formats, favoritesOnly: j.favoritesOnly }
    return sortEntries(filterEntries(entries, filters, favorites), 'title', 'asc').map((e) => e.id)
  }

  /** Plays what `pick` returns; a song that fails is skipped, and FAIL_LIMIT failures in a row stop the jukebox. */
  const playQueued = async (pick: () => string | null, fadeSec: number): Promise<void> => {
    for (;;) {
      const id = pick()
      if (id === null) return
      if (await playSong(id, { fadeSec })) {
        fails.current = 0
        return
      }
      if (++fails.current >= FAIL_LIMIT) {
        fails.current = 0
        queue.current = null
        setMode('single')
        engine.pause()
        toast(`Jukebox stopped: ${FAIL_LIMIT} songs in a row failed to load`)
        return
      }
    }
  }

  // Timers and the 'ended' event read the latest closures through this ref.
  const live = useRef({ jukeIds, playQueued, jukebox: settings.jukebox })
  useEffect(() => {
    live.current = { jukeIds, playQueued, jukebox: settings.jukebox }
  })

  // Keep the queue in step with the jukebox settings, the favorites and the entry list.
  const { formats, favoritesOnly, shuffle } = settings.jukebox
  useEffect(() => {
    if (mode === 'jukebox') queue.current?.rebuild(live.current.jukeIds(), shuffle)
  }, [mode, formats, favoritesOnly, shuffle, favorites, locals])

  // Advance when a song ends, or when it is time to start the fade into the next one.
  useEffect(() => {
    if (mode !== 'jukebox') return
    const advance = (fadeSec: number): void => {
      const q = queue.current
      if (!q) return
      advancedFrom.current = engine.current
      void live.current.playQueued(() => q.next(), fadeSec)
    }
    const timer = setInterval(() => {
      const cur = engine.current
      if (!cur || engine.status !== 'playing' || advancedFrom.current === cur) return
      const { fade, maxLengthMin } = live.current.jukebox
      const cap = maxLengthMin * 60
      const limit = cap > 0 ? Math.min(cur.durationSec, cap) : cur.durationSec
      const lead = fade ? Math.min(FADE_LEAD_SEC, limit / 2) : 0
      const secs = engine.latest()?.snap.seconds ?? 0
      // Without a fade, the song's own end is handled by the 'ended' event below.
      if (secs >= limit - lead && (fade || (cap > 0 && secs >= cap))) advance(lead)
    }, TICK_MS)
    const off = engine.on((e) => {
      if (e.type === 'ended' && advancedFrom.current !== engine.current) advance(0)
    })
    return () => {
      clearInterval(timer)
      off()
    }
  }, [mode, engine])

  // Media keys and lock-screen controls (optional API).
  const currentEntry = entries.find((e) => e.id === currentId) ?? null
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = currentEntry
      ? new MediaMetadata({
          title: currentEntry.title || currentEntry.file,
          artist: currentEntry.tracker,
          album: 'Tracker Jukebox',
        })
      : null
  }, [currentEntry])
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    ms.playbackState = status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'none'
    ms.setActionHandler('play', () => engine.play())
    ms.setActionHandler('pause', () => engine.pause())
    const step = (dir: 'next' | 'prev') => () => {
      const q = queue.current
      if (q) void live.current.playQueued(() => (dir === 'next' ? q.next() : q.prev()), 0)
    }
    ms.setActionHandler('nexttrack', mode === 'jukebox' ? step('next') : null)
    ms.setActionHandler('previoustrack', mode === 'jukebox' ? step('prev') : null)
  }, [engine, mode, status])

  const api: PlayerApi = {
    engine,
    status,
    current: entries.find((e) => e.id === currentId) ?? null,
    entries,
    manifestError,
    retryManifest: () => setManifestTry((n) => n + 1),
    mode,
    muteMask,
    async play(id, opts) {
      queue.current = null
      setMode('single')
      await playSong(id, opts)
    },
    toggle() {
      if (status === 'playing') engine.pause()
      else if (status === 'paused') engine.play()
    },
    setMuted(ch, muted) {
      const next = muted ? muteMask | (1 << ch) : muteMask & ~(1 << ch)
      setMuteMask(next)
      engine.setOptions({ muteMask: next })
    },
    solo(ch) {
      const song = engine.current?.song
      const n = song?.kind === 'tracker' ? song.channels : 16
      const next = ch === null ? 0 : ((1 << n) - 1) & ~(1 << ch)
      setMuteMask(next)
      engine.setOptions({ muteMask: next })
    },
    favorites,
    toggleFavorite(id) {
      if (id.startsWith('local:')) return
      const next = new Set(favorites)
      if (!next.delete(id)) next.add(id)
      setFavorites(next)
      saveFavorites(next)
    },
    async startJukebox() {
      const ids = jukeIds()
      if (ids.length === 0) throw new Error('No songs match the jukebox filter')
      const q = createQueue(ids, settings.jukebox.shuffle)
      queue.current = q
      fails.current = 0
      advancedFrom.current = null
      setMode('jukebox')
      let first = true // the queue's opening song, then onwards if it fails
      await playQueued(() => (first ? ((first = false), q.current()) : q.next()), 0)
    },
    async next() {
      const q = queue.current
      if (mode === 'jukebox' && q) await playQueued(() => q.next(), 0)
    },
    async prev() {
      const q = queue.current
      if (mode === 'jukebox' && q) await playQueued(() => q.prev(), 0)
    },
    async random() {
      if (mode !== 'jukebox') return
      // A fresh pick per attempt, so a song that fails to load isn't retried.
      const pick = (): string | null => {
        const pool = jukeIds().filter((id) => id !== currentId)
        return pool[Math.floor(Math.random() * pool.length)] ?? null
      }
      await playQueued(pick, 0)
    },
    async addLocal(file) {
      if (file.size > MAX_LOCAL_BYTES) throw new Error('File too large (max 16 MB)')
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (detectFormat(bytes) === null) throw new Error('Not a supported music file')
      const parsed = parseFile(bytes)
      const { seconds, loops } = computeLength(parsed)
      const entry = describe(parsed, {
        id: `local:${localsRef.current.length + 1}:${file.name}`,
        url: null,
        file: file.name,
        sizeBytes: file.size,
        durationSec: seconds,
        loops,
        addedAt: new Date().toISOString(),
      })
      localsRef.current = [...localsRef.current, { entry, parsed }]
      setLocals(localsRef.current)
      return entry
    },
  }
  return <Ctx value={api}>{children}</Ctx>
}

export function usePlayer(): PlayerApi {
  const api = useContext(Ctx)
  if (!api) throw new Error('usePlayer needs a PlayerProvider')
  return api
}
