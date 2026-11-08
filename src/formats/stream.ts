// MP3 / FLAC header parsing (P29). Only tags and length are read; the browser decodes the audio.
import { ByteReader, ParseError } from './bytes'
import type { StreamFile } from './song'

/** Total ID3v2 tag length (header + body + footer) if one starts at `pos`, else 0. */
export function id3Length(bytes: Uint8Array, pos = 0): number {
  if (bytes.length < pos + 10) return 0
  if (bytes[pos] !== 0x49 || bytes[pos + 1] !== 0x44 || bytes[pos + 2] !== 0x33) return 0 // 'ID3'
  const flags = bytes[pos + 5] ?? 0
  return 10 + synchsafe(bytes, pos + 6) + (flags & 0x10 ? 10 : 0)
}

const synchsafe = (b: Uint8Array, p: number): number =>
  (((b[p] ?? 0) & 0x7f) << 21) |
  (((b[p + 1] ?? 0) & 0x7f) << 14) |
  (((b[p + 2] ?? 0) & 0x7f) << 7) |
  ((b[p + 3] ?? 0) & 0x7f)

const latin1 = (b: Uint8Array): string => {
  let s = ''
  for (const c of b) s += String.fromCharCode(c)
  return s
}

const utf16 = (b: Uint8Array, bigEndian: boolean): string => {
  let s = ''
  for (let i = 0; i + 1 < b.length; i += 2) {
    const hi = b[i] ?? 0
    const lo = b[i + 1] ?? 0
    s += String.fromCharCode(bigEndian ? (hi << 8) | lo : (lo << 8) | hi)
  }
  return s
}

const utf8 = (b: Uint8Array): string => new TextDecoder().decode(b)

/** ID3 text frame body: encoding byte, then text. Only the first of several NUL-separated values. */
export function id3Text(body: Uint8Array): string {
  const enc = body[0]
  const raw = body.subarray(1)
  let s: string
  if (enc === 0) s = latin1(raw)
  else if (enc === 1) {
    const le = raw[0] === 0xff && raw[1] === 0xfe
    const be = raw[0] === 0xfe && raw[1] === 0xff
    s = utf16(raw.subarray(le || be ? 2 : 0), be)
  } else if (enc === 2) s = utf16(raw, true)
  else s = utf8(raw)
  return (s.split('\u0000')[0] ?? '').trim()
}

/** TIT2 / TPE1 from an ID3v2.3 or v2.4 tag at 0. Other versions → empty. */
function readId3(bytes: Uint8Array): { title: string; artist: string } {
  const tags = { title: '', artist: '' }
  const major = bytes[3] ?? 0
  if (major !== 3 && major !== 4) return tags
  const flags = bytes[5] ?? 0
  const end = Math.min(bytes.length, 10 + synchsafe(bytes, 6))
  const r = new ByteReader(bytes, 10)
  if (flags & 0x40) {
    // extended header: v2.3 size excludes its own 4 bytes, v2.4 (synchsafe) includes them
    const at = r.pos
    const size = major === 4 ? synchsafe(bytes, at) : r.u32be() + 4
    r.seek(at + size)
  }
  while (r.pos + 10 <= end) {
    const id = latin1(r.bytes(4))
    if (id.charCodeAt(0) === 0) break // padding
    const size = major === 4 ? synchsafe(bytes, r.pos) : new ByteReader(bytes, r.pos).u32be()
    r.seek(r.pos + 6) // size + flags
    if (r.pos + size > end) break
    const body = r.bytes(size)
    if (id === 'TIT2') tags.title = id3Text(body)
    else if (id === 'TPE1') tags.artist = id3Text(body)
  }
  return tags
}

const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
const RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
}

interface FrameHeader {
  mpeg1: boolean
  sampleRate: number
  kbps: number
  mono: boolean
  bytes: number
}

/** A Layer III frame header at `p`, or null. */
export function mp3Frame(b: Uint8Array, p: number): FrameHeader | null {
  const b1 = b[p + 1] ?? 0
  const b2 = b[p + 2] ?? 0
  if (b[p] !== 0xff || (b1 & 0xe0) !== 0xe0) return null
  const version = (b1 >> 3) & 3
  if (version === 1 || ((b1 >> 1) & 3) !== 1) return null // reserved version, or not Layer III
  const mpeg1 = version === 3
  const kbps = (mpeg1 ? BITRATES_V1 : BITRATES_V2)[b2 >> 4]
  const sampleRate = RATES[version]?.[(b2 >> 2) & 3]
  if (!kbps || !sampleRate) return null // free format, bad index
  const pad = (b2 >> 1) & 1
  const bytes = Math.floor(((mpeg1 ? 144 : 72) * kbps * 1000) / sampleRate) + pad
  return { mpeg1, sampleRate, kbps, mono: (b[p + 3] ?? 0) >> 6 === 3, bytes }
}

