import { channels } from './channels'
import { copper, plasma, starfield } from './demo'
import { pattern } from './pattern'
import { scope } from './scope'
import type { VisualizerDef } from './types'

export type { Frame, Palette, VisualizerDef, VisualizerInstance } from './types'
export { VisualizerHost } from './VisualizerHost'

/** Final order: pattern, scope, channels, plasma, starfield, copper. */
export const visualizers: readonly VisualizerDef[] = [
  pattern,
  scope,
  channels,
  plasma,
  starfield,
  copper,
]

/** Unknown id → the first visualizer. */
export function getVisualizer(id: string): VisualizerDef {
  return visualizers.find((v) => v.id === id) ?? pattern
}
