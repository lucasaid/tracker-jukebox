import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ByteReader,
  ParseError,
  decodeCp437,
  MT32_TO_GM,
  detectFormat,
  parseFile,
  parseSoundBank,
} from './index'
import { parseMod } from './mod'
import { parseStm } from './stm'
import type { Format, Song } from './index'

const load = (rel: string): Uint8Array => new Uint8Array(readFileSync(`trackers/${rel}`))

const EXPECTED: Record<string, Format> = {
  '669/CANTINA.669': 'mod',
  's3m/KTULHU.STM': 'stm',
}
const FILES = {
  '669': ['CIRCUS', 'EVILGIRL', 'FX-SOBER', 'LITHIUM', 'NEW', 'NUDEMOUS', 'SIRIUS', 'TFA'].map(
    (n) => `669/${n}.669`,
  ),
  midi: ['99WAYS', 'BLACKCAT', 'BLAKLDGE', 'BUMBLE', 'DANNYBOY', 'JAZZVIBE', 'JUNGLE'].map(
    (n) => `midi/${n}.MID`,
  ),
  mod: ['12WARIOR', '1CARESS', '4BLOUNDS', '90210'].map((n) => `mod/${n}.MOD`),
  mtm: ['COOLASS', 'CREEPING', 'EXCUSES', 'HEART', 'JUSTICE', 'MASTER', 'SOCRUEL'].map(
    (n) => `mtm/${n}.MTM`,
  ),
  s3m: [
    '2ND_PM',
    'DOOMMUS1',
    'FEARDARK',
    'FINERUN',
    'ICEFRONT',
    'NIN-1',
    'NOTFKIDS',
    'PANIC',
    'WISHBMIT',
    'XFILES',
  ].map((n) => `s3m/${n}.S3M`),
}
for (const [fmt, files] of Object.entries(FILES)) for (const f of files) EXPECTED[f] = fmt as Format

describe('detectFormat', () => {
  it('covers all 38 files', () => {
    expect(Object.keys(EXPECTED)).toHaveLength(38)
  })
  it.each(Object.entries(EXPECTED))('%s → %s', (file, fmt) => {
    expect(detectFormat(load(file))).toBe(fmt)
  })
  it('returns null for zeros', () => {
    expect(detectFormat(new Uint8Array(100))).toBeNull()
  })
})

describe('ByteReader', () => {
  it('throws ParseError at offset 0 on short u32le', () => {
    const run = (): number => new ByteReader(new Uint8Array(2)).u32le()
    expect(run).toThrow(ParseError)
    try {
      run()
    } catch (e) {
      expect((e as ParseError).offset).toBe(0)
    }
  })
  it('reads endian values and text', () => {
    const r = new ByteReader(new Uint8Array([1, 2, 3, 4, 0xff, 65, 66, 32, 0, 67]))
    expect(r.u16le()).toBe(0x0201)
    expect(r.u16be()).toBe(0x0304)
    expect(r.i8()).toBe(-1)
    expect(r.text(5)).toBe('AB')
    expect(r.seek(0).u32be()).toBe(0x01020304)
    expect(() => r.seek(11)).toThrow(ParseError)
  })
})

describe('decodeCp437', () => {
  it('maps control and high bytes, keeps ASCII', () => {
    expect(decodeCp437(new Uint8Array([0x0e, 0xb0]))).toBe('♫░')
    expect(decodeCp437(new Uint8Array([72, 105, 33]))).toBe('Hi!')
  })
})

const song = (rel: string): Song => {
  const s = parseFile(load(rel))
  if (s.kind !== 'tracker') throw new Error('expected tracker')
  return s
}

