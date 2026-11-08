// Song metadata, message, samples and, for MIDI, the MT-32 mode toggle.
import { useState } from 'react'
import { usePlayer } from '../../state/PlayerContext'
import type { ManifestEntry } from '../../library/manifest'
import styles from '../ui.module.css'
import { formatTime } from './PlayerBar'

/** `details` = false leaves out the message and sample names, for NowPlaying where tabs show them. */
export function InfoPanel({ entry, details = true }: { entry: ManifestEntry; details?: boolean }) {
  const { engine, status, play, favorites, toggleFavorite } = usePlayer()
  const local = entry.id.startsWith('local:')
  // The loaded song's mapping if this song is loaded, else the manifest's detected target.
  const [mt32, setMt32] = useState(() => {
    const loaded = engine.current
    return loaded?.id === entry.id && loaded.song.kind === 'midi'
      ? loaded.song.target === 'mt32'
      : entry.midiTarget === 'mt32'
  })

  /** Switches the mapping. A loaded song is reloaded in place, at the same position and
   *  play/pause state; otherwise the choice applies when PLAY is pressed. */
  const toggleMt32 = (): void => {
    const next = !mt32
    setMt32(next)
    const loaded = engine.current
    if (loaded?.id !== entry.id || loaded.song.kind !== 'midi') return
    const seconds = engine.latest()?.snap.seconds ?? 0
    engine
      .load(
        { id: entry.id, parsed: { ...loaded.song, target: next ? 'mt32' : 'gm' } },
        { seek: { seconds }, autoplay: status === 'playing' },
      )
      // The engine has already reported the failure (toast); the button goes back to match.
      .catch(() => setMt32(!next))
  }
  return (
    <section className={styles.panel} aria-label={`Info: ${entry.title}`}>
      <h2 className={styles.heading}>{entry.title.toUpperCase()}</h2>
      <p className={styles.note}>
        {[
          entry.file,
          entry.artist,
          entry.tracker,
          entry.format.toUpperCase(),
          `${entry.channels}ch`,
          entry.loops ? '--:--' : formatTime(entry.durationSec),
          `${Math.ceil(entry.sizeBytes / 1024)} KB`,
        ]
          .filter(Boolean)
          .join(' · ')}
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
            <button className={styles.btn} aria-pressed={mt32} onClick={toggleMt32}>
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
