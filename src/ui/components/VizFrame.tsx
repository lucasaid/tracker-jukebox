// The visualizer well with a FULLSCREEN toggle. Fullscreen fills the window with the visualizer
// (plus the browser's Fullscreen API where allowed); the player bar stays on top and, like the
// toggle, fades out after IDLE_SEC without input and comes back on mouse move or click (keys leave it hidden; that waking click does nothing else).
// On entering fullscreen and on every song change there, a now-playing card types in the title.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ManifestEntry } from '../../library/manifest'
import { usePlayer } from '../../state/PlayerContext'
import { useSettings } from '../../state/SettingsContext'
import type { Settings } from '../../state/settings'
import { getVisualizer, visualizers } from '../../viz'
import styles from '../ui.module.css'
import { formatTime } from './PlayerBar'

const IDLE_SEC = 3

/** The next enabled visualizer after settings.player.lastViz, wrapping around. */
export function nextViz(s: Settings): Settings {
  const i = visualizers.findIndex((v) => v.id === s.player.lastViz)
  const next = visualizers[(i + 1) % visualizers.length]
  return next ? { ...s, player: { ...s.player, lastViz: next.id } } : s
}

/** VisualizerHost's remembered click mode for the current visualizer (settings.player.vizModes). */
export function useVizMode(): { mode: number; onMode: (mode: number) => void } {
  const { settings, update } = useSettings()
  const id = settings.player.lastViz
  return {
    mode: settings.player.vizModes[id] ?? 0,
    onMode: (mode) =>
      update((s) => ({
        ...s,
        player: { ...s.player, vizModes: { ...s.player.vizModes, [id]: mode } },
      })),
  }
}

/** Plays its CSS intro/outro once per mount; VizFrame remounts it per song via `key`. */
function TitleCard(props: { entry: ManifestEntry }) {
  const { entry } = props
  const title = entry.title || entry.file
  const meta = [
    entry.artist,
    entry.format.toUpperCase(),
    entry.tracker,
    `${entry.channels}CH`,
    entry.loops || entry.durationSec <= 0 ? null : formatTime(entry.durationSec),
  ].filter(Boolean)
  return (
    <div className={styles.titleCard} role="status">
      <div className={styles.titleLabel}>NOW PLAYING</div>
      <div className={styles.titleRow}>
        <span
          className={styles.titleText}
          style={{
            width: `${title.length}ch`,
            animationTimingFunction: `steps(${title.length})`,
            animationDuration: `${Math.min(title.length * 45, 1400)}ms`,
          }}
        >
          {title}
        </span>
        <span className={styles.titleCursor} aria-hidden="true" />
      </div>
      <div className={styles.titleMeta}>{meta.join(' · ')}</div>
    </div>
  )
}

export function VizFrame(props: { children: ReactNode }) {
  const [full, setFull] = useState(false)
  const { settings, update } = useSettings()
  const { current } = usePlayer()

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
    // A tap while the UI is hidden only wakes it: the click it ends in never reaches the
    // visualizer (no mode change) or the hidden buttons.
    let swallowClick = false
    const onDown = (): void => {
      swallowClick = root.dataset.idle !== undefined
      wake()
    }
    const onClick = (e: MouseEvent): void => {
      if (!swallowClick) return
      swallowClick = false
      e.stopPropagation()
    }
    // Esc: the browser leaves real fullscreen itself (fullscreenchange); this covers the CSS-only fallback
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setFull(false)
    }
    const onFullscreen = (): void => {
      if (!document.fullscreenElement) setFull(false)
    }
    root.dataset.vizFull = '' // App skips its page-navigation shortcuts while this is set
    wake()
    window.addEventListener('pointermove', wake)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFullscreen)
      clearTimeout(timer)
      delete root.dataset.idle
      delete root.dataset.vizFull
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
      {full && current && <TitleCard key={current.id} entry={current} />}
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