describe('MOD + STM parsers', () => {
  it('12WARIOR', () => {
    const s = song('mod/12WARIOR.MOD')
    expect([s.channels, s.orders.length, s.patterns.length]).toEqual([4, 30, 23])
  })
  it('90210', () => {
    const s = song('mod/90210.MOD')
    expect(s.title).toBe('Beverly Hills 90210')
    expect(s.samples[0]?.name).toBe('BASS.SAM')
    expect([s.channels, s.orders.length]).toEqual([4, 13])
  })
  it('1CARESS', () => {
    const s = song('mod/1CARESS.MOD')
    expect(s.samples[0]?.name).toBe('Empire BBS')
    expect(s.samples[1]?.name).toBe('679-0488')
  })
  it('CANTINA (8CHN MOD)', () => {
    const s = song('669/CANTINA.669')
    expect(s.format).toBe('mod')
    expect([s.channels, s.orders.length, s.patterns.length, s.title]).toEqual([
      8,
      17,
      17,
      'Cantina band',
    ])
  })
  it('KTULHU', () => {
    const s = song('s3m/KTULHU.STM')
    expect(s.format).toBe('stm')
    expect([s.title, s.channels, s.patterns.length]).toEqual(['the call of ktulu', 4, 42])
  })
  // parseFile can't see these: detectFormat needs 1084 bytes for a MOD, so a 600-byte MOD is
  // 'unknown format'. The parsers themselves must throw ParseError.
  it.each([
    ['mod/12WARIOR.MOD', parseMod],
    ['mod/90210.MOD', parseMod],
    ['mod/1CARESS.MOD', parseMod],
    ['669/CANTINA.669', parseMod],
    ['s3m/KTULHU.STM', parseStm],
  ] as const)('%s truncated to 600 bytes throws ParseError', (file, parse) => {
    expect(() => parse(load(file).subarray(0, 600))).toThrow(ParseError)
  })
})

describe('S3M parser', () => {
  const s3mFiles = Object.entries(EXPECTED)
    .filter(([, f]) => f === 's3m')
    .map(([file]) => file)

  it('PANIC', () => {
    const s = song('s3m/PANIC.S3M')
    expect([s.title, s.channels, s.samples.length, s.patterns.length]).toEqual(['', 16, 56, 62])
  })
  it('NIN-1', () => {
    const s = song('s3m/NIN-1.S3M')
    expect([s.title, s.channels, s.stereo]).toEqual(['NIN Melody Re-Mix I', 16, false])
  })
  it('NOTFKIDS', () => {
    expect(song('s3m/NOTFKIDS.S3M').channels).toBe(4)
  })
  it.each(s3mFiles)('%s has no 254/255 orders', (file) => {
    const s = song(file)
    expect(s.orders.length).toBeGreaterThan(0)
    expect(s.orders.some((o) => o >= 254)).toBe(false)
  })
  it.each(s3mFiles)('%s first non-empty sample is centred', (file) => {
    const d = song(file).samples.find((x) => x.data.length > 0)?.data
    expect(d).toBeDefined()
    const mean = (d ?? new Float32Array(1)).reduce((a, b) => a + b, 0) / (d?.length ?? 1)
    expect(Math.abs(mean)).toBeLessThan(0.2)
  })
})

describe('MTM + 669 parsers', () => {
  it('MASTER', () => {
    const s = song('mtm/MASTER.MTM')
    expect([s.title, s.channels, s.patterns.length, s.orders.length]).toEqual([
      'Master Of Puppets',
      4,
      106,
      97,
    ])
    expect(s.message).toContain('Forensic Medicine')
  })
  it('SIRIUS', () => {
    const s = song('669/SIRIUS.669')
    expect([s.samples.length, s.patterns.length, s.title]).toEqual([6, 10, 'Sirius of Canis Major'])
  })
  it('all 31 tracker files parse', () => {
    const files = Object.entries(EXPECTED).filter(([, f]) => f !== 'midi')
    expect(files).toHaveLength(31)
    for (const [file, fmt] of files) expect(song(file).format).toBe(fmt)
  })
})

describe('MIDI parser', () => {
  const midi = (file: string, target?: 'gm' | 'mt32') => {
    const s = parseFile(load(file), target ? { midiTarget: target } : undefined)
    if (s.kind !== 'midi') throw new Error('not midi')
    return s
  }
  it('99WAYS track names, override target', () => {
    const s = midi('midi/99WAYS.MID')
    for (const n of ['Guitar 1', 'Guitar 2', 'Bass', 'Fill Guitar']) expect(s.message).toContain(n)
    expect(s.target).toBe('gm')
    const overrides: unknown = JSON.parse(readFileSync('scripts/midi-overrides.json', 'utf8'))
    expect(overrides).toMatchObject({ 'midi/99ways.mid': 'mt32' })
    expect(midi('midi/99WAYS.MID', 'mt32').target).toBe('mt32')
  })
  it('JAZZVIBE', () => {
    const s = midi('midi/JAZZVIBE.MID')
    expect(s.ticksPerBeat).toBe(480)
    expect(s.tempoMap[0]?.tick).toBe(0)
  })
  it('all 7 MIDI files parse with sorted events', () => {
    for (const f of FILES.midi) {
      const s = midi(f)
      expect(s.channelsUsed.length).toBeGreaterThan(0)
      expect(s.events.every((e, i) => i === 0 || (s.events[i - 1]?.tick ?? 0) <= e.tick)).toBe(true)
    }
  })
  it('rejects SMF format 2 and SMPTE', () => {
    const hdr = (fmt: number, div: number) =>
      new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, fmt, 0, 0, div >> 8, div & 255])
    expect(() => parseFile(hdr(2, 96))).toThrow('SMF format 2')
    expect(() => parseFile(hdr(1, 0xe728))).toThrow('SMPTE timing')
  })
})

