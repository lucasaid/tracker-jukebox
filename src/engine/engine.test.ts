import { describe, expect, it } from 'vitest'
import { Fx, NOTE_NONE } from '../formats'
import type { Cell, MidiEvent, MidiSong, Pattern, Song, SoundBank, Zone } from '../formats'
import { computeLength, createBeatDetector, createMidiPlayer, createTrackerPlayer } from './index'
import { Stage, createEnv, releaseEnv, startEnv, stepEnv } from './midi-synth'
import { createChannel, runTick, startRow } from './effects'
import { createVoice, mixVoice } from './mixer'
import { periodOf, periodToHz } from './pitch'
import { createSequencer } from './sequencer'

type Row = [row: number, fx: Fx, param: number]

const emptyCell = (): Cell => ({
  note: NOTE_NONE,
  ins: 0,
  vol: -1,
  fx: Fx.None,
  param: 0,
  fxRaw: -1,
  paramRaw: 0,
})

/** A 1-channel pattern of `rows` rows with the given effects. */
const pat = (rows: number, fx: Row[] = [], speed: number | null = null): Pattern => {
  const cells = Array.from({ length: rows }, emptyCell)
  for (const [row, f, param] of fx) cells[row] = { ...emptyCell(), fx: f, param }
  return { rows, speed, cells }
}

const songOf = (orders: number[], patterns: Pattern[], speed = 6, tempo = 125): Song => ({
  kind: 'tracker',
  format: 'mod',
  title: '',
  tracker: '',
  message: '',
  channels: 1,
  channelPan: [0],
  stereo: true,
  initialSpeed: speed,
  initialTempo: tempo,
  globalVolume: 64,
  mixGain: 1,
  orders,
  patterns,
  samples: [],
})

/** "order:row" of every row start, in play order, plus the final sequencer state. */
const trace = (song: Song): { rows: string[]; ticks: number; loops: boolean } => {
  const seq = createSequencer(song)
  const rows: string[] = []
  let ticks = 0
  let last = ''
  while (seq.advance()) {
    ticks++
    const key = `${seq.state.order}:${seq.state.row}`
    if (seq.state.tick === 0 && seq.state.repeat === 0) {
      rows.push(key)
      last = key
    }
    expect(last).toBe(key)
  }
  return { rows, ticks, loops: seq.state.loops }
}

describe('sequencer', () => {
  it('plays orders in sequence and ends without looping', () => {
    const t = trace(songOf([0, 0], [pat(2)]))
    expect(t.rows).toEqual(['0:0', '0:1', '1:0', '1:1'])
    expect(t.loops).toBe(false)
  })

  it('PosJump skips orders', () => {
    const t = trace(songOf([0, 1, 2], [pat(2, [[1, Fx.PosJump, 2]]), pat(2), pat(1)]))
    expect(t.rows).toEqual(['0:0', '0:1', '2:0'])
  })

  it('PatBreak goes to the next order at the given row', () => {
    const t = trace(songOf([0, 1], [pat(4, [[1, Fx.PatBreak, 2]]), pat(4)]))
    expect(t.rows).toEqual(['0:0', '0:1', '1:2', '1:3'])
  })

  it('PatLoop x2 repeats the section twice, without counting as a song loop', () => {
    const t = trace(
      songOf(
        [0],
        [
          pat(4, [
            [1, Fx.PatLoop, 0],
            [2, Fx.PatLoop, 2],
          ]),
        ],
      ),
    )
    expect(t.rows).toEqual(['0:0', '0:1', '0:2', '0:1', '0:2', '0:1', '0:2', '0:3'])
    expect(t.loops).toBe(false)
  })

  it('PatLoop works again on a later pass of a fresh loop', () => {
    const loop: Row[] = [
      [0, Fx.PatLoop, 0],
      [1, Fx.PatLoop, 1],
    ]
    const t = trace(songOf([0, 0], [pat(2, loop)]))
    expect(t.rows).toEqual(['0:0', '0:1', '0:0', '0:1', '1:0', '1:1', '1:0', '1:1'])
  })

  it('PatDelay x2 plays the row for three times its ticks', () => {
    const t = trace(songOf([0], [pat(2, [[0, Fx.PatDelay, 2]])], 4))
    expect(t.rows).toEqual(['0:0', '0:1'])
    expect(t.ticks).toBe(4 * 3 + 4)
  })

  it('SetSpeed and SetTempo change the row length and tick time', () => {
    const song = songOf(
      [0],
      [
        pat(2, [
          [0, Fx.SetSpeed, 3],
          [1, Fx.SetTempo, 250],
        ]),
      ],
    )
    expect(trace(song).ticks).toBe(6)
    // row 0: 3 ticks at 125 BPM, row 1: 3 ticks at 250 BPM
    expect(computeLength(song).seconds).toBeCloseTo(3 * 0.02 + 3 * 0.01, 9)
  })

  it('applies the 669 per-pattern speed at row 0', () => {
    expect(trace(songOf([0], [pat(2, [], 2)])).ticks).toBe(4)
  })

  it('a final jump to order 0 sets loops = true', () => {
    const t = trace(songOf([0, 1], [pat(2), pat(2, [[1, Fx.PosJump, 0]])]))
    expect(t.rows).toEqual(['0:0', '0:1', '1:0', '1:1'])
    expect(t.loops).toBe(true)
    expect(computeLength(songOf([0, 1], [pat(2), pat(2, [[1, Fx.PosJump, 0]])])).loops).toBe(true)
  })

  it('computeLength stops at maxSeconds', () => {
    // 64 rows x 6 ticks x 0.02 s = 7.68 s
    const song = songOf([0], [pat(64)])
    expect(computeLength(song).seconds).toBeCloseTo(7.68, 9)
    expect(computeLength(song, 5)).toEqual({ seconds: 5, loops: false, capped: true })
  })
})

