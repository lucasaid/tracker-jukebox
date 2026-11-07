import { describe, expect, it } from 'vitest'
import { Fx, NOTE_NONE } from '../formats'
import type { Cell, Pattern, Song } from '../formats'
import { computeLength } from './index'
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
