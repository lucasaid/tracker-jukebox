export class LoadError extends Error {
  readonly name = 'LoadError'
  readonly url: string
  /** HTTP status; undefined = network failure */
  readonly status: number | undefined
  constructor(message: string, url: string, status?: number) {
    super(message)
    this.url = url
    this.status = status
  }
}

/** GET url → bytes. Non-2xx → LoadError(status). Network failure → LoadError. Abort rethrown unchanged. */
export function fetchBytes(
  _url: string,
  _opts?: { signal?: AbortSignal; onProgress?: (loaded: number, total: number | null) => void },
): Promise<Uint8Array> {
  throw new Error('Not implemented (P8)')
}

/** fetchBytes + JSON.parse. Invalid JSON → LoadError('Invalid JSON'). Caller validates the shape. */
export function fetchJson(_url: string, _signal?: AbortSignal): Promise<unknown> {
  throw new Error('Not implemented (P8)')
}
