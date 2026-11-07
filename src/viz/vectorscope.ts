// Vectorscope / goniometer: each stereo sample plotted as a dot, rotated 45° so mono is a vertical
// line and wide stereo spreads sideways. L/R are rebuilt from the channel scopes, like the VU meters.
// Themed: --scope-bg, --scope-grid guides, --dim labels, --scope-wave dots.
import { SCOPE_LEN } from '../engine'
import { idle } from './demo'
import type { VisualizerDef, VisualizerInstance } from './types'
import { mixLR } from './vu'

const FADE_PER_SEC = 10 // phosphor persistence
const AGC_SEC = 0.5 // auto-gain time constant
const FILL = 0.9 // the auto-gain aims the loudest sample at this fraction of the radius

function vectorscopeInstance(): VisualizerInstance {
  const left = new Float32Array(SCOPE_LEN)
  const right = new Float32Array(SCOPE_LEN)
  let gain = 1
  let size = ''
  return {
    draw(ctx, f, dt) {
      if (!f) return idle(ctx, f)
      const key = `${f.width}x${f.height}`
      const a = key === size && !f.reducedMotion ? 1 - Math.exp(-FADE_PER_SEC * dt) : 1
      size = key
      const p = f.palette
      ctx.globalAlpha = a
      ctx.fillStyle = p.bg
      ctx.fillRect(0, 0, f.width, f.height)
      ctx.globalAlpha = 1

      const cx = f.width / 2
      const cy = f.height / 2
      const R = Math.min(f.width, f.height) * 0.45
      ctx.strokeStyle = p.grid
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.moveTo(cx, cy - R) // M (mono)
      ctx.lineTo(cx, cy + R)
      ctx.moveTo(cx - R, cy) // S (side)
      ctx.lineTo(cx + R, cy)
      const d = R * Math.SQRT1_2
      ctx.moveTo(cx - d, cy - d) // L
      ctx.lineTo(cx + d, cy + d)
      ctx.moveTo(cx + d, cy - d) // R
      ctx.lineTo(cx - d, cy + d)
      ctx.stroke()
      ctx.fillStyle = p.dim
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('L', cx - d - 8, cy - d - 4)
      ctx.fillText('R', cx + d + 8, cy - d - 4)

      const len = mixLR(f, left, right)
      let peak = 0
      for (let i = 0; i < len; i++) {
        peak = Math.max(peak, Math.abs(left[i] ?? 0), Math.abs(right[i] ?? 0))
      }
      // ponytail: simple auto-gain so quiet songs still fill the circle; the plot shows shape, not level
      if (peak > 1e-4) gain += (FILL / peak - gain) * Math.min(1, dt / AGC_SEC)
      ctx.fillStyle = p.wave
      for (let i = 0; i < len; i++) {
        const l = (left[i] ?? 0) * gain
        const r = (right[i] ?? 0) * gain
        const x = cx + (r - l) * Math.SQRT1_2 * R
        const y = cy - (l + r) * Math.SQRT1_2 * R
        ctx.fillRect(x - 1, y - 1, 2, 2)
      }
    },
  }
}

export const vectorscope: VisualizerDef = {
  id: 'vectorscope',
  name: 'Vector',
  create: vectorscopeInstance,
}
