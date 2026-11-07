import { useEffect, useRef, useState } from 'react'
import type { AudioEngine } from '../audio/AudioEngine'
import { getVisualizer } from './index'
import type { Frame, Palette, VisualizerInstance } from './types'

const TOKENS: readonly (readonly [keyof Palette, string])[] = [
  ['fg', '--fg'],
  ['dim', '--dim'],
  ['accent', '--accent'],
  ['rownum', '--pat-rownum'],
  ['note', '--pat-note'],
  ['inst', '--pat-inst'],
  ['vol', '--pat-vol'],
  ['fx', '--pat-fx'],
  ['empty', '--pat-empty'],
  ['sep', '--pat-sep'],
  ['beat', '--pat-beat'],
  ['cur', '--pat-cur'],
  ['bg', '--scope-bg'],
  ['grid', '--scope-grid'],
  ['wave', '--scope-wave'],
]

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement)
  const p: Palette = {
    fg: '',
    dim: '',
    accent: '',
    rownum: '',
    note: '',
    inst: '',
    vol: '',
    fx: '',
    empty: '',
    sep: '',
    beat: '',
    cur: '',
    bg: '',
    grid: '',
    wave: '',
  }
  for (const [key, token] of TOKENS) p[key] = css.getPropertyValue(token).trim()
  return p
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

export function VisualizerHost(props: {
  vizId: string
  engine: AudioEngine
  label: string
  className?: string
}) {
  const { vizId, engine, label, className } = props
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const instanceRef = useRef<VisualizerInstance | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const [aria, setAria] = useState(label)
  // A visualizer that threw is replaced by the scope until the caller picks another one.
  const id = failedId === vizId ? 'scope' : vizId

  useEffect(() => {
    const box = boxRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!box || !canvas || !ctx) return
    const instance = getVisualizer(id).create()
    instanceRef.current = instance

    let palette = readPalette()
    const themeObserver = new MutationObserver(() => {
      palette = readPalette()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    const time = new Float32Array(2048)
    const freq = new Uint8Array(1024)
    const size = { width: 0, height: 0, dpr: 1 }
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1
      size.width = box.clientWidth
      size.height = box.clientHeight
      size.dpr = dpr
      canvas.width = Math.max(1, Math.round(size.width * dpr))
      canvas.height = Math.max(1, Math.round(size.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(box)
    resize()

    let raf = 0
    let last = 0
    let lastAria = 0
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop)
      const dt = last === 0 ? 0 : (now - last) / 1000
      last = now
      const latest = engine.latest()
      const analyser = engine.analyser
      let f: Frame | null = null
      if (latest && analyser) {
        analyser.getFloatTimeDomainData(time)
        analyser.getByteFrequencyData(freq)
        f = { snap: latest.snap, song: latest.song, time, freq, ...size, reducedMotion, palette }
      }
      try {
        instance.draw(ctx, f, dt)
      } catch (err) {
        console.warn(`Visualizer "${id}" failed, switching to scope`, err)
        if (id === 'scope') cancelAnimationFrame(raf)
        else setFailedId(vizId)
      }
      if (latest && now - lastAria > 500) {
        lastAria = now
        const { song, snap } = latest
        const where =
          snap.pos.kind === 'tracker'
            ? `order ${snap.pos.order} row ${snap.pos.row}`
            : `${Math.floor(snap.seconds / 60)}:${pad2(Math.floor(snap.seconds % 60))}`
        setAria(`${label}: ${song.title}, ${where}`)
      }
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      instance.dispose?.()
      instanceRef.current = null
    }
  }, [id, vizId, engine, label])

  return (
    <div
      ref={boxRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={aria}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          instanceRef.current?.click?.(e.clientX - r.left, e.clientY - r.top)
        }}
      />
    </div>
  )
}
