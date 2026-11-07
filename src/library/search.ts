import type { Format } from '../formats'
import type { ManifestEntry } from './manifest'

export type SortKey = 'title' | 'format' | 'channels' | 'durationSec' | 'sizeBytes'

/** An empty array means "all". */
export interface Filters {
  query: string
  formats: Format[]
  channels: number[]
  favoritesOnly: boolean
}

export const EMPTY_FILTERS: Filters = { query: '', formats: [], channels: [], favoritesOnly: false }

export function filterEntries(
  _entries: readonly ManifestEntry[],
  _f: Filters,
  _favorites: ReadonlySet<string>,
): ManifestEntry[] {
  throw new Error('Not implemented (P19)')
}

/** Stable sort; returns a new array. */
export function sortEntries(
  _entries: readonly ManifestEntry[],
  _key: SortKey,
  _dir: 'asc' | 'desc',
): ManifestEntry[] {
  throw new Error('Not implemented (P19)')
}
