// Music browser table. Search, filters, sorting, favorites and the info panel arrive in P19.
import { usePlayer } from '../../state/PlayerContext'
import { formatTime } from '../components/PlayerBar'
import styles from '../ui.module.css'

export function Browse() {
  const { entries, manifestError, retryManifest, current, play } = usePlayer()
  const rows = [...entries].sort((a, b) => a.title.localeCompare(b.title))

  return (
    <section className={styles.panel}>
      <h2 className={styles.heading}>BROWSE</h2>
      {manifestError ? (
        <>
          <p className={styles.error}>Could not load the music list: {manifestError.message}</p>
          <button className={styles.btn} onClick={retryManifest}>
            RETRY
          </button>
        </>
      ) : entries.length === 0 ? (
        <p className={styles.note}>Loading…</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colPlay} />
              <th>Title</th>
              <th className={styles.colFmt}>Fmt</th>
              <th className={styles.colLen}>Length</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className={e.id === current?.id ? styles.playing : undefined}>
                <th scope="row" className={styles.colPlay}>
                  <button
                    className={styles.btn}
                    aria-label={`Play ${e.title || e.file}`}
                    onClick={() => void play(e.id)}
                  >
                    PLAY
                  </button>
                </th>
                <td title={e.file}>{e.title || e.file}</td>
                <td className={styles.colFmt}>{e.format.toUpperCase()}</td>
                <td className={styles.colLen}>{e.loops ? '--:--' : formatTime(e.durationSec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
