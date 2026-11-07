import { channels } from './channels'
import { scope } from './scope'
import type { VisualizerDef } from './types'

export type { Frame, Palette, VisualizerDef, VisualizerInstance } from './types'
export { VisualizerHost } from './VisualizerHost'

/** Final order: pattern, scope, channels, plasma, starfield, copper. Entries are added from P15. */
export const visualizers: readonly VisualizerDef[] = [scope, channels]

/** Unknown id → the first visualizer. */
export function getVisualizer(id: string): VisualizerDef {
  return visualizers.find((v) => v.id === id) ?? scope
}
