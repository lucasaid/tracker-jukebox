// Per-channel mute / solo buttons.
import { usePlayer } from '../../state/PlayerContext'
import styles from '../ui.module.css'

export function ChannelStrip() {
  const { engine, muteMask, setMuted, solo } = usePlayer()
  const song = engine.current?.song
  const n = song?.kind === 'tracker' ? song.channels : 0
  const open = Array.from({ length: n }, (_, c) => c).filter((c) => !(muteMask & (1 << c)))
  const soloed = n > 1 && open.length === 1 ? (open[0] ?? null) : null
  return (
    <div className={styles.strip} role="group" aria-label="Channels">
      {Array.from({ length: n }, (_, c) => (
        <span key={c} className={styles.stripCh}>
          <span className={styles.note}>{String(c + 1).padStart(2, '0')}</span>
          <button
            className={`${styles.chip} ${muteMask & (1 << c) ? styles.chipOn : ''}`}
            aria-label={`Mute channel ${c + 1}`}
            aria-pressed={Boolean(muteMask & (1 << c))}
            onClick={() => setMuted(c, !(muteMask & (1 << c)))}
          >
            M
          </button>
          <button
            className={`${styles.chip} ${soloed === c ? styles.chipOn : ''}`}
            aria-label={`Solo channel ${c + 1}`}
            aria-pressed={soloed === c}
            onClick={() => solo(soloed === c ? null : c)}
          >
            S
          </button>
        </span>
      ))}
    </div>
  )
}
