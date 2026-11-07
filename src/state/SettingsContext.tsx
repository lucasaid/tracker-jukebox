import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { loadSettings, saveSettings } from './settings'
import type { Settings } from './settings'

interface SettingsApi {
  settings: Settings
  update(fn: (s: Settings) => Settings): void
}

const Ctx = createContext<SettingsApi | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(() => loadSettings())
  // `update` is stable and applies `fn` to the latest settings, so timers and listeners that
  // captured it neither restart on every render nor overwrite each other's changes.
  const latest = useRef(settings)
  const update = useCallback((fn: (s: Settings) => Settings): void => {
    const next = fn(latest.current)
    latest.current = next
    saveSettings(next)
    setSettings(next)
  }, [])
  return <Ctx value={{ settings, update }}>{children}</Ctx>
}

export function useSettings(): SettingsApi {
  const api = useContext(Ctx)
  if (!api) throw new Error('useSettings needs a SettingsProvider')
  return api
}
