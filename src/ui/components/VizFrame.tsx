// The visualizer well with a FULLSCREEN toggle. Fullscreen fills the window with the visualizer
// (plus the browser's Fullscreen API where allowed); the player bar stays on top and, like the
// toggle, fades out after IDLE_SEC without input and comes back on any mouse move or key.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useSettings } from '../../state/SettingsContext'
import type { Settings } from '../../state/settings'
import { getVisualizer, visualizers } from '../../viz'
import styles from '../ui.module.css'

const IDLE_SEC = 3

/** The next enabled visualizer after settings.player.lastViz, wrapping around. */
export function nextViz(s: Settings): Settings {
  const i = visualizers.findIndex((v) => v.id === s.player.lastViz)
  const next = visualizers[(i + 1) % visualizers.length]
  return next ? { ...s, player: { ...s.player, lastViz: next.id } } : s
}

export function VizFrame(props: { children: ReactNode }) {
  const [full, setFull] = useState(false)
  const { settings, update } = useSettings()

  useEffect(() => {
    if (!full) return
    const root = document.documentElement
    let timer = 0
    const wake = (): void => {
      delete root.dataset.idle
      clearTimeout(timer)
      timer = window.setTimeout(() => {
        root.dataset.idle = ''
      }, IDLE_SEC * 1000)
    }
    // Esc: the browser leaves real fullscreen itself (fullscreenchange); this covers the CSS-only fallback
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setFull(false)
      else wake()
    }
    const onFullscreen = (): void => {
      if (!document.fullscreenElement) setFull(false)
    }
    wake()
    window.addEventListener('pointermove', wake)
    window.addEventListener('pointerdown', wake)
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFullscreen)
      clearTimeout(timer)
      delete root.dataset.idle
      if (document.fullscreenElement) void document.exitFullscreen()
    }
  }, [full])

  const toggle = (): void => {
    if (full) return setFull(false)
    setFull(true)
    // ponytail: no Fullscreen API (iOS Safari) or permission refused → the CSS overlay still fills the window
    document.documentElement.requestFullscreen?.().catch(() => undefined)
  }

  return (
    <div className={`${styles.npViz} ${full ? styles.vizFull : ''}`}>
      {props.children}
      <div className={styles.fullBtns}>
        {full && (
          <button className={styles.btn} title="Next visualizer" onClick={() => update(nextViz)}>
            {`VIZ: ${getVisualizer(settings.player.lastViz).name}`}
          </button>
        )}
        <button className={styles.btn} aria-pressed={full} onClick={toggle}>
          {full ? 'EXIT' : 'FULLSCREEN'}
        </button>
      </div>
    </div>
  )
}
