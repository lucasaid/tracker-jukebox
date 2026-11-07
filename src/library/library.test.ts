import { readFileSync } from 'node:fs'
import { afterEach, describe as suite, expect, it, vi } from 'vitest'
import { parseFile } from '../formats'
import { LoadError } from '../net'
import { describe, loadManifest } from './manifest'
import { createQueue } from './shuffle'
import { EMPTY_FILTERS, filterEntries, sortEntries } from './search'
import type { ManifestEntry } from './manifest'

const meta = (file: string) => ({
  id: file.toLowerCase(),
  url: `./music/${file.toLowerCase()}`,
  file,
  sizeBytes: 1,
  durationSec: 2,
  loops: false,
})
const load = (rel: string) => parseFile(new Uint8Array(readFileSync(`trackers/${rel}`)))

suite('describe', () => {
  it('builds an entry from a tracker file', () => {
    const e = describe(load('mod/90210.MOD'), meta('90210.MOD'))
    expect(e).toMatchObject({
      format: 'mod',
      title: 'Beverly Hills 90210',
      channels: 4,
      midiTarget: null,
      durationSec: 2,
    })
    expect(e.sampleNames[0]).toBe('BASS.SAM')
    expect(e.sampleNames.every((n) => n !== '')).toBe(true)
  })
  it('falls back to the file name when the title is blank', () => {
    expect(describe(load('s3m/PANIC.S3M'), meta('PANIC.S3M')).title).toBe('PANIC')
  })
})

const good: ManifestEntry = {
  id: 'mod/a.mod',
  url: './music/mod/a.mod',
  file: 'A.MOD',
  format: 'mod',
  title: 'A',
  tracker: 'ProTracker (M.K.)',
  channels: 4,
  sizeBytes: 10,
  durationSec: 1,
  loops: false,
  sampleNames: ['x'],
  message: '',
  midiTarget: null,
}

const serve = (body: unknown): void => {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify(body))))
}

suite('loadManifest', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns valid entries and drops malformed ones with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    serve({ version: 1, generatedAt: '', entries: [good, { ...good, channels: '4' }, { id: 1 }] })
    expect(await loadManifest('m.json')).toEqual([good])
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
  it('rejects an unsupported version', async () => {
    serve({ version: 2, entries: [] })
    await expect(loadManifest('m.json')).rejects.toThrow('Unsupported manifest version')
  })
  it('rejects non-array entries', async () => {
    serve({ version: 1, entries: {} })
    await expect(loadManifest('m.json')).rejects.toThrow('Invalid manifest')
  })
  it('maps HTTP and JSON failures to LoadError', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 404 })))
    await expect(loadManifest('m.json')).rejects.toMatchObject({ status: 404 })
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{nope')))
    await expect(loadManifest('m.json')).rejects.toThrow(LoadError)
  })
})

