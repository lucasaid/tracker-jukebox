// Shuffle jukebox with settings toggles (decision 38).
import { useEffect, useState } from 'react'
import { FORMATS } from '../../formats'
import type { Format } from '../../formats'
import { usePlayer } from '../../state/PlayerContext'
import { useSettings } from '../../state/SettingsContext'
import type { Settings } from '../../state/settings'
import { VisualizerHost, visualizers } from '../../viz'
import { DropZone } from '../components/DropZone'
import { showToast } from '../components/Toast'
import { VizPicker } from '../components/VizPicker'
import styles from '../ui.module.css'

const AUTO_VIZ_MS = 120_000
const AUTO_VIZ: { value: Settings['jukebox']['autoViz']; label: string }[] = [
  { value: 'off', label: 'off' },
  { value: 'perSong', label: 'every song' },
  { value: 'every2min', label: 'every 2 min' },
]

export function Jukebox() {
  const { engine, status, current, mode, startJukebox } = usePlayer()
  const { settings, update } = useSettings()
  const j = settings.jukebox
  const [busy, setBusy] = useState(false)
  const running = mode === 'jukebox' && status === 'playing'
  const setJ = (patch: Partial<Settings['jukebox']>): void =>
    update((s) => ({ ...s, jukebox: { ...s.jukebox, ...patch } }))

  // autoViz: step through the visualizers per song, or on a 2-minute timer.
  const songId = current?.id
  useEffect(() => {
    if (mode !== 'jukebox' || j.autoViz !== 'perSong' || !songId) return
    update((s) => nextViz(s))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on a new song only
  }, [songId])
  useEffect(() => {
    if (mode !== 'jukebox' || j.autoViz !== 'every2min') return
    const timer = setInterval(() => update((s) => nextViz(s)), AUTO_VIZ_MS)
    return () => clearInterval(timer)
  }, [mode, j.autoViz, update])

  const toggle = async (): Promise<void> => {
    if (running) {
      await engine.fadeOut(j.fade ? 1 : 0)
      return
    }
    setBusy(true)
    try {
      await startJukebox()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not start the jukebox')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DropZone />
      <section className={styles.panel}>
        <h2 className={styles.heading}>JUKEBOX</h2>
        <p>
          <button className={styles.btn} onClick={() => void toggle()} disabled={busy}>
            {running ? 'STOP' : 'START'}
          </button>{' '}
          <span className={styles.note}>
            {current && mode === 'jukebox'
              ? `Now: ${current.title}`
              : 'Shuffled play of everything that matches'}
          </span>
        </p>
        <div className={styles.chips} role="group" aria-label="Formats">
          <Toggle on={j.formats.length === 0} onClick={() => setJ({ formats: [] })}>
            ALL
          </Toggle>
          {FORMATS.map((f: Format) => (
            <Toggle
              key={f}
              on={j.formats.includes(f)}
              onClick={() =>
                setJ({
                  formats: j.formats.includes(f)
                    ? j.formats.filter((x) => x !== f)
                    : [...j.formats, f],
                })
              }
            >
              {f.toUpperCase()}
            </Toggle>
          ))}
        </div>
        <div className={styles.chips} role="group" aria-label="Options">
          <Toggle on={j.shuffle} onClick={() => setJ({ shuffle: !j.shuffle })}>
            shuffle
          </Toggle>
          <Toggle on={j.favoritesOnly} onClick={() => setJ({ favoritesOnly: !j.favoritesOnly })}>
            ★ only
          </Toggle>
          <Toggle on={j.fade} onClick={() => setJ({ fade: !j.fade })}>
            crossfade
          </Toggle>
        </div>
        <p>
          <label>
            Max length{' '}
            <input
              className={styles.search}
              style={{ width: '6ch' }}
              type="number"
              min={0}
              max={30}
              step={1}
              value={j.maxLengthMin}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value))
                if (Number.isFinite(n)) setJ({ maxLengthMin: Math.min(30, Math.max(0, n)) })
              }}
            />{' '}
            min (0 = no cap)
          </label>{' '}
          <label>
            Visualizer change{' '}
            <select
              value={j.autoViz}
              onChange={(e) => {
                const v = AUTO_VIZ.find((o) => o.value === e.target.value)
                if (v) setJ({ autoViz: v.value })
              }}
            >
              {AUTO_VIZ.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </p>
        <div className={styles.npViz}>
          <VisualizerHost vizId={settings.player.lastViz} engine={engine} label="Visualizer" />
        </div>
        <VizPicker />
      </section>
    </>
  )
}

function nextViz(s: Settings): Settings {
  const i = visualizers.findIndex((v) => v.id === s.player.lastViz)
  const next = visualizers[(i + 1) % visualizers.length]
  return next ? { ...s, player: { ...s.player, lastViz: next.id } } : s
}

function Toggle(props: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      className={`${styles.chip} ${props.on ? styles.chipOn : ''}`}
      aria-pressed={props.on}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}
