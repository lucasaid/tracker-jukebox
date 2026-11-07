import type { ReactNode } from 'react'
import type { Settings } from './settings'

export function SettingsProvider(_props: { children: ReactNode }) {
  // Implemented in P17.
  return null
}

export function useSettings(): { settings: Settings; update(fn: (s: Settings) => Settings): void } {
  throw new Error('Not implemented (P17)')
}
