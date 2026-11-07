export interface Queue {
  current(): string | null
  next(): string | null
  prev(): string | null
  rebuild(ids: readonly string[], shuffle: boolean): void
}

export function createQueue(
  _ids: readonly string[],
  _shuffle: boolean,
  _rng: () => number = Math.random,
): Queue {
  throw new Error('Not implemented (P21)')
}
