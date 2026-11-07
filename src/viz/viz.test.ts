import { describe, expect, it } from 'vitest'
import config from '../../viz.config.json'
import { all, getVisualizer, visualizers } from './registry'

describe('viz.config.json', () => {
  it('lists every registered visualizer', () => {
    expect(Object.keys(config.enabled).sort()).toEqual(all.map((v) => v.id).sort())
  })
  it('enables at least one visualizer', () => {
    expect(visualizers.length).toBeGreaterThan(0)
  })
  it('falls back to an enabled visualizer for unknown ids', () => {
    expect(visualizers).toContain(getVisualizer('nope'))
  })
})
