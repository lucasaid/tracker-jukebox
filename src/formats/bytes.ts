export class ParseError extends Error {
  readonly name = 'ParseError'
  readonly offset: number | undefined
  constructor(message: string, offset?: number) {
    super(message)
    this.offset = offset
  }
}

export class UnsupportedFormatError extends Error {
  readonly name = 'UnsupportedFormatError'
  readonly what: string
  constructor(what: string) {
    super(`Unsupported: ${what}`)
    this.what = what
  }
}

/** Bounds-checked little/big-endian reader. Every read or seek past the end throws ParseError. */
export class ByteReader {
  pos: number
  readonly length: number
  private readonly bytes_: Uint8Array

  constructor(bytes: Uint8Array, pos = 0) {
    this.bytes_ = bytes
    this.length = bytes.length
    this.pos = pos
  }

  private need(n: number, at = this.pos): void {
    if (n < 0 || at < 0 || at + n > this.length) throw new ParseError('Unexpected end of file', at)
  }
  u8(): number {
    this.need(1)
    return this.bytes_[this.pos++] as number
  }
  i8(): number {
    return (this.u8() << 24) >> 24
  }
  u16le(): number {
    this.need(2)
    const b = this.bytes_
    const p = this.pos
    this.pos += 2
    return (b[p] as number) | ((b[p + 1] as number) << 8)
  }
  u16be(): number {
    this.need(2)
    const b = this.bytes_
    const p = this.pos
    this.pos += 2
    return ((b[p] as number) << 8) | (b[p + 1] as number)
  }
  u32le(): number {
    this.need(4)
    const b = this.bytes_
    const p = this.pos
    this.pos += 4
    return (
      ((b[p] as number) |
        ((b[p + 1] as number) << 8) |
        ((b[p + 2] as number) << 16) |
        ((b[p + 3] as number) << 24)) >>>
      0
    )
  }
  u32be(): number {
    this.need(4)
    const b = this.bytes_
    const p = this.pos
    this.pos += 4
    return (
      (((b[p] as number) << 24) |
        ((b[p + 1] as number) << 16) |
        ((b[p + 2] as number) << 8) |
        (b[p + 3] as number)) >>>
      0
    )
  }
  /** subarray, no copy */
  bytes(n: number): Uint8Array {
    this.need(n)
    const out = this.bytes_.subarray(this.pos, this.pos + n)
    this.pos += n
    return out
  }
  /** CP437, cut at the first NUL, trailing spaces trimmed */
  text(n: number): string {
    return decodeCp437(this.bytes(n)).trimEnd()
  }
  seek(pos: number): this {
    if (!Number.isInteger(pos) || pos < 0 || pos > this.length)
      throw new ParseError('Unexpected end of file', pos)
    this.pos = pos
    return this
  }
}

// 0x00 is a placeholder (it ends a string); 0x01..0x1F are the CP437 glyphs, 0x7F is ⌂.
const LOW =
  '\u0000☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼' +
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~⌂'
const HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐' +
  '└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0'
const CP437 = LOW + HIGH

/** CP437 → string. Control bytes 0x01–0x1F become their glyphs (0x0E → ♫); 0x00 ends the string. */
export function decodeCp437(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) {
    if (b === 0) break
    out += CP437[b]
  }
  return out
}
