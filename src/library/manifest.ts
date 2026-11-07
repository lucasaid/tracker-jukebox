import { FORMATS } from '../formats'
import type { Format, MidiTarget, ParsedFile } from '../formats'
import { LoadError, fetchJson } from '../net'

export interface ManifestEntry {
  /** lowercased path under trackers/ ('mod/12warior.mod'), or 'local:<n>:<file name>' */
  id: string
  /** `./music/${id}`; null for local entries */
  url: string | null
  file: string
  format: Format
  title: string
  tracker: string
  channels: number
  sizeBytes: number
  durationSec: number
  loops: boolean
  sampleNames: string[]
  message: string
  midiTarget: MidiTarget | null
  /** ISO 8601: when the song first appeared in the manifest (scripts/added.json), or when it was dropped */
  addedAt: string
}

export interface Manifest {
  version: 1
  generatedAt: string
  entries: ManifestEntry[]
}

const isRecord = (u: unknown): u is Record<string, unknown> => typeof u === 'object' && u !== null

const isFormat = (u: unknown): u is Format => FORMATS.some((f) => f === u)

/** Every field present with the right type. */
function isEntry(u: unknown): u is ManifestEntry {
  return (
    isRecord(u) &&
    typeof u['id'] === 'string' &&
    (u['url'] === null || typeof u['url'] === 'string') &&
    typeof u['file'] === 'string' &&
    isFormat(u['format']) &&
    typeof u['title'] === 'string' &&
    typeof u['tracker'] === 'string' &&
    typeof u['channels'] === 'number' &&
    typeof u['sizeBytes'] === 'number' &&
    typeof u['durationSec'] === 'number' &&
    typeof u['loops'] === 'boolean' &&
    Array.isArray(u['sampleNames']) &&
    u['sampleNames'].every((n) => typeof n === 'string') &&
    typeof u['message'] === 'string' &&
    (u['midiTarget'] === null || u['midiTarget'] === 'gm' || u['midiTarget'] === 'mt32') &&
    typeof u['addedAt'] === 'string'
  )
}

/** Throws LoadError (network/HTTP/JSON, unsupported version, invalid manifest). */
export async function loadManifest(url = './manifest.json'): Promise<ManifestEntry[]> {
  const data = await fetchJson(url)
  if (!isRecord(data)) throw new LoadError('Invalid manifest', url)
  if (data['version'] !== 1) throw new LoadError('Unsupported manifest version', url)
  const raw = data['entries']
  if (!Array.isArray(raw)) throw new LoadError('Invalid manifest', url)
  const entries: ManifestEntry[] = []
  for (const e of raw as unknown[]) {
    if (isEntry(e)) entries.push(e)
    else console.warn(`Skipping invalid manifest entry: ${JSON.stringify(e)}`)
  }
  return entries
}

/** Shared by scripts/manifest.ts and drag & drop. Never throws. */
export function describe(
  parsed: ParsedFile,
  meta: {
    id: string
    url: string | null
    file: string
    sizeBytes: number
    durationSec: number
    loops: boolean
    addedAt: string
  },
): ManifestEntry {
  const title = parsed.title.trim()
  const isMidi = parsed.kind === 'midi'
  return {
    ...meta,
    format: parsed.format,
    title: title === '' ? meta.file.replace(/\.[^.]*$/, '') : title,
    tracker: parsed.tracker,
    channels: isMidi ? parsed.channelsUsed.length : parsed.channels,
    sampleNames: isMidi ? [] : parsed.samples.map((x) => x.name).filter((n) => n !== ''),
    message: parsed.message,
    midiTarget: isMidi ? parsed.target : null,
  }
}
