import type { Format, MidiTarget, ParsedFile, SoundBank } from './song'

export * from './song'
export { ByteReader, ParseError, UnsupportedFormatError, decodeCp437 } from './bytes'
export { MT32_TO_GM } from './mt32-to-gm'

/** Magic-byte sniff (decision 11). Never throws. null = not a supported format. */
export function detectFormat(_bytes: Uint8Array): Format | null {
  throw new Error('Not implemented (P3)')
}

/** Throws ParseError | UnsupportedFormatError. Never returns partial data. */
export function parseFile(_bytes: Uint8Array, _opts?: { midiTarget?: MidiTarget }): ParsedFile {
  throw new Error('Not implemented (P4)')
}

/** Throws ParseError. */
export function parseSoundBank(_bytes: Uint8Array): SoundBank {
  throw new Error('Not implemented (P24)')
}
