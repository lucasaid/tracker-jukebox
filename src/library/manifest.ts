import type { Format, MidiTarget, ParsedFile } from '../formats'

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
}

export interface Manifest {
  version: 1
  generatedAt: string
  entries: ManifestEntry[]
}

/** Throws LoadError (network/HTTP/JSON, unsupported version, invalid manifest). */
export function loadManifest(_url = './manifest.json'): Promise<ManifestEntry[]> {
  throw new Error('Not implemented (P8)')
}

/** Shared by scripts/manifest.ts and drag & drop. Never throws. */
export function describe(
  _parsed: ParsedFile,
  _meta: {
    id: string
    url: string | null
    file: string
    sizeBytes: number
    durationSec: number
    loops: boolean
  },
): ManifestEntry {
  throw new Error('Not implemented (P8)')
}
