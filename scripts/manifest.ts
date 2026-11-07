// pnpm manifest — see docs/PLAN.md → Contracts → Script contracts.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeLength } from '../src/engine'
import { parseFile } from '../src/formats'
import type { MidiTarget } from '../src/formats'
import { describe } from '../src/library/manifest'
import type { Manifest, ManifestEntry } from '../src/library/manifest'

const root = fileURLToPath(new URL('..', import.meta.url))
const trackers = join(root, 'trackers')
const musicDir = join(root, 'public', 'music')

/** All files under dir, dotfiles skipped, sorted. */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]))
}

/** id → MidiTarget; anything else in the JSON is a hard error. */
function loadOverrides(): Record<string, MidiTarget> {
  const raw: unknown = JSON.parse(
    readFileSync(join(root, 'scripts', 'midi-overrides.json'), 'utf8'),
  )
  if (typeof raw !== 'object' || raw === null) throw new Error('midi-overrides.json: not an object')
  const result: Record<string, MidiTarget> = {}
  for (const [id, v] of Object.entries(raw)) {
    if (v !== 'gm' && v !== 'mt32') throw new Error(`midi-overrides.json: bad target for ${id}`)
    result[id] = v
  }
  return result
}
const overrides = loadOverrides()

const out = (line: string): void => void process.stdout.write(`${line}\n`)

const entries: ManifestEntry[] = []
const ok: { path: string; id: string }[] = []
let skipped = 0

for (const path of walk(trackers)) {
  const id = relative(trackers, path).split(sep).join('/').toLowerCase()
  const bytes = new Uint8Array(readFileSync(path))
  try {
    const parsed = parseFile(bytes, { midiTarget: overrides[id] ?? 'gm' })
    const { seconds, loops } = computeLength(parsed)
    entries.push(
      describe(parsed, {
        id,
        url: `./music/${id}`,
        file: path.slice(path.lastIndexOf(sep) + 1),
        sizeBytes: bytes.length,
        durationSec: seconds,
        loops,
      }),
    )
    ok.push({ path, id })
    const s = Math.round(seconds)
    out(
      `OK ${id} ${parsed.kind === 'midi' ? parsed.channelsUsed.length : parsed.channels}ch ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
    )
  } catch (e) {
    skipped++
    out(`SKIP ${id}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// Wipe first so files removed from trackers/ never linger in the build.
rmSync(musicDir, { recursive: true, force: true })
for (const { path, id } of ok) {
  const dest = join(musicDir, ...id.split('/'))
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(path, dest)
}
const manifest: Manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  entries: entries.sort((a, b) => a.id.localeCompare(b.id)),
}
writeFileSync(join(root, 'public', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

out(`${ok.length} ok, ${skipped} skipped`)
process.exitCode = ok.length > 0 ? 0 : 1
