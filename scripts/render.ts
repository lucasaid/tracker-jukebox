// pnpm render — see docs/PLAN.md → Contracts → Script contracts.
import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { createTrackerPlayer } from '../src/engine'
import type { Interpolation } from '../src/engine'
import { parseFile } from '../src/formats'
import { writeWav } from './wav'

const MAX_SECONDS = 1800
const CHUNK = 4096

const fail = (code: number, msg: string): never => {
  process.stderr.write(`${msg}\n`)
  return process.exit(code)
}
const usage = (): never =>
  fail(
    2,
    'usage: pnpm render <file> [out.wav] [--interp nearest|linear|cubic] [--sep 0..100] [--rate <Hz>]',
  )

const positional: string[] = []
let interp: Interpolation = 'nearest'
let sep = 100
let rate = 48000
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i] as string
  if (a === '--interp') {
    const v = argv[++i]
    if (v !== 'nearest' && v !== 'linear' && v !== 'cubic') usage()
    interp = v as Interpolation
  } else if (a === '--sep') {
    sep = Number(argv[++i])
    if (!(sep >= 0 && sep <= 100)) usage()
  } else if (a === '--rate') {
    rate = Number(argv[++i])
    if (!Number.isInteger(rate) || rate <= 0) usage()
  } else if (a.startsWith('--')) usage()
  else positional.push(a)
}
const [input, output] = positional
if (input === undefined || positional.length > 2) usage()
const outPath = output ?? `./${basename(input as string, extname(input as string))}.wav`

let song
try {
  song = parseFile(new Uint8Array(readFileSync(input as string)))
} catch (e) {
  fail(1, `${input}: ${e instanceof Error ? e.message : String(e)}`)
}
if (song?.kind !== 'tracker') fail(1, `${input}: only tracker files can be rendered yet`)
else {
  const player = createTrackerPlayer(song, rate, {
    interpolation: interp,
    stereoSeparation: sep / 100,
  })
  const lefts: Float32Array[] = []
  const rights: Float32Array[] = []
  const l = new Float32Array(CHUNK)
  const r = new Float32Array(CHUNK)
  let frames = 0
  let peak = 0
  while (!player.ended && frames < MAX_SECONDS * rate) {
    const n = player.render(l, r, CHUNK)
    lefts.push(l.slice(0, n))
    rights.push(r.slice(0, n))
    frames += n
    for (let i = 0; i < n; i++)
      peak = Math.max(peak, Math.abs(l[i] as number), Math.abs(r[i] as number))
  }
  const join = (parts: Float32Array[]): Float32Array => {
    const out = new Float32Array(frames)
    let at = 0
    for (const p of parts) {
      out.set(p, at)
      at += p.length
    }
    return out
  }
  try {
    writeWav(outPath, join(lefts), join(rights), rate)
  } catch (e) {
    fail(1, `${outPath}: ${e instanceof Error ? e.message : String(e)}`)
  }
  const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity
  process.stdout.write(`${(frames / rate).toFixed(1)}s peak ${db.toFixed(1)} dBFS\n`)
}
