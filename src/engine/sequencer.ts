// Orders/rows/ticks, flow effects, loop detection. Allocation-free after creation, so the
// realtime player can drive it from process().
import { Fx } from '../formats'
import type { Song } from '../formats'

export interface SeqState {
  order: number
  pattern: number
  row: number
  /** 0..speed-1 within the current repeat of the row */
  tick: number
  /** extra repeats done so far for a pattern delay */
  repeat: number
  speed: number
  tempo: number
  /** 0..64, S3M Vxx changes it */
  globalVolume: number
  ended: boolean
  /** ended because a jump/break reached a row already played in this run (decision 18) */
  loops: boolean
}

export interface Sequencer {
  readonly state: SeqState
  /** Moves to the next tick. Returns false once the song has ended. Row effects (speed, tempo,
   *  jump, break, loop, delay) are applied when a row starts, before its first tick is returned. */
  advance(): boolean
}

const MAX_ROWS = 64

export function createSequencer(song: Song): Sequencer {
  const { orders, patterns, channels } = song
  const state: SeqState = {
    order: 0,
    pattern: 0,
    row: 0,
    tick: 0,
    repeat: 0,
    speed: song.initialSpeed,
    tempo: song.initialTempo,
    globalVolume: song.globalVolume,
    ended: false,
    loops: false,
  }
  const visited = new Uint8Array(orders.length * MAX_ROWS)
  const loopRow = new Int32Array(channels)
  const loopCount = new Int32Array(channels)
  let started = false
  let delay = 0
  let jumpOrder = -1
  let breakRow = -1
  let loopTo = -1

  const end = (): false => {
    state.ended = true
    return false
  }

  const processRow = (): void => {
    const cells = patterns[state.pattern]?.cells
    if (cells === undefined) return
    delay = 0
    jumpOrder = -1
    breakRow = -1
    loopTo = -1
    for (let ch = 0; ch < channels; ch++) {
      const cell = cells[state.row * channels + ch]
      if (cell === undefined) continue
      const p = cell.param
      switch (cell.fx) {
        case Fx.SetSpeed:
          if (p > 0) state.speed = p
          break
        // ponytail: S3M T0x/T1x tempo slides are not sequenced, add if a file needs them
        case Fx.SetTempo:
          if (p >= 32) state.tempo = p
          break
        case Fx.GlobalVolume:
          state.globalVolume = Math.min(p, 64)
          break
        case Fx.PosJump:
          jumpOrder = p
          break
        case Fx.PatBreak:
          breakRow = p
          break
        case Fx.PatDelay:
          delay = Math.max(delay, p)
          break
        case Fx.PatLoop:
          if (p === 0) loopRow[ch] = state.row
          else if (loopCount[ch] === 0) {
            loopCount[ch] = p
            loopTo = loopRow[ch] ?? 0
          } else if ((loopCount[ch] = (loopCount[ch] ?? 0) - 1) > 0) loopTo = loopRow[ch] ?? 0
          break
        default:
          break
      }
    }
  }

  /** Starts a row. False (and ended) if the order list has run out. */
  const enter = (order: number, row: number): boolean => {
    const pattern = orders[order]
    const pat = pattern === undefined ? undefined : patterns[pattern]
    if (pattern === undefined || pat === undefined) return end()
    if (order !== state.order || !started) {
      loopRow.fill(0)
      loopCount.fill(0)
    }
    started = true
    state.order = order
    state.pattern = pattern
    state.row = row
    state.tick = 0
    state.repeat = 0
    // 669 sets the speed per pattern, at row 0
    if (row === 0 && pat.speed !== null && pat.speed > 0) state.speed = pat.speed
    visited[order * MAX_ROWS + row] = 1
    processRow()
    return true
  }

  const nextRow = (): boolean => {
    if (loopTo >= 0) return enter(state.order, loopTo) // pattern-loop repeats are not song loops
    let order = state.order
    let row = state.row + 1
    let jumped = false
    if (jumpOrder >= 0 || breakRow >= 0) {
      jumped = true
      order = jumpOrder >= 0 ? jumpOrder : order + 1
      row = Math.max(breakRow, 0)
    } else if (row >= (patterns[state.pattern]?.rows ?? 0)) {
      order++
      row = 0
    }
    const rows = patterns[orders[order] ?? -1]?.rows ?? 0
    if (row >= rows) row = 0
    // ponytail: only jumps/breaks are checked against played rows, so a song that re-enters
    // played rows without one is only stopped by computeLength's maxSeconds
    if (jumped && order < orders.length && visited[order * MAX_ROWS + row] === 1) {
      state.loops = true
      return end()
    }
    return enter(order, row)
  }

  return {
    state,
    advance(): boolean {
      if (state.ended) return false
      if (!started) return enter(0, 0)
      if (++state.tick < state.speed) return true
      if (state.repeat < delay) {
        state.repeat++
        state.tick = 0
        return true
      }
      return nextRow()
    },
  }
}
