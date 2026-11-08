// Visualizer selector; the choice is remembered in settings.player.lastViz.
import { asStream, usePlayer } from '../../state/PlayerContext'
import { useSettings } from '../../state/SettingsContext'
import { visualizers } from '../../viz'
import styles from '../ui.module.css'

export function VizPicker() {
  const { settings, update } = useSettings()
  const { current } = usePlayer()
  const streamed = current !== null && asStream(current.format) !== null
  return (
    <div className={styles.chips} role="group" aria-label="Visualizer">
      {visualizers.map((v) => (
        <button
          key={v.id}
          className={`${styles.chip} ${v.id === settings.player.lastViz ? styles.chipOn : ''}`}
          aria-pressed={v.id === settings.player.lastViz}
          disabled={streamed && v.streams === false}
          title={streamed && v.streams === false ? 'Not available for MP3/FLAC' : undefined}
          onClick={() => update((s) => ({ ...s, player: { ...s.player, lastViz: v.id } }))}
        >
          {v.name}
        </button>
      ))}
    </div>
  )
}
