// pnpm manage — local-only library manager (never deployed). Lists everything in trackers/,
// lets you exclude files, override titles and pick MIDI targets, then rebuilds the manifest.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, sep } from 'node:path'
import { computeLength, createMidiPlayer, createTrackerPlayer } from '../src/engine'
import { parseFile, parseSoundBank } from '../src/formats'
import type { SoundBank } from '../src/formats'
import { describe } from '../src/library/manifest'
import {
  idOf,
  loadCuration,
  parseCuration,
  root,
  saveCuration,
  trackersDir,
  walk,
} from './curation'
import { encodeWav } from './wav'

const HOST = '127.0.0.1' // loopback only: the manager writes files in the repo
const PORT = 5198
const MAX_BODY_BYTES = 1024 * 1024
// ponytail: previews are the first 60 s, rendered whole before sending (~10 MB WAV);
// stream it in chunks or add a start offset if longer previews are wanted
const PREVIEW_SEC = 60
const PREVIEW_HZ = 44100
const BANK_PATH = join(root, 'public', 'soundfonts', 'GeneralUser-GS.sf2')
let bank: SoundBank | null = null // parsed on the first MIDI preview, then kept

interface FileRow {
  id: string
  file: string
  sizeBytes: number
  format: string | null
  parsedTitle: string
  tracker: string
  channels: number
  durationSec: number
  loops: boolean
  message: string
  error: string | null
}

/** Parses every file fresh, so the page always reflects trackers/ as it is now. */
function scan(): FileRow[] {
  const { midi } = loadCuration()
  return walk(trackersDir).map((path) => {
    const id = idOf(path)
    const bytes = new Uint8Array(readFileSync(path))
    const base = { id, file: path.slice(path.lastIndexOf(sep) + 1), sizeBytes: bytes.length }
    try {
      const parsed = parseFile(bytes, { midiTarget: midi[id] ?? 'gm' })
      const { seconds, loops } = computeLength(parsed)
      const e = describe(parsed, { ...base, url: null, durationSec: seconds, loops })
      return {
        ...base,
        format: e.format,
        parsedTitle: e.title,
        tracker: e.tracker,
        channels: e.channels,
        durationSec: e.durationSec,
        loops: e.loops,
        message: e.message,
        error: null,
      }
    } catch (err) {
      return {
        ...base,
        format: null,
        parsedTitle: '',
        tracker: '',
        channels: 0,
        durationSec: 0,
        loops: false,
        message: '',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })
}

/** Renders the start of a file with our engine, as WAV bytes. `id` must be a file in trackers/. */
function preview(id: string, midiTarget: 'gm' | 'mt32'): Uint8Array {
  const path = walk(trackersDir).find((p) => idOf(p) === id) // never a path built from input
  if (!path) throw new Error(`Unknown file: ${id}`)
  const song = parseFile(new Uint8Array(readFileSync(path)), { midiTarget })
  let player
  if (song.kind === 'tracker') player = createTrackerPlayer(song, PREVIEW_HZ)
  else {
    bank ??= parseSoundBank(new Uint8Array(readFileSync(BANK_PATH)))
    player = createMidiPlayer(song, bank, PREVIEW_HZ)
  }
  const frames = PREVIEW_SEC * PREVIEW_HZ
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  const n = player.render(left, right, frames)
  return encodeWav(left.subarray(0, n), right.subarray(0, n), PREVIEW_HZ)
}

/** Runs `pnpm manifest` and returns its output. */
function rebuild(): Promise<{ ok: boolean; log: string }> {
  return new Promise((resolve) => {
    const child = spawn('pnpm', ['-s', 'manifest'], { cwd: root })
    let log = ''
    child.stdout.on('data', (d: Buffer) => (log += d.toString()))
    child.stderr.on('data', (d: Buffer) => (log += d.toString()))
    child.on('error', (err) => resolve({ ok: false, log: `${log}${err.message}\n` }))
    child.on('close', (code) => resolve({ ok: code === 0, log }))
  })
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
      if (body.length > MAX_BODY_BYTES) reject(new Error('Body too large'))
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

const send = (res: ServerResponse, status: number, type: string, body: string): void => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(body)
}
const json = (res: ServerResponse, status: number, value: unknown): void =>
  send(res, status, 'application/json', JSON.stringify(value))

const HOSTS = new Set([`${HOST}:${PORT}`, `localhost:${PORT}`])

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Rejects DNS-rebinding requests that reach the loopback port under a foreign host name.
  if (!HOSTS.has(req.headers.host ?? '')) return send(res, 403, 'text/plain', 'Forbidden host')
  if (req.method === 'GET' && req.url === '/') {
    send(
      res,
      200,
      'text/html; charset=utf-8',
      readFileSync(join(root, 'scripts', 'manage.html'), 'utf8'),
    )
  } else if (req.method === 'GET' && req.url?.startsWith('/api/preview?')) {
    const q = new URL(req.url, `http://${HOST}`).searchParams
    try {
      const wav = preview(q.get('id') ?? '', q.get('midi') === 'mt32' ? 'mt32' : 'gm')
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length })
      res.end(wav)
    } catch (err) {
      send(res, 400, 'text/plain', err instanceof Error ? err.message : 'Preview failed')
    }
  } else if (req.method === 'GET' && req.url === '/api/state') {
    json(res, 200, { files: scan(), curation: loadCuration() })
  } else if (req.method === 'POST' && req.url === '/api/save') {
    // Same-origin only: a page on another site must not be able to rewrite the library.
    if (req.headers['content-type'] !== 'application/json')
      return json(res, 415, { error: 'Expected application/json' })
    let curation
    try {
      curation = parseCuration(JSON.parse(await readBody(req)) as unknown)
    } catch (err) {
      return json(res, 400, { error: err instanceof Error ? err.message : 'Bad request' })
    }
    saveCuration(curation)
    json(res, 200, await rebuild())
  } else {
    send(res, 404, 'text/plain', 'Not found')
  }
}

createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`)
    if (!res.headersSent) json(res, 500, { error: 'Internal error' })
  })
}).listen(PORT, HOST, () => {
  process.stdout.write(`Library manager: http://${HOST}:${PORT}/  (Ctrl+C to stop)\n`)
})
