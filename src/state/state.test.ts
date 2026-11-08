import { describe, expect, it } from 'vitest'
import { formatRoute, parseRoute } from './route'
import type { Route } from './route'
import {
  DEFAULTS,
  FAVORITES_KEY,
  SETTINGS_KEY,
  loadFavorites,
  loadSettings,
  saveSettings,
} from './settings'

const memory = (init: Record<string, string> = {}): Storage => {
  const m = new Map(Object.entries(init))
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  }
}

describe('route', () => {
  const routes: Route[] = [
    { page: 'landing' },
    { page: 'browse' },
    { page: 'jukebox' },
    { page: 'credits' },
    { page: 'play', id: 'mod/90210.mod', seek: null },
    { page: 'play', id: 's3m/panic.s3m', seek: { order: 3 } },
    { page: 'play', id: 'midi/a b&c#d.mid', seek: { seconds: 12.5 } },
    { page: 'play', id: 'local:1:x?.mod', seek: { seconds: 0 } },
  ]
  it.each(routes)('round-trips %j', (r) => {
    expect(parseRoute(formatRoute(r))).toEqual(r)
  })
  it.each([
    '',
    '#',
    '#/',
    '#/nope',
    '#/browse/',
    '#/play/',
    '#/play/%E0%A4%A',
    '#/play/a?order=-1',
    '#/play/a?order=1.5',
    '#/play/a?t=x',
    '#/play/a?foo=1',
    'browse',
  ])('bad hash %j becomes landing', (h) => {
    expect(parseRoute(h)).toEqual({ page: 'landing' })
  })
})

describe('settings', () => {
  it('returns DEFAULTS for null storage, missing key and invalid JSON', () => {
    expect(loadSettings(null)).toEqual(DEFAULTS)
    expect(loadSettings(memory())).toEqual(DEFAULTS)
    expect(loadSettings(memory({ [SETTINGS_KEY]: '{nope' }))).toEqual(DEFAULTS)
    expect(loadSettings(memory({ [SETTINGS_KEY]: '[1]' }))).toEqual(DEFAULTS)
  })
  it('replaces wrong-typed or out-of-range leaves and keeps valid ones', () => {
    const raw = {
      theme: 'neon',
      player: {
        interpolation: 'cubic',
        stereoSeparation: 7,
        lastViz: 3,
        vizModes: { starfield: 5, plasma: -1, warp: 1.5, scope: 'x' },
      },
      jukebox: {
        shuffle: false,
        formats: ['mod', 'xm', 5, 's3m'],
        fade: 'yes',
        maxLengthMin: 31,
        autoViz: 'every2min',
      },
      intro: { skip: true },
    }
    const s = loadSettings(memory({ [SETTINGS_KEY]: JSON.stringify(raw) }))
    expect(s.theme).toBe(DEFAULTS.theme)
    expect(s.player).toEqual({
      ...DEFAULTS.player,
      interpolation: 'cubic',
      vizModes: { starfield: 5 },
    })
    expect(s.jukebox).toEqual({
      ...DEFAULTS.jukebox,
      shuffle: false,
      formats: ['mod', 's3m'],
      autoViz: 'every2min',
    })
    expect(s.intro.skip).toBe(true)
  })
  it('keeps valid browse leaves and drops bad ones', () => {
    const raw = {
      browse: {
        sortKey: 'addedAt',
        sortDir: 'up',
        formats: ['s3m', 'xm'],
        channels: [4, 0, '8', 8],
      },
    }
    const s = loadSettings(memory({ [SETTINGS_KEY]: JSON.stringify(raw) }))
    expect(s.browse).toEqual({
      ...DEFAULTS.browse,
      sortKey: 'addedAt',
      formats: ['s3m'],
      channels: [4, 8],
    })
  })
  it('saves, reloads, and reports blocked storage', () => {
    const st = memory()
    const s = { ...DEFAULTS, theme: 'mix' as const }
    expect(saveSettings(s, st)).toBe(true)
    expect(loadSettings(st)).toEqual(s)
    expect(saveSettings(s, null)).toBe(false)
    const full = {
      ...memory(),
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(saveSettings(s, full)).toBe(false)
  })
  it('favorites drop non-strings and tolerate junk', () => {
    expect(loadFavorites(memory({ [FAVORITES_KEY]: '["a",1,"b"]' }))).toEqual(new Set(['a', 'b']))
    expect(loadFavorites(memory({ [FAVORITES_KEY]: '{"a":1}' }))).toEqual(new Set())
  })
})
