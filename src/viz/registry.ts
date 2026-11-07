// Visualizer registry, filtered by viz.config.json at build time.
import config from '../../viz.config.json'
import { bars } from './bars'
import { channels } from './channels'
import { copper, plasma, starfield } from './demo'
import { oscilloscope } from './oscilloscope'
import { pattern } from './pattern'
import { scope } from './scope'
import { spectrogram } from './spectrogram'
import { superscope } from './superscope'
import { terrain } from './terrain'
import { vu } from './vu'
import { warp } from './warp'
import type { VisualizerDef } from './types'

/** Every visualizer, in display order. */
export const all: readonly VisualizerDef[] = [
  pattern,
  scope,
  channels,
  bars,
  oscilloscope,
  spectrogram,
  terrain,
  vu,
  warp,
  superscope,
  plasma,
  starfield,
  copper,
]

const enabled: Record<string, boolean> = config.enabled
// ponytail: filtered at runtime, so disabled visualizers still ship in the bundle (a few KB); use dynamic imports if size matters.
/** The ones switched on in viz.config.json (an id missing from the file counts as off). */
export const visualizers: readonly VisualizerDef[] = all.filter((v) => enabled[v.id] === true)

/** Unknown or disabled id → the first enabled visualizer. */
export function getVisualizer(id: string): VisualizerDef {
  return visualizers.find((v) => v.id === id) ?? visualizers[0] ?? pattern
}
