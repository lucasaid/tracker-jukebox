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

  u8(): number {
    throw new Error('Not implemented (P3)')
  }
  i8(): number {
    throw new Error('Not implemented (P3)')
  }
  u16le(): number {
    throw new Error('Not implemented (P3)')
  }
  u16be(): number {
    throw new Error('Not implemented (P3)')
  }
  u32le(): number {
    throw new Error('Not implemented (P3)')
  }
  u32be(): number {
    throw new Error('Not implemented (P3)')
  }
  /** subarray, no copy */
  bytes(_n: number): Uint8Array {
    void this.bytes_
    throw new Error('Not implemented (P3)')
  }
  /** CP437, cut at the first NUL, trailing spaces trimmed */
  text(_n: number): string {
    throw new Error('Not implemented (P3)')
  }
  seek(_pos: number): this {
    throw new Error('Not implemented (P3)')
  }
}

export function decodeCp437(_bytes: Uint8Array): string {
  throw new Error('Not implemented (P3)')
}
