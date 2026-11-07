// Dev player (P13): a plain control panel for the AudioEngine. Replaced by the themed app from P17.
import { useEffect, useState } from 'react'
import { AudioEngine } from './audio/AudioEngine'
import type { EngineStatus } from './audio/AudioEngine'
import type { Interpolation } from './engine'
import { loadManifest } from './library/manifest'
import type { ManifestEntry } from './library/manifest'
import { VisualizerHost, visualizers } from './viz'

const DEBUG = new URLSearchParams(location.search).get('debug') === '1'

export function App() {
  const [engine] = useState(() => new AudioEngine({ debug: DEBUG }))
  const [entries, setEntries] = useState<ManifestEntry[]>([])
  const [selected, setSelected] = useState('')
  const [status, setStatus] = useState<EngineStatus>('locked')
  const [message, setMessage] = useState('')
  const [where, setWhere] = useState('')
  const [interpolation, setInterpolation] = useState<Interpolation>('nearest')
  const [stereo, setStereo] = useState(1)
  const [muteMask, setMuteMask] = useState(0)
  const [channels, setChannels] = useState(0)
  const [vizId, setVizId] = useState('pattern')

  useEffect(() => {
    const e = engine
    loadManifest().then(setEntries, (err: unknown) =>
      setMessage(err instanceof Error ? err.message : 'Manifest failed'),
    )
    const off = e.on((ev) => {
      if (ev.type === 'status') setStatus(ev.status)
      else if (ev.type === 'error') setMessage(ev.error.message)
      else if (ev.type === 'stats') console.table(ev.stats)
    })
    const timer = setInterval(() => {
      const l = e.latest()
      if (l?.snap.pos.kind === 'tracker') {
        const p = l.snap.pos
        setWhere(
          `order ${p.order} · pattern ${p.pattern} · row ${p.row} · speed ${p.speed} · tempo ${p.tempo}`,
        )
      }
    }, 100)
    return () => {
      clearInterval(timer)
      off()
    }
  }, [engine])

  const run = async (fn: (e: AudioEngine) => Promise<void> | void) => {
    const e = engine
    try {
      await e.unlock()
      await fn(e)
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError'))
        setMessage(err instanceof Error ? err.message : 'Failed')
    }
  }

  const choose = (id: string) => {
    setSelected(id)
    setMessage('')
    void run(async (e) => {
      const entry = entries.find((x) => x.id === id)
      if (!entry?.url) return
      const loaded = await e.load({ id, url: entry.url }, { autoplay: true })
      setChannels(loaded.song.kind === 'tracker' ? loaded.song.channels : 0)
      setMuteMask(0)
      e.setOptions({ muteMask: 0 })
    })
  }

  const step = (d: number) => {
    const p = engine.latest()?.snap.pos
    if (p?.kind === 'tracker') engine.seek({ order: Math.max(0, p.order + d) })
  }

  const toggleMute = (c: number) => {
    const next = muteMask ^ (1 << c)
    setMuteMask(next)
    engine.setOptions({ muteMask: next })
  }

  return (
    <main>
      <h1>TRACKER JUKEBOX · dev player</h1>
      <p>
        {status}
        {message && ` · ${message}`}
      </p>
      <select size={12} value={selected} onChange={(e) => choose(e.target.value)}>
        {entries
          .filter((x) => x.url && x.format !== 'midi')
          .map((x) => (
            <option key={x.id} value={x.id}>
              {x.id} · {x.title}
            </option>
          ))}
      </select>
      <p>
        <button onClick={() => (status === 'playing' ? engine.pause() : engine.play())}>
          {status === 'playing' ? 'Pause' : 'Play'}
        </button>
        <button onClick={() => step(-1)}>Order −</button>
        <button onClick={() => step(1)}>Order +</button>
      </p>
      <p>{where}</p>
      <label>
        Visualizer{' '}
        <select value={vizId} onChange={(e) => setVizId(e.target.value)}>
          {visualizers.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <div style={{ height: 240 }}>
        <VisualizerHost vizId={vizId} engine={engine} label="Visualizer" />
      </div>
      <label>
        Interpolation{' '}
        <select
          value={interpolation}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'nearest' || v === 'linear' || v === 'cubic') {
              setInterpolation(v)
              engine.setOptions({ interpolation: v })
            }
          }}
        >
          <option>nearest</option>
          <option>linear</option>
          <option>cubic</option>
        </select>
      </label>{' '}
      <label>
        Stereo{' '}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={stereo}
          onChange={(e) => {
            const v = Number(e.target.value)
            setStereo(v)
            engine.setOptions({ stereoSeparation: v })
          }}
        />
      </label>
      <p>
        {Array.from({ length: channels }, (_, c) => (
          <label key={c}>
            <input
              type="checkbox"
              checked={Boolean(muteMask & (1 << c))}
              onChange={() => toggleMute(c)}
            />
            mute {c + 1}{' '}
          </label>
        ))}
      </p>
    </main>
  )
}
