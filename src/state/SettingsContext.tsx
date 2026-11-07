import { createContext, useContext, useState } from 'react'
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
  const update = (fn: (s: Settings) => Settings): void => {
    const next = fn(settings)
    saveSettings(next)
    setSettings(next)
  }
  return <Ctx value={{ settings, update }}>{children}</Ctx>
}

export function useSettings(): SettingsApi {
  const api = useContext(Ctx)
  if (!api) throw new Error('useSettings needs a SettingsProvider')
  return api
}
