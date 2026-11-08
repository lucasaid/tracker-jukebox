// Click-to-cycle colour for the single-colour visualizers: steps through the theme's distinct
// palette colours, starting at --scope-wave. `lap` counts full trips through the list, so a
// visualizer can switch mode each time the colours wrap around.
import type { Palette } from './types'

const KEYS: readonly (keyof Palette)[] = ['wave', 'accent', 'note', 'inst', 'vol', 'fx', 'fg']

/** The theme's distinct colours, --scope-wave first. */
export const themeColours = (p: Palette): string[] => [
  ...new Set(KEYS.map((k) => p[k].toLowerCase()).filter(Boolean)),
]

export function createColourCycle(start = 0): {
  next(): number
  colour(p: Palette): string
  lap(p: Palette): number
} {
  let i = start
  let last: Palette | null = null
  let colours: string[] = []
  const list = (p: Palette): string[] => {
    // the host swaps in a new Palette object on a theme change
    if (p !== last) {
      last = p
      colours = themeColours(p)
    }
    return colours
  }
  return {
    next() {
      return ++i
    },
    colour(p) {
      const c = list(p)
      return c[i % Math.max(1, c.length)] ?? p.wave
    },
    lap(p) {
      return Math.floor(i / Math.max(1, list(p).length))
    },
  }
}