const BANK_PATH = 'public/soundfonts/GeneralUser-GS.sf2'
describe.skipIf(!existsSync(BANK_PATH))('SF2 parser', () => {
  const bank = parseSoundBank(new Uint8Array(readFileSync(BANK_PATH)))
  it('has ≥ 128 presets in bank 0 and a drum kit at bank 128', () => {
    const bank0 = [...bank.presets.keys()].filter((k) => k < 128)
    expect(bank0.length).toBeGreaterThanOrEqual(128)
    expect(bank.presets.has(128 * 128)).toBe(true)
  })
  it('every zone has keyLo ≤ keyHi and data', () => {
    for (const p of bank.presets.values())
      for (const z of p.zones) {
        expect(z.keyLo).toBeLessThanOrEqual(z.keyHi)
        expect(z.data.length).toBeGreaterThan(0)
      }
  })
  it('rejects non-SF2 input', () => {
    expect(() => parseSoundBank(new Uint8Array(64))).toThrow(ParseError)
  })
})

describe('MT32_TO_GM', () => {
  it('has 128 GM programs, guitars in 24..31 and basses in 32..39', () => {
    expect(MT32_TO_GM).toHaveLength(128)
    expect(MT32_TO_GM.every((p) => Number.isInteger(p) && p >= 0 && p <= 127)).toBe(true)
    expect(MT32_TO_GM[61]).toBeGreaterThanOrEqual(24)
    expect(MT32_TO_GM[61]).toBeLessThanOrEqual(31)
    expect(MT32_TO_GM[64]).toBeGreaterThanOrEqual(32)
    expect(MT32_TO_GM[64]).toBeLessThanOrEqual(39)
  })
})

// --- MP3 / FLAC (P29) ---------------------------------------------------------------------------

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))
const be32 = (n: number): number[] => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const le32 = (n: number): number[] => be32(n).reverse()
const sync = (n: number): number[] => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]

/** MPEG-1 Layer III, 128 kbps, 44.1 kHz, stereo: 417-byte frames. */
const FRAME_BYTES = 417
const frame = (body: number[] = []): number[] => {
  const f = new Array<number>(FRAME_BYTES).fill(0)
  f.splice(0, 4, 0xff, 0xfb, 0x90, 0x00)
  f.splice(4, body.length, ...body)
  return f
}
const frames = (n: number): number[] => Array.from({ length: n }, () => frame()).flat()

/** ID3v2 tag with text frames (encoding byte included in each body). */
const id3 = (major: 3 | 4, tags: [string, number[]][]): number[] => {
  const body = tags.flatMap(([id, b]) => [
    ...ascii(id),
    ...(major === 4 ? sync(b.length) : be32(b.length)),
    0,
    0,
    ...b,
  ])
  return [...ascii('ID3'), major, 0, 0, ...sync(body.length), ...body]
}
const utf16le = (s: string): number[] => [
  0xff,
  0xfe,
  ...[...s].flatMap((c) => [c.charCodeAt(0), 0]),
]
const utf16be = (s: string): number[] => [...s].flatMap((c) => [0, c.charCodeAt(0)])

const flac = (blocks: { type: number; body: number[] }[]): number[] => [
  ...ascii('fLaC'),
  ...blocks.flatMap((b, i) => [
    (i === blocks.length - 1 ? 0x80 : 0) | b.type,
    (b.body.length >> 16) & 255,
    (b.body.length >> 8) & 255,
    b.body.length & 255,
    ...b.body,
  ]),
]
/** 48 kHz, stereo, 16-bit, 96000 samples → 2 s. */
const STREAMINFO = {
  type: 0,
  body: [
    ...new Array<number>(10).fill(0),
    0x0b,
    0xb8,
    0x02,
    0xf0,
    ...be32(96000),
    ...new Array<number>(16).fill(0),
  ],
}
const vorbis = (comments: string[]) => ({
  type: 4,
  body: [
    ...le32(1),
    ...ascii('x'),
    ...le32(comments.length),
    ...comments.flatMap((c) => [...le32(c.length), ...ascii(c)]),
  ],
})