const withCell = (c: Partial<Cell>): Cell => ({ ...emptyCell(), ...c })
const sampleOf = (data: number[], volume = 64) => ({
  name: '',
  data: Float32Array.from(data),
  loopStart: 0,
  loopEnd: 0,
  volume,
  c2spd: 8363,
})
const stats = { unknownFx: 0, voices: 0 }

describe('pitch', () => {
  it('C-4 at c2spd 8363 is period 428, about 8287 Hz', () => {
    expect(periodOf(48, 8363, 'mod')).toBe(428)
    expect(Math.abs(periodToHz(428, 'mod') - 8287)).toBeLessThan(1)
    expect(Math.abs(periodToHz(periodOf(48, 8363, 's3m'), 's3m') - 8363)).toBeLessThan(1)
  })
})

describe('mixer', () => {
  const run = (v: ReturnType<typeof createVoice>, frames: number, gain = 1) => {
    const l = new Float32Array(frames)
    const r = new Float32Array(frames)
    mixVoice(v, l, r, 0, frames, 'nearest', gain, gain)
    return l
  }
  it('nearest at step 1.0 reproduces the sample data exactly', () => {
    const v = createVoice(256)
    const data = Float32Array.from([0.5, -0.25, 0.125, -1, 0.75])
    Object.assign(v, { data, step: 1, active: true })
    expect(Array.from(run(v, 5))).toEqual(Array.from(data))
  })
  it('a looped voice wraps to loopStart', () => {
    const v = createVoice(256)
    Object.assign(v, {
      data: Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7]),
      step: 1,
      active: true,
      loopStart: 2,
      loopEnd: 6,
    })
    expect(Array.from(run(v, 12))).toEqual([0, 1, 2, 3, 4, 5, 2, 3, 4, 5, 2, 3])
  })
  it('a muted (zero-gain) voice contributes 0 but keeps moving', () => {
    const v = createVoice(256)
    Object.assign(v, { data: Float32Array.from([1, 1, 1, 1]), step: 1, active: true })
    expect(Array.from(run(v, 2, 0))).toEqual([0, 0])
    expect(v.pos).toBe(2)
  })
})

