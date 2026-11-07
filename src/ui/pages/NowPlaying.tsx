// Full-screen view and share-link target, with VIZ / MESSAGE / SAMPLES tabs.
import { useEffect, useState } from 'react'
import { formatRoute } from '../../state/route'
import { usePlayer } from '../../state/PlayerContext'
import { useSettings } from '../../state/SettingsContext'
import { VisualizerHost } from '../../viz'
import { formatTime } from '../components/PlayerBar'
import { ChannelStrip } from '../components/ChannelStrip'
import { InfoPanel } from '../components/InfoPanel'
import { MessageScroller } from '../components/MessageScroller'
import { SampleBrowser } from '../components/SampleBrowser'
import { showToast } from '../components/Toast'
import { VizPicker } from '../components/VizPicker'
import styles from '../ui.module.css'

type Tab = 'viz' | 'message' | 'samples'
const TAB_EVENT = 'tj-open-tab'
let pendingTab: Tab | null = null

/** Asks NowPlaying to show `tab`: now if mounted, otherwise when it mounts. */
export function openTab(tab: Tab): void {
  pendingTab = tab
  window.dispatchEvent(new Event(TAB_EVENT))
}

const takeTab = (): Tab | null => {
  const t = pendingTab
  pendingTab = null
  return t
}

export function NowPlaying({ id }: { id: string }) {
  const { engine, current, entries } = usePlayer()
  const { settings } = useSettings()
  const [where, setWhere] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>(() => takeTab() ?? 'viz')
  const isTracker = current?.format !== 'midi'
  const shown: Tab = tab === 'samples' && !isTracker ? 'viz' : tab

  useEffect(() => {
    const onTab = (): void => setTab((t) => takeTab() ?? t)
    window.addEventListener(TAB_EVENT, onTab)
    return () => window.removeEventListener(TAB_EVENT, onTab)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      const snap = engine.latest()?.snap
      const pos = snap?.pos
      if (pos?.kind === 'tracker')
        setWhere(`order ${pos.order} · row ${pos.row} · speed ${pos.speed}`)
      else if (pos) setWhere(`${Math.round(pos.tempo)} BPM · ${formatTime(snap?.seconds ?? 0)}`)
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

  // A song that isn't playing yet shows its info (with PLAY) until it is started.
  const viewed = entries.find((e) => e.id === id)
  if (viewed && viewed.id !== current?.id) return <InfoPanel key={viewed.id} entry={viewed} />

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
      <div className={styles.tabs} role="tablist" aria-label="View">
        {(['viz', 'message', ...(isTracker ? ['samples'] : [])] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={t === shown}
            className={`${styles.chip} ${t === shown ? styles.chipOn : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'viz' ? 'VIZ' : t.toUpperCase()}
          </button>
        ))}
      </div>
      {shown === 'viz' && (
        <>
          <div className={styles.npViz}>
            <VisualizerHost vizId={settings.player.lastViz} engine={engine} label="Visualizer" />
          </div>
          <VizPicker />
          <ChannelStrip />
        </>
      )}
      {shown === 'message' && <MessageScroller />}
      {shown === 'samples' && <SampleBrowser key={`samples:${current?.id}`} />}
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
      {current && <InfoPanel key={`info:${current.id}`} entry={current} details={false} />}
    </section>
  )
}
