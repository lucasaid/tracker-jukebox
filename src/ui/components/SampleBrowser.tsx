// Sample list with waveform and audition (trackers only).
import { useEffect, useRef, useState } from 'react'
import type { Sample } from '../../formats'
import { usePlayer } from '../../state/PlayerContext'
import styles from '../ui.module.css'
import { showToast } from './Toast'

const MIN_BUFFER_HZ = 8000 // AudioBuffer sample-rate floor in older browsers
const MAX_BUFFER_HZ = 96000

export function SampleBrowser({ samples }: { samples: readonly Sample[] }) {
  const { engine } = usePlayer()
  const [picked, setPicked] = useState(-1)
  const source = useRef<AudioBufferSourceNode | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const sample = samples[picked]

  useEffect(() => () => source.current?.stop(), [])

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    if (!sample || sample.data.length === 0) return
    ctx.fillStyle = getComputedStyle(c).color
    const mid = c.height / 2
    const step = sample.data.length / c.width
    for (let x = 0; x < c.width; x++) {
      let lo = 0
      let hi = 0
      const to = Math.min(sample.data.length, Math.ceil((x + 1) * step))
      for (let i = Math.floor(x * step); i < to; i++) {
        const v = sample.data[i] as number
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      ctx.fillRect(x, mid - hi * mid, 1, Math.max(1, (hi - lo) * mid))
    }
  }, [sample])

  const audition = async (i: number): Promise<void> => {
    setPicked(i)
    const s = samples[i]
    if (!s || s.data.length === 0) return
    try {
      await engine.unlock() // a preview can be auditioned before anything has played
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Audio is not available')
      return
    }
    const ctx = engine.context
    if (!ctx) return
    source.current?.stop()
    // Played once at c2spd, i.e. the sample's own pitch at C-4. ponytail: loops are not auditioned.
    const bufHz = Math.max(MIN_BUFFER_HZ, Math.min(MAX_BUFFER_HZ, s.c2spd))
    const buf = ctx.createBuffer(1, s.data.length, bufHz)
    buf.getChannelData(0).set(s.data)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = s.c2spd / bufHz
    src.connect(ctx.destination)
    src.start()
    source.current = src
  }

  const shown = samples.flatMap((s, i) => (s.data.length > 0 ? [{ s, i }] : []))
  if (shown.length === 0) return <p className={styles.note}>No samples.</p>
  return (
    <div>
      <canvas ref={canvas} className={styles.wave} width={640} height={96} aria-hidden="true" />
      <ul className={styles.sampleList} aria-label="Samples">
        {shown.map(({ s, i }) => (
          <li key={i}>
            <button
              className={`${styles.chip} ${i === picked ? styles.chipOn : ''}`}
              aria-pressed={i === picked}
              onClick={() => void audition(i)}
            >
              {String(i + 1).padStart(2, '0')} {s.name || '(unnamed)'} · {s.data.length}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
