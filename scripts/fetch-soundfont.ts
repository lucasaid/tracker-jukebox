// pnpm fetch-soundfont — see docs/PLAN.md → Contracts → Script contracts.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// GeneralUser GS v2.0.3 (license v2.0), pinned to a commit so the hash can't drift.
const SOUNDFONT_URL =
  'https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/97049183643d5fc5a9322a69c5b09efb667c6c3a/GeneralUser-GS.sf2'
const SOUNDFONT_SHA256 = '9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe'

const dest = join(
  fileURLToPath(new URL('..', import.meta.url)),
  'public',
  'soundfonts',
  'GeneralUser-GS.sf2',
)
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')
const say = (s: string): void => void process.stdout.write(`${s}\n`)

async function main(): Promise<void> {
  if (existsSync(dest) && sha256(readFileSync(dest)) === SOUNDFONT_SHA256) {
    say('GeneralUser-GS.sf2 already present, skipped')
    return
  }
  // Delete first: a stale or partial file must never survive a failed run.
  rmSync(dest, { force: true })
  const res = await fetch(SOUNDFONT_URL)
  if (res.status !== 200) throw new Error(`download failed: HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  const got = sha256(bytes)
  if (got !== SOUNDFONT_SHA256) throw new Error(`SHA-256 mismatch: got ${got}`)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, bytes)
  say(`GeneralUser-GS.sf2 downloaded, ${bytes.length} bytes, SHA-256 ok`)
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
  process.exitCode = 1
})
