import { useEffect, useRef } from 'react'
import { ConnectOverlay } from './ui/components/ConnectOverlay'
import { ErrorBoundary } from './ui/components/ErrorBoundary'
import { PlayerBar } from './ui/components/PlayerBar'
import { Toast, showToast } from './ui/components/Toast'
import { Browse } from './ui/pages/Browse'
import { Jukebox } from './ui/pages/Jukebox'
import { NowPlaying } from './ui/pages/NowPlaying'
import { PlayerProvider, usePlayer } from './state/PlayerContext'
import { useHashRoute } from './state/route'
import { SettingsProvider, useSettings } from './state/SettingsContext'
import { THEMES } from './state/settings'
import { visualizers } from './viz'
import styles from './ui/ui.module.css'

const TYPING = 'input, textarea, select, [contenteditable]'

function Shell() {
  const player = usePlayer()
  const { settings, update } = useSettings()
  const [route, go] = useHashRoute()
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  // Share links: wait for the manifest, then connect (locked) or switch song (unlocked).
  const manifestReady = player.entries.length > 0 || player.manifestError !== null
  const playId = route.page === 'play' ? route.id : null
  const known = playId !== null && player.entries.some((e) => e.id === playId)
  const locked = player.status === 'locked'
  const started = useRef('')
  const routeKey = route.page === 'play' ? JSON.stringify(route) : ''
  const { play, entries, status, current } = player
  useEffect(() => {
    if (playId === null || !manifestReady) return
    if (!known) {
      showToast('Song not found')
      go({ page: 'browse' })
      return
    }
    if (locked || started.current === routeKey) return
    started.current = routeKey
    if (current?.id !== playId && status !== 'loading')
      void play(playId, { seek: route.page === 'play' ? (route.seek ?? undefined) : undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per route change, not per player update
  }, [routeKey, manifestReady, known, locked])
  const connect = () => {
    if (route.page !== 'play') return
    started.current = routeKey
    void play(route.id, { seek: route.seek ?? undefined })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (t instanceof Element && t.closest(TYPING)) return
      const { engine, muteMask } = player
      const digit = /^Digit(\d)$/.exec(e.code)
      const n = digit ? Number(digit[1]) : -1
      const consume = (): void => e.preventDefault()
      if (e.code === 'Space') {
        if (t instanceof Element && t.closest('button, a')) return // the focused control handles Space
        consume()
        player.toggle()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const d = e.key === 'ArrowLeft' ? -1 : 1
        const snap = engine.latest()?.snap
        if (snap?.pos.kind === 'tracker') engine.seek({ order: Math.max(0, snap.pos.order + d) })
        else if (snap) engine.seek({ seconds: Math.max(0, snap.seconds + d * 10) })
        consume()
      } else if (e.key === 'n' || e.key === 'N') {
        void player.next()
      } else if (e.key === 'v' || e.key === 'V') {
        const i = visualizers.findIndex((v) => v.id === settings.player.lastViz)
        const next = visualizers[(i + 1) % visualizers.length]
        if (next) update((s) => ({ ...s, player: { ...s.player, lastViz: next.id } }))
      } else if (e.key === 't' || e.key === 'T') {
        const next = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length]
        if (next) update((s) => ({ ...s, theme: next }))
      } else if (n >= 0) {
        consume()
        if (e.shiftKey) player.solo(n === 0 ? null : n - 1)
        else if (n >= 1) player.setMuted(n - 1, !(muteMask & (1 << (n - 1))))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const page = route.page === 'landing' ? 'browse' : route.page
  return (
    <>
      <header className={styles.top}>
        <h1 className={styles.title}>TRACKER JUKEBOX</h1>
        <nav className={styles.nav}>
          <a href="#/browse" aria-current={page === 'browse' ? 'page' : undefined}>
            Browse
          </a>
          <a href="#/jukebox" aria-current={page === 'jukebox' ? 'page' : undefined}>
            Jukebox
          </a>
        </nav>
        <div className={styles.rule} />
      </header>
      <main className={styles.main}>
        <ErrorBoundary>
          {route.page === 'play' && known ? (
            <NowPlaying />
          ) : route.page === 'jukebox' ? (
            <Jukebox />
          ) : (
            <Browse />
          )}
        </ErrorBoundary>
      </main>
      <Toast />
      <PlayerBar />
      {route.page === 'play' && known && locked && (
        <ConnectOverlay
          title={entries.find((e) => e.id === route.id)?.title ?? ''}
          onConnect={connect}
        />
      )}
    </>
  )
}

export function App() {
  return (
    <SettingsProvider>
      <PlayerProvider>
        <Shell />
      </PlayerProvider>
    </SettingsProvider>
  )
}
