import { UnsupportedFormatError } from './bytes'
import { parse669 } from './669'
import { parseMidi } from './midi'
import { parseSf2 } from './sf2'
import { parseMod } from './mod'
import { parseMtm } from './mtm'
import { parseS3m } from './s3m'
import { parseStm } from './stm'
import type { Format, MidiTarget, ParsedFile, SoundBank } from './song'

export * from './song'
export { ByteReader, ParseError, UnsupportedFormatError, decodeCp437 } from './bytes'
export { MT32_TO_GM } from './mt32-to-gm'

/** Magic-byte sniff (decision 11). Never throws. null = not a supported format. */
export function detectFormat(bytes: Uint8Array): Format | null {
  const at = (pos: number, str: string): boolean => {
    if (pos + str.length > bytes.length) return false
    for (let i = 0; i < str.length; i++) if (bytes[pos + i] !== str.charCodeAt(i)) return false
    return true
  }
  const u8 = (pos: number): number => bytes[pos] ?? -1
  if (at(0, 'MThd')) return 'midi'
  if (at(0x2c, 'SCRM')) return 's3m'
  if (at(20, '!Scream!') && u8(29) === 2) return 'stm'
  if (at(0, 'MTM') && u8(3) === 0x10) return 'mtm'
  if (at(0, 'if') && u8(0x6e) <= 64 && u8(0x6f) <= 128 && bytes.length > 0x6f) return '669'
  if (bytes.length >= 1084) {
    const magic = String.fromCharCode(...bytes.subarray(1080, 1084))
    if (['M.K.', 'M!K!', 'FLT4', '4CHN', '6CHN', '8CHN', 'FLT8'].includes(magic)) return 'mod'
    const m = /^(\d\d)CH$/.exec(magic)
    if (m && Number(m[1]) >= 10 && Number(m[1]) <= 32) return 'mod'
  }
  return null
}

/** Throws ParseError | UnsupportedFormatError. Never returns partial data. */
export function parseFile(bytes: Uint8Array, opts?: { midiTarget?: MidiTarget }): ParsedFile {
  const format = detectFormat(bytes)
  if (format === null) throw new UnsupportedFormatError('unknown format')
  if (format === 'mod') return parseMod(bytes)
  if (format === 'stm') return parseStm(bytes)
  if (format === 's3m') return parseS3m(bytes)
  if (format === '669') return parse669(bytes)
  if (format === 'mtm') return parseMtm(bytes)
  return parseMidi(bytes, opts?.midiTarget ?? 'gm')
}

/** Throws ParseError. */
export function parseSoundBank(bytes: Uint8Array): SoundBank {
  return parseSf2(bytes)
}
