export interface Queue {
  /** The song now playing; null only for an empty queue. */
  current(): string | null
  /** Advances and returns the new current id; null only when the queue is empty.
   *  When a pass is used up, a new pass starts (reshuffled if shuffle), and it never begins with the id just played if length > 1. */
  next(): string | null
  /** Moves back through play history; returns null (and stays put) at the start of the history. */
  prev(): string | null
  /** Replaces the id list. The current id stays current. The rest of this pass = new ids not yet played this pass. */
  rebuild(ids: readonly string[], shuffle: boolean): void
}

/** shuffle = false → ids are played in the given order. rng defaults to Math.random and is only used for Fisher–Yates. */
export function createQueue(
  ids: readonly string[],
  shuffle: boolean,
  rng: () => number = Math.random,
): Queue {
  let all = [...ids]
  let shuffled = shuffle
  const history: string[] = []
  let at = -1
  /** ids still to play in this pass, next one last (so pop() takes it) */
  let rest: string[] = []
  /** ids already played in this pass, including the current one */
  const played = new Set<string>()

  /** Fisher–Yates over a copy, then reversed so that pop() yields the front. */
  const order = (list: readonly string[]): string[] => {
    const a = [...list]
    if (shuffled)
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        const t = a[i] as string
        a[i] = a[j] as string
        a[j] = t
      }
    return a.reverse()
  }

  const startPass = (): void => {
    played.clear()
    rest = order(all)
    const last = history[at]
    // A new pass never opens with the song that just played.
    if (rest.length > 1 && rest[rest.length - 1] === last) {
      const top = rest.length - 1
      const t = rest[top] as string
      rest[top] = rest[top - 1] as string
      rest[top - 1] = t
    }
  }

  const take = (): string | null => {
    if (rest.length === 0) startPass()
    const id = rest.pop() ?? null
    if (id !== null) played.add(id)
    return id
  }

  const first = take()
  if (first !== null) {
    history.push(first)
    at = 0
  }

  return {
    current: () => history[at] ?? null,
    next() {
      if (at < history.length - 1) return history[++at] ?? null
      const id = take()
      if (id === null) return null
      history.push(id)
      at++
      return id
    },
    prev() {
      if (at <= 0) return null
      return history[--at] ?? null
    },
    rebuild(newIds, newShuffle) {
      all = [...newIds]
      shuffled = newShuffle
      rest = order(all.filter((id) => !played.has(id)))
    },
  }
}
