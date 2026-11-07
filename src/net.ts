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

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError'

/** GET url → bytes. Non-2xx → LoadError(status). Network failure → LoadError. Abort rethrown unchanged. */
export async function fetchBytes(
  url: string,
  opts: { signal?: AbortSignal; onProgress?: (loaded: number, total: number | null) => void } = {},
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let loaded = 0
  try {
    const res = await fetch(url, opts.signal ? { signal: opts.signal } : {})
    if (!res.ok) throw new LoadError(`HTTP ${res.status}`, url, res.status)
    const header = res.headers.get('Content-Length')
    const total = header !== null && Number.isFinite(Number(header)) ? Number(header) : null
    const reader = res.body?.getReader()
    if (reader === undefined) {
      const all = new Uint8Array(await res.arrayBuffer())
      opts.onProgress?.(all.length, total)
      return all
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.length
      opts.onProgress?.(loaded, total)
    }
  } catch (e) {
    if (e instanceof LoadError || isAbort(e)) throw e
    throw new LoadError('Network error', url)
  }
  const out = new Uint8Array(loaded)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

/** fetchBytes + JSON.parse. Invalid JSON → LoadError('Invalid JSON'). Caller validates the shape. */
export async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const bytes = await fetchBytes(url, signal ? { signal } : {})
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch (e) {
    if (e instanceof SyntaxError) throw new LoadError('Invalid JSON', url)
    throw e
  }
}
