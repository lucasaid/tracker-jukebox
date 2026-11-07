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
        {current ? formatTime(sec) : '0:00'} / {total}
      </span>
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
