import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { detectFormat, parseFile } from '../formats'
import type { MidiTarget, ParsedFile } from '../formats'
import { computeLength } from '../engine'
import type { SeekTarget } from '../engine'
import { AudioEngine } from '../audio/AudioEngine'
import type { EngineStatus } from '../audio/AudioEngine'
import { describe, loadManifest } from '../library/manifest'
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
  favorites: ReadonlySet<string>
  toggleFavorite(id: string): void // local ids are ignored
  /** Rejects with Error('File too large (max 16 MB)') | Error('Not a supported music file') | the parse error. Never uploads. */
  addLocal(file: File): Promise<ManifestEntry>
}

const Ctx = createContext<PlayerApi | null>(null)
const DEBUG = new URLSearchParams(location.search).get('debug') === '1'
const MANIFEST_URL = './manifest.json'
const MAX_LOCAL_BYTES = 16 * 1024 * 1024

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

  const api: PlayerApi = {
    engine,
    status,
    current: entries.find((e) => e.id === currentId) ?? null,
    entries,
    manifestError,
    retryManifest: () => setManifestTry((n) => n + 1),
    mode: 'single',
    muteMask,
    async play(id, opts) {
      const local = localsRef.current.find((l) => l.entry.id === id)
      const entry = local?.entry ?? manifestEntries.find((e) => e.id === id)
      if (!entry) throw new Error('Song not found')
      await engine.unlock()
      // Mutes belong to one song, so a new song starts unmuted.
      setMuteMask(0)
      engine.setOptions({ muteMask: 0 })
      try {
        await engine.load(local ? { id, parsed: local.parsed } : { id, url: entry.url ?? '' }, {
          seek: opts?.seek,
          fadeSec: opts?.fadeSec,
          midiTarget: opts?.midiTarget ?? entry.midiTarget ?? undefined,
        })
      } catch {
        // The engine already reported the failure as an 'error' event (logged above); a newer
        // load aborting this one is not an error either.
      }
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
    favorites,
    toggleFavorite(id) {
      if (id.startsWith('local:')) return
      const next = new Set(favorites)
      if (!next.delete(id)) next.add(id)
      setFavorites(next)
      saveFavorites(next)
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