describe('effects', () => {
  const song = { ...songOf([0], [pat(1)]), samples: [sampleOf([1, 1, 1, 1])] }
  const start = (fx: number, param: number) => {
    const ch = createChannel(0, 256)
    startRow(ch, withCell({ note: 48, ins: 1, fx: fx as Fx, param }), song, stats)
    return ch
  }
  it.each([
    [Fx.Vibrato, 0x4f],
    [Fx.PortaUp, 4],
    [Fx.PortaDown, 4],
  ])('fx %i changes the period on ticks > 0 only', (fx, param) => {
    const ch = start(fx, param)
    expect(ch.outPeriod).toBe(428)
    const cell = withCell({ fx, param })
    runTick(ch, cell, 1, song)
    runTick(ch, cell, 2, song)
    expect(ch.outPeriod).not.toBe(428)
  })
  it('tone porta slides toward the target without passing it', () => {
    const ch = start(Fx.None, 0)
    startRow(ch, withCell({ note: 60, fx: Fx.TonePorta, param: 255 }), song, stats)
    expect(ch.period).toBe(428)
    runTick(ch, withCell({ fx: Fx.TonePorta }), 1, song)
    expect(ch.period).toBe(periodOf(60, 8363, 'mod'))
  })
})

describe('S3M effects', () => {
  const s3m: Song = { ...song0(), format: 's3m' }
  function song0(): Song {
    return { ...songOf([0], [pat(1)]), samples: [sampleOf([1, 1, 1, 1])] }
  }
  it('D uses its memory when the parameter is 0, and DxF is a fine slide on tick 0 only', () => {
    const ch = createChannel(0, 256)
    startRow(ch, withCell({ ins: 1, fx: Fx.VolSlide, param: 0x02 }), s3m, stats)
    expect(ch.vol).toBe(64)
    runTick(ch, withCell({ fx: Fx.VolSlide, param: 0 }), 1, s3m)
    expect(ch.vol).toBe(62) // remembered 0x02
    startRow(ch, withCell({ fx: Fx.VolSlide, param: 0x3f }), s3m, stats)
    expect(ch.vol).toBe(64) // fine up by 3, clamped
    startRow(ch, withCell({ fx: Fx.VolSlide, param: 0xf4 }), s3m, stats)
    expect(ch.vol).toBe(60) // fine down by 4
  })
})

describe('tracker player', () => {
  const noteSong = (): Song => {
    const p = pat(4)
    p.cells[0] = withCell({ note: 48, ins: 1 })
    return { ...songOf([0], [p]), samples: [sampleOf(Array.from({ length: 64 }, () => 0.5))] }
  }
  const renderAll = (muteMask: number) => {
    const player = createTrackerPlayer(noteSong(), 8000, { muteMask })
    const l = new Float32Array(5000)
    const r = new Float32Array(5000)
    const n = player.render(l, r, 5000)
    return { n, l, player }
  }
  it('plays audio, ends, and a muted channel is silent', () => {
    const loud = renderAll(0)
    expect(loud.l.some((x) => x !== 0)).toBe(true)
    expect(loud.n).toBe(3840) // 4 rows x 6 ticks x 160 frames
    const silent = renderAll(1)
    expect(silent.l.every((x) => x === 0)).toBe(true)
  })
  it('rejects a bad sample rate', () => {
    expect(() => createTrackerPlayer(noteSong(), 0)).toThrow(RangeError)
  })
  it('seek({ order }) lands at that order and clears ended', () => {
    const song = { ...songOf([0, 0, 0], [pat(2)]) }
    const player = createTrackerPlayer(song, 8000)
    player.render(new Float32Array(100000), new Float32Array(100000), 100000)
    expect(player.ended).toBe(true)
    player.seek({ order: 2 })
    expect(player.ended).toBe(false)
    expect(player.snapshot().pos).toMatchObject({ order: 2, row: 0 })
  })
})

describe('MIDI length', () => {
  it('walks the tempo map and adds 1 s', () => {
    const song: MidiSong = {
      kind: 'midi',
      format: 'midi',
      title: '',
      tracker: '',
      message: '',
      ticksPerBeat: 480,
      tempoMap: [
        { tick: 0, usPerBeat: 500000 },
        { tick: 480, usPerBeat: 1000000 },
      ],
      events: [{ tick: 960, ch: 0, type: 'noteOff', key: 60 }],
      channelsUsed: [],
      target: 'gm',
    }
    expect(computeLength(song).seconds).toBeCloseTo(0.5 + 1 + 1)
  })
})

