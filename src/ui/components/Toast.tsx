// Error toasts: every engine error shows `<file>: <message>` for a few seconds.
import { useEffect, useState } from 'react'
import { PlaybackError } from '../../audio/AudioEngine'
import { LoadError } from '../../net'
import { usePlayer } from '../../state/PlayerContext'
import styles from '../ui.module.css'

const SHOW_MS = 6000

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
    return engine.on((e) => {
      if (e.type !== 'error') return
      const item = { key: next++, text: `${label(e.error)}: ${e.error.message}` }
      setItems((list) => [...list, item])
      setTimeout(() => setItems((list) => list.filter((x) => x.key !== item.key)), SHOW_MS)
    })
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
