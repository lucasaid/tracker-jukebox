// Song metadata, message, samples. The MT-32 toggle for MIDI arrives in P26.
import { usePlayer } from '../../state/PlayerContext'
import type { ManifestEntry } from '../../library/manifest'
import styles from '../ui.module.css'
import { formatTime } from './PlayerBar'

export function InfoPanel({ entry }: { entry: ManifestEntry }) {
  const { play, favorites, toggleFavorite } = usePlayer()
  const local = entry.id.startsWith('local:')
  return (
    <section className={styles.panel} aria-label={`Info: ${entry.title}`}>
      <h2 className={styles.heading}>{entry.title.toUpperCase()}</h2>
      <p className={styles.note}>
        {entry.file} · {entry.tracker} · {entry.format.toUpperCase()} · {entry.channels}ch ·{' '}
        {entry.loops ? '--:--' : formatTime(entry.durationSec)} ·{' '}
        {Math.ceil(entry.sizeBytes / 1024)} KB
      </p>
      <p>
        <button className={styles.btn} onClick={() => void play(entry.id)}>
          PLAY
        </button>{' '}
        {!local && (
          <button
            className={styles.btn}
            aria-pressed={favorites.has(entry.id)}
            onClick={() => toggleFavorite(entry.id)}
          >
            {favorites.has(entry.id) ? '★ FAVORITE' : '☆ FAVORITE'}
          </button>
        )}
      </p>
      {entry.message && <pre className={styles.message}>{entry.message}</pre>}
      {entry.sampleNames.length > 0 && (
        <p className={styles.note}>Samples: {entry.sampleNames.join(' · ')}</p>
      )}
    </section>
  )
}
