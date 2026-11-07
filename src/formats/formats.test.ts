import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ByteReader, ParseError, decodeCp437, detectFormat, parseFile } from './index'
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