const ascii = (b: Uint8Array, p: number, s: string): boolean => {
  for (let i = 0; i < s.length; i++) if (b[p + i] !== s.charCodeAt(i)) return false
  return true
}

// ponytail: scans 64 KB past the tag for the first frame; files with longer junk fail to parse.
const MAX_SCAN = 65536

export function parseMp3(bytes: Uint8Array): StreamFile {
  const { title, artist } = readId3(bytes)
  const start = id3Length(bytes)
  let at = -1
  let h: FrameHeader | null = null
  for (let p = start; p < Math.min(bytes.length, start + MAX_SCAN); p++) {
    h = mp3Frame(bytes, p)
    // a lone 0xFF 0xE? is common in junk: require the next frame to line up too
    if (h && (p + h.bytes >= bytes.length || mp3Frame(bytes, p + h.bytes))) {
      at = p
      break
    }
  }
  if (!h || at < 0) throw new ParseError('No MP3 frame found', start)
  const samplesPerFrame = h.mpeg1 ? 1152 : 576
  const side = h.mpeg1 ? (h.mono ? 17 : 32) : h.mono ? 9 : 17
  const xing = at + 4 + side
  const r = new ByteReader(bytes)
  let frames = 0
  if (ascii(bytes, xing, 'Xing') || ascii(bytes, xing, 'Info')) {
    const flags = r.seek(xing + 4).u32be()
    if (flags & 1) frames = r.u32be()
  } else if (ascii(bytes, at + 36, 'VBRI')) frames = r.seek(at + 36 + 14).u32be()
  let durationSec: number
  if (frames > 0) durationSec = (frames * samplesPerFrame) / h.sampleRate
  else {
    const end = ascii(bytes, bytes.length - 128, 'TAG') ? bytes.length - 128 : bytes.length
    durationSec = ((end - at) * 8) / (h.kbps * 1000)
  }
  return {
    kind: 'stream',
    format: 'mp3',
    title,
    artist,
    tracker: '',
    message: '',
    durationSec,
    sampleRate: h.sampleRate,
    channels: h.mono ? 1 : 2,
  }
}

/** FLAC, optionally behind an ID3v2 tag. */
export function parseFlac(bytes: Uint8Array): StreamFile {
  const r = new ByteReader(bytes, id3Length(bytes))
  if (!ascii(bytes, r.pos, 'fLaC')) throw new ParseError('Not a FLAC file', r.pos)
  r.seek(r.pos + 4)
  let info: { sampleRate: number; channels: number; durationSec: number } | null = null
  let title = ''
  let artist = ''
  for (let last = false; !last;) {
    const head = r.u8()
    last = (head & 0x80) !== 0
    const type = head & 0x7f
    const len = (r.u8() << 16) | r.u16be()
    const block = new ByteReader(r.bytes(len))
    if (type === 0) {
      const b = block.seek(10).bytes(8)
      const at = (i: number): number => b[i] ?? 0
      const sampleRate = (at(0) << 12) | (at(1) << 4) | (at(2) >> 4)
      const channels = ((at(2) >> 1) & 7) + 1
      const total = (at(3) & 0x0f) * 2 ** 32 + new ByteReader(b, 4).u32be()
      if (sampleRate === 0) throw new ParseError('Bad FLAC sample rate', 0)
      info = { sampleRate, channels, durationSec: total / sampleRate }
    } else if (type === 4) {
      const vendorLen = block.u32le()
      block.seek(4 + vendorLen)
      const count = block.u32le()
      for (let i = 0; i < count; i++) {
        const c = utf8(block.bytes(block.u32le()))
        const eq = c.indexOf('=')
        const key = c.slice(0, eq).toUpperCase()
        const value = c.slice(eq + 1).trim()
        if (key === 'TITLE' && title === '') title = value
        else if (key === 'ARTIST' && artist === '') artist = value
      }
    }
  }
  if (!info) throw new ParseError('No FLAC STREAMINFO', 4)
  return { kind: 'stream', format: 'flac', title, artist, tracker: '', message: '', ...info }
}
