// Per-channel scopes + VU (decision 30).
import { createColourCycle } from './colours'
import type { VisualizerDef } from './types'

const VU_DECAY_SEC = 0.3

export const channels: VisualizerDef = {
  id: 'channels',
  name: 'Channels',
  streams: false,
  create: (mode = 0) => {
    let vu: number[] = []
    const cycle = createColourCycle(mode)
    return {
      click: cycle.next,
      draw(ctx, f, dt) {
        const w = f?.width ?? ctx.canvas.clientWidth
        const h = f?.height ?? ctx.canvas.clientHeight
        const p = f?.palette
        ctx.fillStyle = p?.bg ?? '#000'
        ctx.fillRect(0, 0, w, h)
        if (!f || !p) return
        const scopes = f.snap.scopes
        const n = scopes.length
        if (n === 0) return
        const wave = cycle.colour(p)
        if (vu.length !== n) vu = new Array<number>(n).fill(0)
        const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * w) / Math.max(h, 1)))))
        const rows = Math.ceil(n / cols)
        const cw = w / cols
        const ch = h / rows
        ctx.lineWidth = 1
        ctx.font = '10px monospace'
        ctx.textBaseline = 'top'
        for (let c = 0; c < n; c++) {
          const s = scopes[c]
          if (!s) continue
          const x0 = (c % cols) * cw
          const y0 = Math.floor(c / cols) * ch
          let peak = 0
          for (let i = 0; i < s.length; i++) peak = Math.max(peak, Math.abs(s[i] ?? 0))
          vu[c] = Math.max(Math.min(peak, 1), (vu[c] ?? 0) - dt / VU_DECAY_SEC)

          ctx.strokeStyle = p.grid
          ctx.strokeRect(x0 + 0.5, y0 + 0.5, cw - 1, ch - 1)
          const vuW = 4
          ctx.fillStyle = wave
          const vuH = (vu[c] ?? 0) * (ch - 4)
          ctx.fillRect(x0 + cw - vuW - 2, y0 + ch - 2 - vuH, vuW, vuH)

          ctx.strokeStyle = wave
          ctx.beginPath()
          const plotW = cw - vuW - 6
          const mid = y0 + ch / 2
          for (let x = 0; x < plotW; x++) {
            const v = s[Math.floor((x / plotW) * s.length)] ?? 0
            const y = mid - v * (ch / 2 - 2)
            if (x === 0) ctx.moveTo(x0 + 2, y)
            else ctx.lineTo(x0 + 2 + x, y)
          }
          ctx.stroke()
          ctx.fillStyle = p.dim
          ctx.fillText(String(c + 1), x0 + 4, y0 + 3)
        }
      },
    }
  },
}
