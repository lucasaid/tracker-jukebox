import { useEffect, useRef, useState } from 'react'
import type { AudioEngine } from '../audio/AudioEngine'
import { SCOPE_LEN } from '../engine'
import type { Snapshot } from '../engine'
import { NOTE_NONE } from '../formats'
import type { ParsedFile } from '../formats'
import { getVisualizer } from './registry'
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

/** Glow overlay size vs. the canvas; the browser's upscale + the CSS blur do the softening. */
const GLOW_SCALE = 0.25

/** Visualizers the bloom overlay skips: dense images that just wash out. */
const NO_GLOW: ReadonlySet<string> = new Set(['spectrogram'])

/** --viz-glow-opacity > 0 turns on the bloom overlay (see theme.css). */
function readGlow(): boolean {
  return (
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--viz-glow-opacity')) >
    0
  )
}

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

/** The song at its first row / first tick with nothing sounding: what a preview draws. */
function stillSnapshot(song: ParsedFile): Snapshot {
  const n = song.kind === 'tracker' ? song.channels : song.kind === 'stream' ? 2 : 16
  return {
    frame: 0,
    seconds: 0,
    pos:
      song.kind === 'stream'
        ? { kind: 'stream' }
        : song.kind === 'tracker'
          ? {
              kind: 'tracker',
              order: 0,
              pattern: song.orders[0] ?? 0,
              row: 0,
              tick: 0,
              speed: song.initialSpeed,
              tempo: song.initialTempo,
            }
          : {
              kind: 'midi',
              tick: 0,
              tempo: song.kind === 'midi' ? 6e7 / (song.tempoMap[0]?.usPerBeat ?? 500000) : 0,
            },
    ch: Array.from({ length: n }, () => ({
      active: false,
      note: NOTE_NONE,
      ins: 0,
      volume: 0,
      pan: 0,
      triggered: false,
    })),
    scopes: Array.from({ length: n }, () => new Float32Array(SCOPE_LEN)),
  }
}

export function VisualizerHost(props: {
  vizId: string
  engine: AudioEngine
  label: string
  className?: string
  /** draw this song, still and silent, instead of what the engine plays */
  preview?: ParsedFile
  /** the visualizer's click mode to start in; read at creation only */
  mode?: number
  /** called with the new mode after a click that changed it */
  onMode?: (mode: number) => void
}) {
  const { vizId, engine, label, className, preview } = props
  // refs, so a remembered mode change doesn't recreate the visualizer
  const modeRef = useRef(props.mode ?? 0)
  const onModeRef = useRef(props.onMode)
  // declared before the create effect, so it runs first
  useEffect(() => {
    modeRef.current = props.mode ?? 0
    onModeRef.current = props.onMode
  })
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLCanvasElement>(null)
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
    const def = getVisualizer(id)
    const instance = def.create(modeRef.current)
    instanceRef.current = instance
    // Made on the first streamed frame for a visualizer that can't draw MP3/FLAC.
    let fallback: VisualizerInstance | null = null

    const glowCanvas = glowRef.current
    const glowCtx = glowCanvas?.getContext('2d')
    let palette = readPalette()
    let glow = readGlow()
    const themeObserver = new MutationObserver(() => {
      palette = readPalette()
      glow = readGlow()
      if (!glow) glowCtx?.clearRect(0, 0, glowCanvas?.width ?? 0, glowCanvas?.height ?? 0)
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    const time = new Float32Array(2048)
    const freq = new Uint8Array(1024)
    const size = { width: 0, height: 0, dpr: 1 }
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const still = preview ? { snap: stillSnapshot(preview), song: preview } : null
    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1
      size.width = box.clientWidth
      size.height = box.clientHeight
      size.dpr = dpr
      canvas.width = Math.max(1, Math.round(size.width * dpr))
      canvas.height = Math.max(1, Math.round(size.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (glowCanvas) {
        glowCanvas.width = Math.max(1, Math.round(canvas.width * GLOW_SCALE))
        glowCanvas.height = Math.max(1, Math.round(canvas.height * GLOW_SCALE))
      }
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
      const latest = still ?? engine.latest()
      const analyser = engine.analyser
      let f: Frame | null = null
      if (latest && (analyser || still)) {
        // A preview is silent: time/freq stay zero rather than showing the playing song's audio.
        if (analyser && !still) {
          analyser.getFloatTimeDomainData(time)
          analyser.getByteFrequencyData(freq)
        }
        f = { snap: latest.snap, song: latest.song, time, freq, ...size, reducedMotion, palette }
      }
      try {
        const target =
          def.streams === false && latest?.song.kind === 'stream'
            ? (fallback ??= getVisualizer('scope').create())
            : instance
        target.draw(ctx, f, dt)
        // Bloom: a small copy on an overlay, so the main canvas (and any trails it keeps) is untouched.
        if (glow && glowCanvas && glowCtx && !NO_GLOW.has(id)) {
          glowCtx.drawImage(canvas, 0, 0, glowCanvas.width, glowCanvas.height)
        }
      } catch (err) {
        // Stop now so it logs once; the re-render with the scope starts a fresh loop.
        cancelAnimationFrame(raf)
        console.warn(`Visualizer "${id}" failed, switching to scope`, err)
        if (id !== 'scope') setFailedId(vizId)
        return
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
      fallback?.dispose?.()
      instanceRef.current = null
    }
  }, [id, vizId, engine, label, preview])

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
          const mode = instanceRef.current?.click?.(e.clientX - r.left, e.clientY - r.top)
          if (mode !== undefined) onModeRef.current?.(mode)
        }}
      />
      <canvas
        ref={glowRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          mixBlendMode: 'screen',
          filter: 'var(--viz-glow-filter)',
          opacity: 'var(--viz-glow-opacity)',
        }}
      />
    </div>
  )
}
