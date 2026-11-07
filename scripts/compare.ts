// pnpm compare — see docs/PLAN.md → Contracts → Script contracts.
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTrackerPlayer } from '../src/engine'
import { parseFile } from '../src/formats'
import type { TrackerFormat } from '../src/formats'
import { readWav } from './wav'

const MAX_DURATION_DELTA_SEC = 1
const MAX_DB_DELTA = 3
const MIN_CORR = 0.9
const RATE = 48000
const ENVELOPE_SEC = 0.1
const MAX_SECONDS = 1800
const CHUNK = 4096
const FORMATS: readonly string[] = ['mod', 'stm', 's3m', '669', 'mtm']

const root = fileURLToPath(new URL('..', import.meta.url))
const trackers = join(root, 'trackers')
const out = (line: string): void => void process.stdout.write(`${line}\n`)

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]))
}

/** Stereo render with our engine, as `render` does (nearest, full separation). */
function renderOurs(bytes: Uint8Array): {
  l: Float32Array
  r: Float32Array
  format: TrackerFormat
} {
  const song = parseFile(bytes)
  if (song.kind !== 'tracker') throw new Error('not a tracker file')
  const player = createTrackerPlayer(song, RATE, { interpolation: 'nearest', stereoSeparation: 1 })
  const ls: Float32Array[] = []
  const rs: Float32Array[] = []
  const l = new Float32Array(CHUNK)
  const r = new Float32Array(CHUNK)
  let frames = 0
  while (!player.ended && frames < MAX_SECONDS * RATE) {
    const n = player.render(l, r, CHUNK)
    ls.push(l.slice(0, n))
    rs.push(r.slice(0, n))
    frames += n
  }
  const join2 = (parts: Float32Array[]): Float32Array => {
    const o = new Float32Array(frames)
    let at = 0
    for (const p of parts) {
      o.set(p, at)
      at += p.length
    }
    return o
  }
  return { l: join2(ls), r: join2(rs), format: song.format }
}

const rms = (chs: Float32Array[]): number => {
  let sum = 0
  let n = 0
  for (const c of chs)
    for (let i = 0; i < c.length; i++) {
      sum += (c[i] as number) ** 2
      n++
    }
  return n > 0 ? Math.sqrt(sum / n) : 0
}
const toDb = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -Infinity)

/** 100 ms RMS windows over the mono-summed signal. */
function envelope(chs: Float32Array[]): number[] {
  const win = Math.round(RATE * ENVELOPE_SEC)
  const len = chs[0]?.length ?? 0
  const env: number[] = []
  for (let at = 0; at + win <= len; at += win) {
    let sum = 0
    for (let i = at; i < at + win; i++) {
      let m = 0
      for (const c of chs) m += c[i] as number
      sum += (m / chs.length) ** 2
    }
    env.push(Math.sqrt(sum / win))
  }
  return env
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  let ma = 0
  let mb = 0
  for (let i = 0; i < n; i++) {
    ma += a[i] as number
    mb += b[i] as number
  }
  ma /= n
  mb /= n
  let sab = 0
  let saa = 0
  let sbb = 0
  for (let i = 0; i < n; i++) {
    const da = (a[i] as number) - ma
    const db = (b[i] as number) - mb
    sab += da * db
    saa += da * da
    sbb += db * db
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0
}

// Verify the openmpt123 flags we depend on (plan rule 6) before comparing anything.
const help = spawnSync('openmpt123', ['--help'], { encoding: 'utf8' })
if (help.error || help.status !== 0) {
  process.stderr.write('openmpt123 not found. Install it with: brew install libopenmpt\n')
  process.exit(2)
}
for (const flag of [
  '--batch',
  '--render',
  '--force',
  '--samplerate',
  '--channels',
  '--filter',
  '--stereo',
  '--repeat',
])
  if (!help.stdout.includes(flag)) {
    process.stderr.write(`openmpt123 --help has no ${flag}; stopping (plan rule 6)\n`)
    process.exit(1)
  }

const arg = process.argv[2]
const byFormat = arg !== undefined && FORMATS.includes(arg)
const tmp = mkdtempSync(`${tmpdir()}/tj-compare-`)
const rows: { format: TrackerFormat; dbDelta: number }[] = []
let failed = false

out('id · ours s · ref s · Δs · ΔdB · corr · result')
try {
  for (const path of walk(trackers)) {
    const id = relative(trackers, path).split(sep).join('/').toLowerCase()
    if (arg !== undefined && !byFormat && !id.includes(arg.toLowerCase())) continue
    try {
      const bytes = new Uint8Array(readFileSync(path))
      let ours
      try {
        ours = renderOurs(bytes)
      } catch {
        continue // MIDI and unparseable files are not compare targets
      }
      if (byFormat && ours.format !== arg) continue
      const tmpFile = join(tmp, basename(path))
      copyFileSync(path, tmpFile)
      const run = spawnSync(
        'openmpt123',
        [
          '--batch',
          '--render',
          '--force',
          '--samplerate',
          String(RATE),
          '--channels',
          '2',
          '--filter',
          '1',
          '--stereo',
          '100',
          '--repeat',
          '0',
          tmpFile,
        ],
        { encoding: 'utf8' },
      )
      if (run.status !== 0) throw new Error(`openmpt123 exit ${run.status}`)
      const ref = readWav(`${tmpFile}.wav`)
      const refCh = ref.channels.length === 1 ? [ref.channels[0] as Float32Array] : ref.channels
      const oursSec = ours.l.length / RATE
      const refSec = (refCh[0]?.length ?? 0) / ref.sampleRate
      const dSec = oursSec - refSec
      const dDb = toDb(rms([ours.l, ours.r])) - toDb(rms(refCh))
      const corr = pearson(envelope([ours.l, ours.r]), envelope(refCh))
      const pass =
        Math.abs(dSec) <= MAX_DURATION_DELTA_SEC &&
        Math.abs(dDb) <= MAX_DB_DELTA &&
        corr >= MIN_CORR
      if (!pass) failed = true
      if (Number.isFinite(dDb)) rows.push({ format: ours.format, dbDelta: dDb })
      out(
        `${id} · ${oursSec.toFixed(1)} · ${refSec.toFixed(1)} · ${dSec.toFixed(1)} · ${dDb.toFixed(1)} · ${corr.toFixed(3)} · ${pass ? 'PASS' : 'FAIL'}`,
      )
    } catch (e) {
      failed = true
      out(`${id} · ERROR ${e instanceof Error ? e.message : String(e)}`)
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

// Mean ΔdB per format: the FORMAT_GAIN calibration input (decision 17).
for (const f of FORMATS) {
  const d = rows.filter((x) => x.format === f).map((x) => x.dbDelta)
  if (d.length > 0)
    out(
      `mean ΔdB ${f}: ${(d.reduce((a, b) => a + b, 0) / d.length).toFixed(2)} (${d.length} files)`,
    )
}
process.exitCode = failed ? 1 : 0
