// BBS landing page with DIAL and modem intro (decision 40).
import { useEffect, useRef, useState } from 'react'
import { playModemIntro } from '../../audio/modem'
import { usePlayer } from '../../state/PlayerContext'
import { useSettings } from '../../state/SettingsContext'
import { THEMES } from '../../state/settings'
import { showToast } from '../components/Toast'
import styles from '../ui.module.css'

const DIAL_TEXT = 'ATDT 555-1993'
const CONNECT_TEXT = 'CONNECT 14400'
const TYPE_MS = 70

// 3x5 block font for the logo
const GLYPHS: Record<string, string> = {
  T: '###.#..#..#..#.',
  R: '##.#.###.#.##.#',
  A: '.#.#.#####.##.#',
  C: '.###..#..#...##',
  K: '#.##.###.#.##.#',
  E: '####..##.#..###',
  J: '..#..#..##.#.#.',
  U: '#.##.##.##.####',
  B: '##.#.###.#.###.',
  O: '.#.#.##.##.#.#.',
  X: '#.##.#.#.#.##.#',
}
const logoLines = (word: string): string[] =>
  Array.from({ length: 5 }, (_, y) =>
    [...word]
      .map((ch) =>
        (GLYPHS[ch] ?? '')
          .slice(y * 3, y * 3 + 3)
          .replace(/#/g, '█')
          .replace(/\./g, ' '),
      )
      .join(' '),
  )
const LOGO = [...logoLines('TRACKER'), '', ...logoLines('JUKEBOX')].join('\n')

type Phase = 'idle' | 'dialing' | 'connected'

export function Landing() {
  const { engine, status } = usePlayer()
  const { settings, update } = useSettings()
  // Coming back after the audio is already unlocked skips straight to the menu.
  const [phase, setPhase] = useState<Phase>(status === 'locked' ? 'idle' : 'connected')
  const [typed, setTyped] = useState(0)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const dial = async (): Promise<void> => {
    try {
      await engine.unlock()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Audio is not available')
      return
    }
    const ctx = engine.context
    if (settings.intro.skip || !ctx) {
      setPhase('connected')
      return
    }
    const controller = new AbortController()
    abort.current = controller
    setTyped(0)
    setPhase('dialing')
    const typing = setInterval(() => setTyped((n) => Math.min(DIAL_TEXT.length, n + 1)), TYPE_MS)
    await playModemIntro(ctx, controller.signal)
    clearInterval(typing)
    setPhase('connected')
  }

  const nextTheme = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length] ?? settings.theme
  return (
    <section className={styles.panel}>
      <h2 className={styles.heading}>WELCOME</h2>
      <pre className={styles.logo} aria-label="Tracker Jukebox">
        {LOGO}
      </pre>
      <p className={styles.tag}>BBS music from the 90s · MOD S3M STM 669 MTM MIDI</p>
      {phase === 'idle' && (
        <button className={styles.btn} onClick={() => void dial()}>
          DIAL
        </button>
      )}
      {phase !== 'idle' && (
        <pre className={styles.term} aria-live="polite">
          {phase === 'dialing' ? DIAL_TEXT.slice(0, typed) : `${DIAL_TEXT}\n${CONNECT_TEXT}`}
          <span className={styles.cursor}>_</span>
        </pre>
      )}
      {phase === 'dialing' && (
        <button
          className={styles.btn}
          onClick={() => {
            abort.current?.abort()
            setPhase('connected')
          }}
        >
          SKIP
        </button>
      )}
      {phase === 'connected' && (
        <>
          <nav className={styles.menu} aria-label="Menu">
            <a href="#/browse">[B]rowse</a>
            <a href="#/jukebox">[J]ukebox</a>
            <a href="#/credits">[C]redits</a>
            <button
              className={styles.link}
              onClick={() => update((s) => ({ ...s, theme: nextTheme }))}
            >
              [T]heme: {settings.theme}
            </button>
          </nav>
          <label>
            <input
              type="checkbox"
              checked={settings.intro.skip}
              onChange={(e) => update((s) => ({ ...s, intro: { skip: e.target.checked } }))}
            />{' '}
            skip intro next time
          </label>
        </>
      )}
    </section>
  )
}
