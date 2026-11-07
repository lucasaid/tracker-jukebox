// Full-screen view and share-link target. Only the VIZ tab exists until P27 adds MESSAGE and SAMPLES.
import { useEffect, useState } from 'react'
import { formatRoute } from '../../state/route'
import { usePlayer } from '../../state/PlayerContext'
import { useSettings } from '../../state/SettingsContext'
import { VisualizerHost } from '../../viz'
import { ChannelStrip } from '../components/ChannelStrip'
import { showToast } from '../components/Toast'
import { VizPicker } from '../components/VizPicker'
import styles from '../ui.module.css'

export function NowPlaying() {
  const { engine, current } = usePlayer()
  const { settings } = useSettings()
  const [where, setWhere] = useState('')
  const [link, setLink] = useState<string | null>(null)

  useEffect(() => {
    const timer = setInterval(() => {
      const pos = engine.latest()?.snap.pos
      if (pos?.kind === 'tracker')
        setWhere(`order ${pos.order} · row ${pos.row} · speed ${pos.speed}`)
    }, 250)
    return () => clearInterval(timer)
  }, [engine])

  const share = async (): Promise<void> => {
    if (!current) return
    const pos = engine.latest()?.snap.pos
    const seek =
      pos?.kind === 'tracker'
        ? { order: pos.order }
        : { seconds: Math.floor(engine.latest()?.snap.seconds ?? 0) }
    const url = new URL(
      formatRoute({ page: 'play', id: current.id, seek }),
      location.href.split('#')[0],
    ).href
    try {
      await navigator.clipboard.writeText(url)
      setLink(null)
      showToast('Link copied')
    } catch {
      setLink(url) // no clipboard access: show the link for manual copying
    }
  }

  return (
    <section className={styles.panel}>
      <h2 className={styles.heading}>NOW PLAYING</h2>
      <div className={styles.npHead}>
        <span className={styles.title}>{current?.title ?? 'Nothing playing'}</span>
        <span className={styles.note}>
          {current
            ? `${current.file} · ${current.format.toUpperCase()} · ${current.channels}ch · ${where}`
            : ''}
        </span>
      </div>
      <div className={styles.npViz}>
        <VisualizerHost vizId={settings.player.lastViz} engine={engine} label="Visualizer" />
      </div>
      <VizPicker />
      <ChannelStrip />
      <p>
        <button className={styles.btn} onClick={() => void share()} disabled={!current}>
          SHARE
        </button>
      </p>
      {link && (
        <input
          className={styles.search}
          readOnly
          aria-label="Share link"
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          ref={(el) => el?.select()}
        />
      )}
    </section>
  )
}
