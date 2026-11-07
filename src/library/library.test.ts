import { readFileSync } from 'node:fs'
import { afterEach, describe as suite, expect, it, vi } from 'vitest'
import { parseFile } from '../formats'
import { LoadError } from '../net'
import { describe, loadManifest } from './manifest'
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
