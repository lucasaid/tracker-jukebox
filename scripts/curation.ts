// What gets published from trackers/: exclusions, title overrides and MIDI targets.
// Read by scripts/manifest.ts, edited by scripts/manage.ts. Dev-only; never bundled.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MidiTarget } from '../src/formats'

export const root = fileURLToPath(new URL('..', import.meta.url))
export const trackersDir = join(root, 'trackers')
const CURATION_PATH = join(root, 'scripts', 'curation.json')
const MIDI_PATH = join(root, 'scripts', 'midi-overrides.json')

export interface Curation {
  /** ids left out of the manifest and public/music */
  exclude: string[]
  /** id → title shown instead of the parsed one */
  titles: Record<string, string>
  /** id → MIDI target (stored in midi-overrides.json); absent = 'gm' */
  midi: Record<string, MidiTarget>
}

/** All files under dir, dotfiles skipped, sorted. */
export function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]))
}

/** Lowercased path under trackers/ (decision 5). */
export const idOf = (path: string): string =>
  relative(trackersDir, path).split(sep).join('/').toLowerCase()

const isRecord = (u: unknown): u is Record<string, unknown> =>
  typeof u === 'object' && u !== null && !Array.isArray(u)

/** Validates untrusted JSON (a file or the manager's POST body). Throws Error on a bad shape. */
export function parseCuration(raw: unknown): Curation {
  if (!isRecord(raw)) throw new Error('curation: not an object')
  const exclude = raw['exclude'] ?? []
  if (!Array.isArray(exclude) || !exclude.every((x) => typeof x === 'string'))
    throw new Error('curation: exclude must be a list of ids')
  const titles: Record<string, string> = {}
  const rawTitles = raw['titles'] ?? {}
  if (!isRecord(rawTitles)) throw new Error('curation: titles must be an object')
  for (const [id, t] of Object.entries(rawTitles)) {
    if (typeof t !== 'string') throw new Error(`curation: bad title for ${id}`)
    if (t.trim() !== '') titles[id] = t.trim()
  }
  const midi: Record<string, MidiTarget> = {}
  const rawMidi = raw['midi'] ?? {}
  if (!isRecord(rawMidi)) throw new Error('curation: midi must be an object')
  for (const [id, v] of Object.entries(rawMidi)) {
    if (v !== 'gm' && v !== 'mt32') throw new Error(`curation: bad MIDI target for ${id}`)
    if (v === 'mt32') midi[id] = v
  }
  return { exclude: [...new Set(exclude)].sort(), titles, midi }
}

const readJson = (path: string): unknown =>
  existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as unknown) : {}

export function loadCuration(): Curation {
  const c = readJson(CURATION_PATH)
  return parseCuration({ ...(isRecord(c) ? c : {}), midi: readJson(MIDI_PATH) })
}

const sortKeys = <T>(r: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)))

export function saveCuration(c: Curation): void {
  const json = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`
  writeFileSync(CURATION_PATH, json({ exclude: c.exclude, titles: sortKeys(c.titles) }))
  writeFileSync(MIDI_PATH, json(sortKeys(c.midi)))
}
