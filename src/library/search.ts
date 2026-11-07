import type { Format } from '../formats'
import type { ManifestEntry } from './manifest'

export type SortKey = 'title' | 'format' | 'channels' | 'durationSec' | 'sizeBytes' | 'addedAt'

/** An empty array means "all". */
export interface Filters {
  query: string
  formats: Format[]
  channels: number[]
  favoritesOnly: boolean
}

export const EMPTY_FILTERS: Filters = { query: '', formats: [], channels: [], favoritesOnly: false }

export function filterEntries(
  entries: readonly ManifestEntry[],
  f: Filters,
  favorites: ReadonlySet<string>,
): ManifestEntry[] {
  const q = f.query.trim().toLowerCase()
  const has = (text: string): boolean => text.toLowerCase().includes(q)
  return entries.filter(
    (e) =>
      (q === '' || has(e.title) || has(e.file) || e.sampleNames.some(has) || has(e.message)) &&
      (f.formats.length === 0 || f.formats.includes(e.format)) &&
      (f.channels.length === 0 || f.channels.includes(e.channels)) &&
      (!f.favoritesOnly || favorites.has(e.id)),
  )
}

/** Stable sort; returns a new array. */
export function sortEntries(
  entries: readonly ManifestEntry[],
  key: SortKey,
  dir: 'asc' | 'desc',
): ManifestEntry[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...entries].sort((a, b) => {
    const x = a[key]
    const y = b[key]
    const c =
      typeof x === 'string' && typeof y === 'string'
        ? x.localeCompare(y, undefined, { sensitivity: 'base' })
        : Number(x) - Number(y)
    return c * sign
  })
}
