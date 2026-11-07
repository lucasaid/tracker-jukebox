import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ByteReader, ParseError, decodeCp437, detectFormat } from './index'
import type { Format } from './index'

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