suite('search', () => {
  const entry = (over: Partial<ManifestEntry>): ManifestEntry => ({
    ...describe(load('mod/90210.MOD'), meta('a.mod')),
    ...over,
  })
  const list = [
    entry({ id: 'a', title: 'Zeta', format: 'mod', channels: 4, durationSec: 30, file: 'a.mod' }),
    entry({ id: 'b', title: 'alpha', format: 's3m', channels: 16, durationSec: 10, file: 'b.s3m' }),
    entry({ id: 'c', title: 'Beta', format: 'mod', channels: 8, durationSec: 10, file: 'c.mod' }),
  ]
  const ids = (es: ManifestEntry[]) => es.map((e) => e.id)

  it('matches the query case-insensitively against title, file, samples and message', () => {
    const f = { ...EMPTY_FILTERS }
    expect(ids(filterEntries(list, { ...f, query: '  ALPHA ' }, new Set()))).toEqual(['b'])
    expect(ids(filterEntries(list, { ...f, query: 'c.mod' }, new Set()))).toEqual(['c'])
    expect(ids(filterEntries(list, { ...f, query: 'bass.sam' }, new Set()))).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(filterEntries(list, { ...f, query: 'no such text' }, new Set())).toEqual([])
    expect(filterEntries(list, { ...f, query: '   ' }, new Set())).toHaveLength(3)
  })
  it('combines format, channel and favorite filters, where empty means all', () => {
    const f = { ...EMPTY_FILTERS }
    expect(ids(filterEntries(list, { ...f, formats: ['mod'] }, new Set()))).toEqual(['a', 'c'])
    expect(
      ids(filterEntries(list, { ...f, formats: ['mod'], channels: [8, 16] }, new Set())),
    ).toEqual(['c'])
    expect(ids(filterEntries(list, { ...f, favoritesOnly: true }, new Set(['b', 'zz'])))).toEqual([
      'b',
    ])
  })
  it('sorts strings by base letters, numbers numerically, in both directions, stably', () => {
    expect(ids(sortEntries(list, 'title', 'asc'))).toEqual(['b', 'c', 'a'])
    expect(ids(sortEntries(list, 'title', 'desc'))).toEqual(['a', 'c', 'b'])
    expect(ids(sortEntries(list, 'durationSec', 'asc'))).toEqual(['b', 'c', 'a'])
    expect(ids(sortEntries(list, 'durationSec', 'desc'))).toEqual(['a', 'b', 'c'])
    expect(ids(sortEntries(list, 'channels', 'desc'))).toEqual(['b', 'c', 'a'])
  })
  it('does not mutate its input', () => {
    const copy = [...list]
    sortEntries(list, 'title', 'asc')
    expect(list).toEqual(copy)
  })
})

suite('queue', () => {
  const rngFrom = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const ten = Array.from({ length: 10 }, (_, i) => `s${i}`)
  const pass = (q: ReturnType<typeof createQueue>) => {
    const out = [q.current() as string]
    for (let i = 1; i < 10; i++) out.push(q.next() as string)
    return out
  }

  it('plays every id once per pass, and the next pass does not open with the last id', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const q = createQueue(ten, true, rngFrom(seed))
      const first = pass(q)
      expect(new Set(first).size).toBe(10)
      expect(q.next()).not.toBe(first[9])
      expect(new Set([q.current(), ...pass2(q)]).size).toBe(10)
    }
    function pass2(q: ReturnType<typeof createQueue>) {
      return Array.from({ length: 9 }, () => q.next())
    }
  })
  it('keeps the given order when not shuffling, and wraps', () => {
    const q = createQueue(['a', 'b', 'c'], false)
    expect([q.current(), q.next(), q.next(), q.next()]).toEqual(['a', 'b', 'c', 'a'])
  })
  it('prev walks back through history and stays put at the start; next replays it', () => {
    const q = createQueue(['a', 'b', 'c'], false)
    q.next()
    q.next()
    expect([q.prev(), q.prev(), q.prev()]).toEqual(['b', 'a', null])
    expect(q.current()).toBe('a')
    expect([q.next(), q.next(), q.next()]).toEqual(['b', 'c', 'a'])
  })
  it('rebuild keeps the current id and drops played ids from the rest of the pass', () => {
    const q = createQueue(['a', 'b', 'c', 'd'], false)
    q.next() // current b, played a b
    q.rebuild(['a', 'b', 'c', 'd', 'e'], false)
    expect(q.current()).toBe('b')
    expect([q.next(), q.next(), q.next()]).toEqual(['c', 'd', 'e'])
    q.rebuild(['x', 'e'], false) // current e is gone from the list but stays current
    expect(q.current()).toBe('e')
    expect(q.next()).toBe('x')
  })
  it('handles empty and single-id queues', () => {
    const empty = createQueue([], true)
    expect([empty.current(), empty.next(), empty.prev()]).toEqual([null, null, null])
    const one = createQueue(['a'], true)
    expect([one.current(), one.next(), one.next()]).toEqual(['a', 'a', 'a'])
  })
})
