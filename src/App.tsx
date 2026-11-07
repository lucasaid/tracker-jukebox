import { useEffect } from 'react'
import { ErrorBoundary } from './ui/components/ErrorBoundary'
import { PlayerBar } from './ui/components/PlayerBar'
import { Toast } from './ui/components/Toast'
import { Browse } from './ui/pages/Browse'
import { PlayerProvider } from './state/PlayerContext'
import { useHashRoute } from './state/route'
import { SettingsProvider, useSettings } from './state/SettingsContext'
import styles from './ui/ui.module.css'

function Shell() {
  const { settings } = useSettings()
  const [route] = useHashRoute()
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  // Until P22 (Landing, Credits), P20 (NowPlaying) and P21 (Jukebox) every route shows Browse.
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
          <Browse />
        </ErrorBoundary>
      </main>
      <Toast />
      <PlayerBar />
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
