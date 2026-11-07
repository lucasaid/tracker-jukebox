import type { VisualizerDef } from './types'

export type { Frame, VisualizerDef, VisualizerInstance } from './types'
export { VisualizerHost } from './VisualizerHost'

/** Final order: pattern, scope, channels, plasma, starfield, copper. Entries are added from P14. */
export const visualizers: readonly VisualizerDef[] = []

export function getVisualizer(_id: string): VisualizerDef {
  throw new Error('Not implemented (P14)')
}
