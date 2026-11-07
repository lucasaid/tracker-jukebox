// pnpm manage — local-only library manager (never deployed). Lists everything in trackers/,
// lets you exclude files, override titles and pick MIDI targets, then rebuilds the manifest.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, sep } from 'node:path'
import { computeLength } from '../src/engine'
import { parseFile } from '../src/formats'
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

const HOST = '127.0.0.1' // loopback only: the manager writes files in the repo
const PORT = 5198
const MAX_BODY_BYTES = 1024 * 1024

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