describe('MP3 / FLAC headers', () => {
  const u8 = (a: number[]): Uint8Array => new Uint8Array(a)
  it('detects FLAC, ID3-tagged MP3, bare-frame MP3 and ID3-tagged FLAC', () => {
    expect(detectFormat(u8(flac([STREAMINFO])))).toBe('flac')
    expect(detectFormat(u8([...id3(4, []), ...frames(2)]))).toBe('mp3')
    expect(detectFormat(u8(frames(2)))).toBe('mp3')
    expect(detectFormat(u8([...id3(3, []), ...flac([STREAMINFO])]))).toBe('flac')
  })
  it('reads ID3 text in all four encodings', () => {
    const v4 = parseFile(
      u8([
        ...id3(4, [
          ['TIT2', [3, ...new TextEncoder().encode('Héllo')]],
          ['TPE1', [1, ...utf16le('Bob')]],
        ]),
        ...frames(2),
      ]),
    )
    expect(v4).toMatchObject({ kind: 'stream', format: 'mp3', title: 'Héllo', artist: 'Bob' })
    const v3 = parseFile(
      u8([
        ...id3(3, [
          ['TIT2', [0, ...ascii('Caf'), 0xe9]],
          ['TPE1', [2, ...utf16be('Ann')]],
        ]),
        ...frames(2),
      ]),
    )
    expect(v3).toMatchObject({ title: 'Café', artist: 'Ann' })
  })
  it('uses a Xing frame count, else a CBR estimate', () => {
    const xing = parseFile(
      u8([
        ...frame([...new Array<number>(32).fill(0), ...ascii('Xing'), ...be32(1), ...be32(1000)]),
        ...frames(2),
      ]),
    )
    expect(xing).toMatchObject({ sampleRate: 44100, channels: 2 })
    expect(xing.kind === 'stream' && xing.durationSec).toBeCloseTo((1000 * 1152) / 44100, 6)
    const cbr = parseFile(u8(frames(100)))
    expect(cbr.kind === 'stream' && cbr.durationSec).toBeCloseTo(
      (100 * FRAME_BYTES * 8) / 128000,
      6,
    )
  })
  it('reads FLAC STREAMINFO and Vorbis comments (keys case-insensitive)', () => {
    const f = parseFile(u8(flac([STREAMINFO, vorbis(['title=T', 'ARTIST=A'])])))
    expect(f).toMatchObject({
      kind: 'stream',
      format: 'flac',
      title: 'T',
      artist: 'A',
      sampleRate: 48000,
      channels: 2,
      durationSec: 2,
    })
  })
  it('throws ParseError without STREAMINFO or MP3 frames', () => {
    expect(() => parseFile(u8(flac([vorbis([])])))).toThrow(ParseError)
    expect(() => parseFile(u8([...id3(4, []), ...new Array<number>(64).fill(0)]))).toThrow(
      ParseError,
    )
  })
})

const PRIVATE: {
  rel: string
  format: string
  title: string
  artist: string
  sec: number
  tol: number
}[] = [
  {
    rel: 'private/01 - Abbath - To War!.mp3',
    format: 'mp3',
    title: 'To War!',
    artist: 'Abbath',
    sec: 335.2,
    tol: 1,
  },
  {
    rel: 'private/01. LOST IN PARADISE feat.AKLO.flac',
    format: 'flac',
    title: 'LOST IN PARADISE feat.AKLO',
    artist: 'ALI',
    sec: 328.96,
    tol: 0.01,
  },
]
describe('MP3 / FLAC test files (trackers/private, local only)', () => {
  for (const t of PRIVATE)
    it.skipIf(!existsSync(`trackers/${t.rel}`))(t.rel, () => {
      const f = parseFile(load(t.rel))
      expect(f).toMatchObject({
        kind: 'stream',
        format: t.format,
        title: t.title,
        artist: t.artist,
        sampleRate: 44100,
        channels: 2,
      })
      expect(f.kind === 'stream' && Math.abs(f.durationSec - t.sec)).toBeLessThanOrEqual(t.tol)
    })
})
