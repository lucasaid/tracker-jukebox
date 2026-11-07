import type { Format } from '../formats'
import type { Interpolation } from '../engine'

export interface Settings {
  version: 1
  player: { interpolation: Interpolation; stereoSeparation: number; lastViz: string }
  jukebox: {
    shuffle: boolean
    /** empty = all */
    formats: Format[]
    favoritesOnly: boolean
    fade: boolean
    /** integer 0..30; 0 = no cap */
    maxLengthMin: number
    autoViz: 'off' | 'perSong' | 'every2min'
  }
  intro: { skip: boolean }
}

export const DEFAULTS: Settings = {
  version: 1,
  player: { interpolation: 'nearest', stereoSeparation: 1, lastViz: 'pattern' },
  jukebox: {
    shuffle: true,
    formats: [],
    favoritesOnly: false,
    fade: true,
    maxLengthMin: 5,
    autoViz: 'perSong',
  },
  intro: { skip: false },
}

export const SETTINGS_KEY = 'tj.settings.v1'
export const FAVORITES_KEY = 'tj.favorites.v1'

/** Never throws. Missing, blocked or invalid storage → DEFAULTS; merged per leaf. */
export function loadSettings(_storage?: Storage | null): Settings {
  throw new Error('Not implemented (P17)')
}
/** false if storage is missing, blocked or full */
export function saveSettings(_s: Settings, _storage?: Storage | null): boolean {
  throw new Error('Not implemented (P17)')
}
export function loadFavorites(_storage?: Storage | null): Set<string> {
  throw new Error('Not implemented (P17)')
}
export function saveFavorites(_ids: ReadonlySet<string>, _storage?: Storage | null): boolean {
  throw new Error('Not implemented (P17)')
}
