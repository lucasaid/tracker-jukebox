import type { ReactNode } from 'react'
import type { MidiTarget } from '../formats'
import type { SeekTarget } from '../engine'
import type { AudioEngine, EngineStatus } from '../audio/AudioEngine'
import type { ManifestEntry } from '../library/manifest'
import type { LoadError } from '../net'

export interface PlayerApi {
  engine: AudioEngine
  status: EngineStatus
  current: ManifestEntry | null
  entries: ManifestEntry[]
  manifestError: LoadError | null
  retryManifest(): void
  mode: 'single' | 'jukebox'
  muteMask: number
  play(
    id: string,
    opts?: { seek?: SeekTarget; fadeSec?: number; midiTarget?: MidiTarget },
  ): Promise<void>
  toggle(): void
  setMuted(ch: number, muted: boolean): void
  solo(ch: number | null): void
  favorites: ReadonlySet<string>
  toggleFavorite(id: string): void
  addLocal(file: File): Promise<ManifestEntry>
  startJukebox(): Promise<void>
  next(): Promise<void>
  prev(): Promise<void>
}

export function PlayerProvider(_props: { children: ReactNode }) {
  // Implemented in P17.
  return null
}

export function usePlayer(): PlayerApi {
  throw new Error('Not implemented (P17)')
}
