// "Press any key to connect": browsers only start audio after a gesture, so a shared link waits here.
import { useEffect } from 'react'
import styles from '../ui.module.css'

export function ConnectOverlay({ title, onConnect }: { title: string; onConnect: () => void }) {
  useEffect(() => {
    const go = (e: Event): void => {
      if (e instanceof KeyboardEvent && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return
      onConnect()
    }
    window.addEventListener('keydown', go)
    window.addEventListener('click', go)
    return () => {
      window.removeEventListener('keydown', go)
      window.removeEventListener('click', go)
    }
  }, [onConnect])

  return (
    <div className={styles.connect} role="dialog" aria-label="Connect">
      <p>{title}</p>
      <p>Press any key to connect</p>
    </div>
  )
}
