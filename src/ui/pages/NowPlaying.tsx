// Full-screen view and share-link target, with VIZ / MESSAGE / SAMPLES tabs.
import { useEffect, useRef, useState } from 'react'
import { parseFile } from '../../formats'
import type { ParsedFile } from '../../formats'
import type { ManifestEntry } from '../../library/manifest'
import { fetchBytes } from '../../net'
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
import { VizFrame } from '../components/VizFrame'
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
  const entry = entries.find((e) => e.id === id) ?? current
  const playing = entry !== null && entry.id === current?.id
  const preview = usePreview(playing ? null : entry)
  const song = playing ? engine.current?.song : preview.song
  const isTracker = entry?.format !== 'midi'
  const shown: Tab = tab === 'samples' && !isTracker ? 'viz' : tab

  // Showing the playing song → follow it to the next one (NEXT/PREV/RANDOM, jukebox advance, media keys).
  const currentId = current?.id
  const followed = useRef(currentId)
  useEffect(() => {
    const was = followed.current
    followed.current = currentId
    if (currentId !== undefined && was === id && currentId !== id)
      location.hash = formatRoute({ page: 'play', id: currentId, seek: null })
  }, [currentId, id])

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

  return (
    <>
      {entry && <InfoPanel key={`info:${entry.id}`} entry={entry} details={false} />}
      <section className={styles.panel}>
        <h2 className={styles.heading}>{playing ? 'NOW PLAYING' : 'PREVIEW'}</h2>
        <div className={styles.npHead}>
          <span className={styles.title}>{entry?.title ?? 'Nothing playing'}</span>
          <span className={styles.note}>
            {entry
              ? `${entry.file} · ${entry.format.toUpperCase()} · ${entry.channels}ch` +
                (playing ? ` · ${where}` : '')
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
        {preview.error && <p className={styles.error}>{preview.error}</p>}
        {shown === 'viz' && (
          <>
            <VizFrame>
              <VisualizerHost
                vizId={settings.player.lastViz}
                engine={engine}
                label="Visualizer"
                preview={playing ? undefined : preview.song}
              />
            </VizFrame>
            <VizPicker />
            {playing && <ChannelStrip />}
          </>
        )}
        {shown === 'message' && <MessageScroller message={entry?.message ?? ''} />}
        {shown === 'samples' && (
          <SampleBrowser
            key={`samples:${entry?.id}`}
            samples={song?.kind === 'tracker' ? song.samples : []}
          />
        )}
        {playing && (
          <p>
            <button className={styles.btn} onClick={() => void share()}>
              SHARE
            </button>
          </p>
        )}
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
    </>
  )
}

/** Fetches and parses a song that isn't playing, so its pattern and samples can be shown.
 *  ponytail: dropped local files have no url and preview nothing until played; expose their parsed
 *  data from PlayerContext if that matters. */
function usePreview(entry: ManifestEntry | null): { song?: ParsedFile; error?: string } {
  const [state, setState] = useState<{ id: string; song?: ParsedFile; error?: string } | null>(null)
  const url = entry?.url ?? null
  const entryId = entry?.id ?? null
  const midiTarget = entry?.midiTarget ?? undefined
  useEffect(() => {
    if (url === null || entryId === null) return
    const abort = new AbortController()
    fetchBytes(url, { signal: abort.signal }).then(
      (bytes) => {
        try {
          setState({ id: entryId, song: parseFile(bytes, midiTarget ? { midiTarget } : undefined) })
        } catch (err) {
          setState({ id: entryId, error: err instanceof Error ? err.message : 'Parse failed' })
        }
      },
      (err: unknown) => {
        if (!abort.signal.aborted)
          setState({ id: entryId, error: err instanceof Error ? err.message : 'Load failed' })
      },
    )
    return () => abort.abort()
  }, [url, entryId, midiTarget])
  return state !== null && state.id === entryId ? state : {}
}
