// Click-to-cycle colour for the single-colour visualizers: steps through the theme's distinct
// palette colours, starting at --scope-wave.
import type { Palette } from './types'

const KEYS: readonly (keyof Palette)[] = ['wave', 'accent', 'note', 'inst', 'vol', 'fx', 'fg']

export function createColourCycle(): { next(): void; colour(p: Palette): string } {
  let i = 0
  let last: Palette | null = null
  let colours: string[] = []
  return {
    next() {
      i++
    },
    colour(p) {
      // the host swaps in a new Palette object on a theme change
      if (p !== last) {
        last = p
        colours = [...new Set(KEYS.map((k) => p[k].toLowerCase()).filter(Boolean))]
      }
      return colours[i % Math.max(1, colours.length)] ?? p.wave
    },
  }
}
