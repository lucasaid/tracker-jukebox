// Song metadata, message, samples and, for MIDI, the MT-32 mode toggle.
import { useState } from 'react'
import { usePlayer } from '../../state/PlayerContext'
import type { ManifestEntry } from '../../library/manifest'
import styles from '../ui.module.css'
import { formatTime } from './PlayerBar'

/** `details` = false leaves out the message and sample names, for NowPlaying where tabs show them. */
export function InfoPanel({ entry, details = true }: { entry: ManifestEntry; details?: boolean }) {
  const { play, favorites, toggleFavorite } = usePlayer()
  const local = entry.id.startsWith('local:')
  // Seeded from the manifest's detected target; changing it replays with the other mapping.
  const [mt32, setMt32] = useState(entry.midiTarget === 'mt32')
  return (
    <section className={styles.panel} aria-label={`Info: ${entry.title}`}>
      <h2 className={styles.heading}>{entry.title.toUpperCase()}</h2>
      <p className={styles.note}>
        {entry.file} · {entry.tracker} · {entry.format.toUpperCase()} · {entry.channels}ch ·{' '}
        {entry.loops ? '--:--' : formatTime(entry.durationSec)} ·{' '}
        {Math.ceil(entry.sizeBytes / 1024)} KB
      </p>
      <p>
        <button
          className={styles.btn}
          onClick={() =>
            void play(entry.id, entry.midiTarget ? { midiTarget: mt32 ? 'mt32' : 'gm' } : undefined)
          }
        >
          PLAY
        </button>{' '}
        {entry.midiTarget && (
          <>
            <button
              className={styles.btn}
              aria-pressed={mt32}
              onClick={() => {
                setMt32(!mt32)
                void play(entry.id, { midiTarget: mt32 ? 'gm' : 'mt32' })
              }}
            >
              {mt32 ? '☑ MT-32 MODE' : '☐ MT-32 MODE'}
            </button>{' '}
          </>
        )}
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
      {details && entry.message && <pre className={styles.message}>{entry.message}</pre>}
      {details && entry.sampleNames.length > 0 && (
        <p className={styles.note}>Samples: {entry.sampleNames.join(' · ')}</p>
      )}
    </section>
  )
}
