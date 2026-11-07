import type { SeekTarget } from '../engine'

export type Route =
  | { page: 'landing' }
  | { page: 'browse' }
  | { page: 'jukebox' }
  | { page: 'credits' }
  | { page: 'play'; id: string; seek: SeekTarget | null }

/** Anything unrecognised → landing. */
export function parseRoute(_hash: string): Route {
  throw new Error('Not implemented (P17)')
}
/** parseRoute(formatRoute(r)) deep-equals r */
export function formatRoute(_r: Route): string {
  throw new Error('Not implemented (P17)')
}
export function useHashRoute(): [Route, (r: Route) => void] {
  throw new Error('Not implemented (P17)')
}