describe('MIDI synth', () => {
  const SR = 1000
  const zoneOf = (over: Partial<Zone> = {}, env: Partial<Zone['env']> = {}): Zone => ({
    keyLo: 0,
    keyHi: 127,
    velLo: 0,
    velHi: 127,
    data: new Float32Array(100).fill(1),
    sampleRate: SR,
    rootKey: 60,
    tuneCents: 0,
    loopStart: 0,
    loopEnd: 100,
    loopMode: 1,
    attenuationDb: 0,
    pan: 0,
    env: { delayS: 0, attackS: 0, holdS: 0, decayS: 1, sustainDb: 0, releaseS: 0.001, ...env },
    exclusiveClass: 0,
    ...over,
  })
  const bankOf = (zone: Zone): SoundBank => ({
    name: '',
    presets: new Map([[0, { name: 'p', zones: [zone] }]]),
  })
  const midiOf = (events: MidiEvent[]): MidiSong => ({
    kind: 'midi',
    format: 'midi',
    title: '',
    tracker: '',
    message: '',
    ticksPerBeat: 480,
    tempoMap: [{ tick: 0, usPerBeat: 500000 }],
    events,
    channelsUsed: [],
    target: 'gm',
  })
  const on = (tick: number, ch: number, key: number): MidiEvent => ({
    tick,
    ch,
    type: 'noteOn',
    key,
    vel: 100,
  })
  const run = (p: ReturnType<typeof createMidiPlayer>, frames: number): void => {
    p.render(new Float32Array(frames), new Float32Array(frames), frames)
  }

  it('envelope stages change at their configured frames', () => {
    const e = createEnv()
    startEnv(
      e,
      { delayS: 0.01, attackS: 0.02, holdS: 0.01, decayS: 0.5, sustainDb: 20, releaseS: 0.1 },
      SR,
    )
    for (let i = 0; i < 10; i++) stepEnv(e)
    // the stage flips on the step after its last frame, so delay (10 frames) shows Attack at step 11
    expect(e.stage).toBe(Stage.Delay)
    stepEnv(e)
    expect(e.stage).toBe(Stage.Attack)
    for (let i = 0; i < 20; i++) stepEnv(e)
    expect(e.stage).toBe(Stage.Hold)
    for (let i = 0; i < 10; i++) stepEnv(e)
    expect(e.stage).toBe(Stage.Decay)
    for (let i = 0; i < 150; i++) stepEnv(e)
    expect(e.stage).toBe(Stage.Sustain)
    expect(stepEnv(e)).toBeCloseTo(0.1, 5)
    releaseEnv(e)
    for (let i = 0; i < 200; i++) stepEnv(e)
    expect(e.stage).toBe(Stage.Done)
  })

  it('the 65th note steals the oldest voice', () => {
    const events = [on(0, 0, 60), ...Array.from({ length: 64 }, (_, k) => on(0, 1, 30 + k))]
    const p = createMidiPlayer(midiOf(events), bankOf(zoneOf()), SR)
    run(p, 10)
    expect(p.stats.voices).toBe(64)
    const snap = p.snapshot()
    expect(snap.ch[0]?.active).toBe(false)
    expect(snap.ch[1]?.active).toBe(true)
  })

  it('an exclusive class releases the earlier note on the same channel', () => {
    const play = (exclusiveClass: number): number => {
      const p = createMidiPlayer(
        midiOf([on(0, 0, 60), on(480, 0, 62)]),
        bankOf(zoneOf({ exclusiveClass })),
        SR,
      )
      run(p, 700)
      return p.stats.voices
    }
    expect(play(0)).toBe(2)
    expect(play(1)).toBe(1)
  })
})

describe('createBeatDetector', () => {
  const DT = 1 / 60
  const run = (energyAt: (sec: number) => number, sec: number): number => {
    const beat = createBeatDetector()
    let beats = 0
    for (let i = 0; i < sec / DT; i++) if (beat(energyAt(i * DT), DT)) beats++
    return beats
  }
  it('fires once per kick (energy steps every 0.5 s)', () => {
    const kicks = run((t) => (t % 0.5 < 0.05 ? 0.1 : 0.01), 5)
    expect(kicks).toBeGreaterThanOrEqual(9)
    expect(kicks).toBeLessThanOrEqual(10)
  })
  it('never fires on constant energy or silence', () => {
    expect(run(() => 0.05, 5)).toBe(0)
    expect(run(() => 0, 5)).toBe(0)
  })
})
