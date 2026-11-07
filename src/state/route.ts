import { useMemo, useSyncExternalStore } from 'react'
import type { SeekTarget } from '../engine'

export type Route =
  | { page: 'landing' }
  | { page: 'browse' }
  | { page: 'jukebox' }
  | { page: 'credits' }
  | { page: 'play'; id: string; seek: SeekTarget | null }

const PLAY = '#/play/'

function parseSeek(query: string): SeekTarget | null | undefined {
  if (query === '') return null
  const m = /^(order|t)=(\d+(?:\.\d+)?)$/.exec(query)
  if (!m) return undefined
  const n = Number(m[2])
  if (m[1] === 'order') return Number.isInteger(n) ? { order: n } : undefined
  return { seconds: n }
}

/** Anything unrecognised → landing. */
export function parseRoute(hash: string): Route {
  if (hash === '#/browse') return { page: 'browse' }
  if (hash === '#/jukebox') return { page: 'jukebox' }
  if (hash === '#/credits') return { page: 'credits' }
  if (hash.startsWith(PLAY)) {
    const rest = hash.slice(PLAY.length)
    const q = rest.indexOf('?')
    const rawId = q < 0 ? rest : rest.slice(0, q)
    const seek = parseSeek(q < 0 ? '' : rest.slice(q + 1))
    try {
      const id = decodeURIComponent(rawId)
      if (id !== '' && seek !== undefined) return { page: 'play', id, seek }
    } catch {
      // malformed %-escape: fall through to landing
    }
  }
  return { page: 'landing' }
}

/** parseRoute(formatRoute(r)) deep-equals r */
export function formatRoute(r: Route): string {
  switch (r.page) {
    case 'landing':
      return '#/'
    case 'play': {
      const base = PLAY + encodeURIComponent(r.id)
      if (!r.seek) return base
      return 'order' in r.seek ? `${base}?order=${r.seek.order}` : `${base}?t=${r.seek.seconds}`
    }
    default:
      return `#/${r.page}`
  }
}

const subscribe = (cb: () => void): (() => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useHashRoute(): [Route, (r: Route) => void] {
  const hash = useSyncExternalStore(subscribe, () => location.hash)
  const route = useMemo(() => parseRoute(hash), [hash])
  return [
    route,
    (r) => {
      location.hash = formatRoute(r)
    },
  ]
}
