import { FORMATS } from '../formats'
import type { Format } from '../formats'
import type { Interpolation } from '../engine'

export const THEMES = ['bbs', 'tracker', 'demoscene', 'mix'] as const
export type Theme = (typeof THEMES)[number]

export interface Settings {
  version: 1
  /** applied as <html data-theme>; unknown value → DEFAULTS.theme */
  theme: Theme
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
  theme: 'bbs',
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

const INTERPOLATIONS: readonly Interpolation[] = ['nearest', 'linear', 'cubic']
const AUTO_VIZ: readonly Settings['jukebox']['autoViz'][] = ['off', 'perSong', 'every2min']

const isRecord = (u: unknown): u is Record<string, unknown> =>
  typeof u === 'object' && u !== null && !Array.isArray(u)

/** A leaf from `src[key]` if it passes `ok`, else `fallback`. `ok` is the narrowing step. */
function leaf<T>(src: unknown, key: string, ok: (v: unknown) => v is T, fallback: T): T {
  const v = isRecord(src) ? src[key] : undefined
  return ok(v) ? v : fallback
}

const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const isOneOf =
  <T extends string>(list: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === 'string' && (list as readonly string[]).includes(v)

/** Storage access can throw (blocked cookies, sandboxed frames), so it is always guarded. */
function storageOf(storage: Storage | null | undefined): Storage | null {
  if (storage !== undefined) return storage
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function readJson(key: string, storage: Storage | null | undefined): unknown {
  const st = storageOf(storage)
  if (!st) return undefined
  try {
    const raw = st.getItem(key)
    return raw === null ? undefined : (JSON.parse(raw) as unknown)
  } catch {
    return undefined
  }
}

function writeJson(key: string, value: unknown, storage: Storage | null | undefined): boolean {
  const st = storageOf(storage)
  if (!st) return false
  try {
    st.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** Never throws. Missing, blocked or invalid storage → DEFAULTS; merged per leaf. */
export function loadSettings(storage?: Storage | null): Settings {
  const raw = readJson(SETTINGS_KEY, storage)
  const d = DEFAULTS
  const player = isRecord(raw) ? raw.player : undefined
  const jukebox = isRecord(raw) ? raw.jukebox : undefined
  const intro = isRecord(raw) ? raw.intro : undefined
  const isFraction = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 1
  const isMinutes = (v: unknown): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 30
  const isText = (v: unknown): v is string => typeof v === 'string' && v !== ''
  const formats = isRecord(jukebox) && Array.isArray(jukebox.formats) ? jukebox.formats : null
  return {
    version: 1,
    theme: leaf(raw, 'theme', isOneOf(THEMES), d.theme),
    player: {
      interpolation: leaf(player, 'interpolation', isOneOf(INTERPOLATIONS), d.player.interpolation),
      stereoSeparation: leaf(player, 'stereoSeparation', isFraction, d.player.stereoSeparation),
      lastViz: leaf(player, 'lastViz', isText, d.player.lastViz),
    },
    jukebox: {
      shuffle: leaf(jukebox, 'shuffle', isBool, d.jukebox.shuffle),
      formats: formats ? formats.filter(isOneOf(FORMATS)) : d.jukebox.formats,
      favoritesOnly: leaf(jukebox, 'favoritesOnly', isBool, d.jukebox.favoritesOnly),
      fade: leaf(jukebox, 'fade', isBool, d.jukebox.fade),
      maxLengthMin: leaf(jukebox, 'maxLengthMin', isMinutes, d.jukebox.maxLengthMin),
      autoViz: leaf(jukebox, 'autoViz', isOneOf(AUTO_VIZ), d.jukebox.autoViz),
    },
    intro: { skip: leaf(intro, 'skip', isBool, d.intro.skip) },
  }
}

/** false if storage is missing, blocked or full */
export function saveSettings(s: Settings, storage?: Storage | null): boolean {
  return writeJson(SETTINGS_KEY, s, storage)
}

export function loadFavorites(storage?: Storage | null): Set<string> {
  const raw = readJson(FAVORITES_KEY, storage)
  return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [])
}

export function saveFavorites(ids: ReadonlySet<string>, storage?: Storage | null): boolean {
  return writeJson(FAVORITES_KEY, [...ids], storage)
}
