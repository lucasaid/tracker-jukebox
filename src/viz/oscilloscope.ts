// Winamp 2.x style oscilloscope: click cycles dots → lines → solid. Keeps its own colours, like bars.
import type { VisualizerDef, VisualizerInstance } from './types'

const MODES = ['dots', 'lines', 'solid'] as const
const LABEL_SEC = 1.5

function oscilloscopeInstance(): VisualizerInstance {
  let mode = 0
  let labelSec = 0
  let gradient: CanvasGradient | null = null
  let gradientH = 0
  return {
    click() {
      mode = (mode + 1) % MODES.length
      labelSec = LABEL_SEC
    },
    draw(ctx, f, dt) {
      const w = f?.width ?? ctx.canvas.clientWidth
      const h = f?.height ?? ctx.canvas.clientHeight
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      if (!f) return
      if (!gradient || gradientH !== h) {
        // bright at the centre line, hotter toward the peaks
        gradient = ctx.createLinearGradient(0, 0, 0, h)
        gradient.addColorStop(0, '#ff4000')
        gradient.addColorStop(0.3, '#ffc000')
        gradient.addColorStop(0.5, '#ffffc0')
        gradient.addColorStop(0.7, '#ffc000')
        gradient.addColorStop(1, '#ff4000')
        gradientH = h
      }
      const mid = h / 2
      const amp = mid - 2
      const n = f.time.length
      const m = MODES[mode]
      ctx.fillStyle = gradient
      ctx.strokeStyle = gradient
      ctx.lineWidth = 1.5
      if (m === 'lines') ctx.beginPath()
      for (let x = 0; x < w; x++) {
        const v = Math.max(-1, Math.min(1, f.time[Math.floor((x / w) * n)] ?? 0))
        const y = mid - v * amp
        if (m === 'dots') ctx.fillRect(x, y - 1, 2, 2)
        else if (m === 'solid') ctx.fillRect(x, Math.min(y, mid), 1, Math.max(1, Math.abs(y - mid)))
        else if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      if (m === 'lines') ctx.stroke()
      if (labelSec > 0) {
        labelSec -= dt
        ctx.fillStyle = '#c0c0c0'
        ctx.font = '12px monospace'
        ctx.fillText(m ?? '', 6, 16)
      }
    },
  }
}

export const oscilloscope: VisualizerDef = {
  id: 'oscilloscope',
  name: 'Osc',
  create: oscilloscopeInstance,
}
