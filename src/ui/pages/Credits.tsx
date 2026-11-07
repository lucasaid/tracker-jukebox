// Per-song credits and font attribution (decision 42).
import { usePlayer } from '../../state/PlayerContext'
import styles from '../ui.module.css'

const firstLines = (message: string): string[] =>
  message
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .slice(0, 3)

export function Credits() {
  const { entries } = usePlayer()
  const songs = entries.filter((e) => !e.id.startsWith('local:'))
  return (
    <section className={styles.panel}>
      <h2 className={styles.heading}>CREDITS</h2>
      <p>
        Font: Web437 IBM VGA 8x16 by VileR, Oldschool PC Font Pack, CC BY-SA 4.0 —{' '}
        <a href="https://int10h.org/oldschool-pc-fonts/" target="_blank" rel="noreferrer">
          int10h.org
        </a>
      </p>
      <p>
        MIDI sound bank: GeneralUser GS by S. Christian Collins —{' '}
        <a href="https://www.schristiancollins.com" target="_blank" rel="noreferrer">
          schristiancollins.com
        </a>
      </p>
      <h3 className={styles.subheading}>Music</h3>
      {songs.length === 0 && <p className={styles.note}>Loading…</p>}
      <ul className={styles.credits}>
        {songs.map((e) => (
          <li key={e.id}>
            <strong>{e.title}</strong> <span className={styles.note}>{e.file}</span>
            {firstLines(e.message).map((l, i) => (
              <div key={i} className={styles.note}>
                {l}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </section>
  )
}
