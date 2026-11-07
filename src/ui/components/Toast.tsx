// Error toasts: every engine error shows `<file>: <message>` for a few seconds.
import { useEffect, useState } from 'react'
import { PlaybackError } from '../../audio/AudioEngine'
import { LoadError } from '../../net'
import { usePlayer } from '../../state/PlayerContext'
import styles from '../ui.module.css'

const SHOW_MS = 6000
const EVENT = 'tj-toast'

/** Shows a message in the toast stack from anywhere in the UI. */
export function showToast(text: string): void {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: text }))
}

interface Item {
  key: number
  text: string
}

function label(error: unknown): string {
  if (error instanceof LoadError) return error.url.split('/').pop() || error.url
  if (error instanceof PlaybackError && error.songId) return error.songId.split('/').pop() ?? 'File'
  return 'File'
}

export function Toast() {
  const { engine } = usePlayer()
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    let next = 0
    const add = (text: string): void => {
      const item = { key: next++, text }
      setItems((list) => [...list, item])
      setTimeout(() => setItems((list) => list.filter((x) => x.key !== item.key)), SHOW_MS)
    }
    const onToast = (e: Event): void => {
      if (e instanceof CustomEvent && typeof e.detail === 'string') add(e.detail)
    }
    window.addEventListener(EVENT, onToast)
    const off = engine.on((e) => {
      if (e.type === 'error') add(`${label(e.error)}: ${e.error.message}`)
    })
    return () => {
      window.removeEventListener(EVENT, onToast)
      off()
    }
  }, [engine])

  return (
    <div className={styles.toasts} role="status" aria-live="polite">
      {items.map((i) => (
        <div key={i.key} className={styles.toast}>
          {i.text}
        </div>
      ))}
    </div>
  )
}
