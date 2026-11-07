// Dev player (P13, on the P17 hooks): a plain control panel. Replaced by the themed app from P18.
import { useEffect, useState } from 'react'
import { PlayerProvider, usePlayer } from './state/PlayerContext'
import { SettingsProvider, useSettings } from './state/SettingsContext'
import { VisualizerHost, visualizers } from './viz'

function DevPlayer() {
  const player = usePlayer()
  const { settings, update } = useSettings()
  const { engine, status, entries, manifestError, muteMask } = player
  const [selected, setSelected] = useState('')
  const [message, setMessage] = useState('')
  const [where, setWhere] = useState('')

  useEffect(() => {
    const timer = setInterval(() => {
      const l = engine.latest()
      if (l?.snap.pos.kind === 'tracker') {
        const p = l.snap.pos
        setWhere(
          `order ${p.order} · pattern ${p.pattern} · row ${p.row} · speed ${p.speed} · tempo ${p.tempo}`,
        )
      }
    }, 100)
    return () => clearInterval(timer)
  }, [engine])

  const song = engine.current?.song
  const channels = song?.kind === 'tracker' ? song.channels : 0
  const { interpolation, stereoSeparation, lastViz } = settings.player
  const setPlayer = (patch: Partial<typeof settings.player>) =>
    update((s) => ({ ...s, player: { ...s.player, ...patch } }))

  const choose = (id: string) => {
    setSelected(id)
    setMessage('')
    player
      .play(id)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Failed'))
  }

  const step = (d: number) => {
    const p = engine.latest()?.snap.pos
    if (p?.kind === 'tracker') engine.seek({ order: Math.max(0, p.order + d) })
  }

  return (
    <main>
      <h1>TRACKER JUKEBOX · dev player</h1>
      <p>
        {status}
        {message && ` · ${message}`}
        {manifestError && ` · ${manifestError.message}`}
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
        <button onClick={player.toggle}>{status === 'playing' ? 'Pause' : 'Play'}</button>
        <button onClick={() => step(-1)}>Order −</button>
        <button onClick={() => step(1)}>Order +</button>
      </p>
      <p>{where}</p>
      <label>
        Visualizer{' '}
        <select value={lastViz} onChange={(e) => setPlayer({ lastViz: e.target.value })}>
          {visualizers.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <div style={{ height: 240 }}>
        <VisualizerHost vizId={lastViz} engine={engine} label="Visualizer" />
      </div>
      <label>
        Interpolation{' '}
        <select
          value={interpolation}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'nearest' || v === 'linear' || v === 'cubic') setPlayer({ interpolation: v })
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
          value={stereoSeparation}
          onChange={(e) => setPlayer({ stereoSeparation: Number(e.target.value) })}
        />
      </label>
      <p>
        {Array.from({ length: channels }, (_, c) => (
          <label key={c}>
            <input
              type="checkbox"
              checked={Boolean(muteMask & (1 << c))}
              onChange={(e) => player.setMuted(c, e.target.checked)}
            />
            mute {c + 1}{' '}
          </label>
        ))}
      </p>
    </main>
  )
}

export function App() {
  return (
    <SettingsProvider>
      <PlayerProvider>
        <DevPlayer />
      </PlayerProvider>
    </SettingsProvider>
  )
}
