// Bottom transport bar (decision 34). PREV/NEXT arrive with the jukebox in P21.
import { useEffect, useState } from 'react'
import { formatRoute } from '../../state/route'
import { usePlayer } from '../../state/PlayerContext'
import { useSettings } from '../../state/SettingsContext'
import { THEMES } from '../../state/settings'
import styles from '../ui.module.css'

export const formatTime = (sec: number): string =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

export function PlayerBar() {
  const { engine, status, current, toggle, mode, prev, next } = usePlayer()
  const { settings, update } = useSettings()
  const [sec, setSec] = useState(0)
  const [dragSec, setDragSec] = useState<number | null>(null)
  const [bank, setBank] = useState<{ loaded: number; total: number | null } | null>(null)

  useEffect(
    () =>
      engine.on((e) => {
        if (e.type === 'bankProgress')
          setBank(
            e.total !== null && e.loaded >= e.total ? null : { loaded: e.loaded, total: e.total },
          )
        else if (e.type === 'status' && e.status !== 'loading') setBank(null)
      }),
    [engine],
  )

  useEffect(() => {
    const timer = setInterval(() => setSec(engine.latest()?.snap.seconds ?? 0), 250)
    return () => clearInterval(timer)
  }, [engine])

  const nextTheme = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length] ?? settings.theme
  const commitSeek = () => {
    if (dragSec === null) return
    engine.seek({ seconds: dragSec })
    setSec(dragSec)
    setDragSec(null)
  }
  const total = current ? (current.loops ? '--:--' : formatTime(current.durationSec)) : '--:--'
  return (
    <div className={styles.bar}>
      <button
        className={styles.btn}
        aria-label={status === 'playing' ? 'Pause' : 'Play'}
        onClick={toggle}
      >
        {status === 'playing' ? '❚❚' : '▶'}
      </button>
      {mode === 'jukebox' && (
        <button className={styles.btn} aria-label="Previous song" onClick={() => void prev()}>
          PREV
        </button>
      )}
      {bank && (
        <progress
          aria-label="Loading sound bank"
          max={bank.total ?? undefined}
          value={bank.total === null ? undefined : bank.loaded}
        />
      )}
      <span className={styles.barTitle}>
        {current ? current.title || current.file : 'Nothing playing'} ·{' '}
        {current ? formatTime(dragSec ?? sec) : '0:00'} / {total}
      </span>
      {current && !current.loops && current.durationSec > 0 && (
        // seek commits on release: tracker seeks fast-forward from the start, too slow per input event
        <input
          type="range"
          className={styles.seek}
          aria-label="Seek"
          min={0}
          max={current.durationSec}
          step={1}
          value={Math.min(dragSec ?? sec, current.durationSec)}
          onChange={(e) => setDragSec(Number(e.target.value))}
          onPointerUp={commitSeek}
          onKeyUp={commitSeek}
          onBlur={commitSeek}
        />
      )}
      {mode === 'jukebox' && (
        <button className={styles.btn} aria-label="Next song" onClick={() => void next()}>
          NEXT
        </button>
      )}
      {current && (
        <a href={formatRoute({ page: 'play', id: current.id, seek: null })} className={styles.btn}>
          VIEW
        </a>
      )}
      <button
        className={styles.btn}
        aria-label={`Theme: ${settings.theme}, switch to ${nextTheme}`}
        onClick={() => update((s) => ({ ...s, theme: nextTheme }))}
      >
        {settings.theme.toUpperCase()}
      </button>
    </div>
  )
}
