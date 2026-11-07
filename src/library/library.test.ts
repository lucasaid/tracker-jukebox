import { readFileSync } from 'node:fs'
import { afterEach, describe as suite, expect, it, vi } from 'vitest'
import { parseFile } from '../formats'
import { LoadError } from '../net'
import { describe, loadManifest } from './manifest'
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
