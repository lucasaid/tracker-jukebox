// pnpm manifest — see docs/PLAN.md → Contracts → Script contracts.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { computeLength } from '../src/engine'
import { parseFile } from '../src/formats'
import { describe } from '../src/library/manifest'
import type { Manifest, ManifestEntry } from '../src/library/manifest'
import { idOf, loadCuration, root, trackersDir, walk } from './curation'

const musicDir = join(root, 'public', 'music')
// Exclusions and title overrides from scripts/curation.json (edited with `pnpm manage`, decision 50).
const curation = loadCuration()
const excluded = new Set(curation.exclude)
// id → ISO date the song first showed up here. Only this script writes it, so `pnpm manage` saves can't drop it.
const ADDED_PATH = join(root, 'scripts', 'added.json')
const rawAdded: unknown = existsSync(ADDED_PATH) ? JSON.parse(readFileSync(ADDED_PATH, 'utf8')) : {}
const added: Record<string, string> = {}
if (typeof rawAdded === 'object' && rawAdded !== null)
  for (const [id, v] of Object.entries(rawAdded)) if (typeof v === 'string') added[id] = v
const now = new Date().toISOString()

const out = (line: string): void => void process.stdout.write(`${line}\n`)

const entries: ManifestEntry[] = []
const ok: { path: string; id: string }[] = []
let skipped = 0
let excludedCount = 0

for (const path of walk(trackersDir)) {
  const id = idOf(path)
  if (excluded.has(id)) {
    excludedCount++
    out(`EXCLUDE ${id}`)
    continue
  }
  const bytes = new Uint8Array(readFileSync(path))
  try {
    const parsed = parseFile(bytes, { midiTarget: curation.midi[id] ?? 'gm' })
    const { seconds, loops } = computeLength(parsed)
    const entry = describe(parsed, {
      id,
      url: `./music/${id}`,
      file: path.slice(path.lastIndexOf(sep) + 1),
      sizeBytes: bytes.length,
      durationSec: seconds,
      loops,
      addedAt: (added[id] ??= now),
    })
    entries.push({ ...entry, title: curation.titles[id] ?? entry.title })
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
// Stamps persist for excluded or removed songs too, so re-adding one keeps its original date.
writeFileSync(
  ADDED_PATH,
  `${JSON.stringify(Object.fromEntries(Object.entries(added).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`,
)
writeFileSync(join(root, 'public', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

out(
  `${ok.length} ok, ${skipped} skipped` + (excludedCount > 0 ? `, ${excludedCount} excluded` : ''),
)
process.exitCode = ok.length > 0 ? 0 : 1
