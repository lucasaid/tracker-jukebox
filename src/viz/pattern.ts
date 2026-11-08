// Tracker pattern view (decision 27) and the MIDI piano roll (decision 28).
import { ticksToSeconds } from '../engine'
import type { Cell, MidiSong, Song } from '../formats'
import type { Frame, VisualizerDef } from './types'

const NOTES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-']
const MAX_GLYPH_PX = 8
const MIN_GLYPH_PX = 6
const LIT_SEC = 0.25
/** Characters per cell: full `C-4 01 40 A0F`, note + instrument, note only. */
const MODES = [13, 6, 3] as const

const pad2 = (n: number): string => String(n).padStart(2, '0')
const hex2 = (n: number): string => n.toString(16).toUpperCase().padStart(2, '0')

function noteText(note: number): string {
  if (note === -2) return '^^^'
  if (note < 0) return '---'
  return `${NOTES[note % 12] ?? '??'}${Math.floor(note / 12)}`
}

function effectText(cell: Cell, song: Song): string {
  if (cell.fxRaw < 0 || (cell.fxRaw === 0 && cell.paramRaw === 0 && song.format !== 's3m'))
    return '...'
  const letter =
    song.format === 's3m' || song.format === 'stm'
      ? String.fromCharCode(64 + cell.fxRaw)
      : cell.fxRaw.toString(16).toUpperCase()
  return `${letter}${hex2(cell.paramRaw)}`
}

const ROLL_BEFORE_SEC = 2
const ROLL_SPAN_SEC = 8
const KEY_LO = 24
const KEY_HI = 96

interface RollNote {
  ch: number
  key: number
  startSec: number
  endSec: number
}

/** Pairs each noteOn with the next noteOff of the same channel and key (open notes end with the song). */
function rollNotes(song: MidiSong): RollNote[] {
  const open = new Map<number, number>()
  const notes: RollNote[] = []
  const close = (id: number, tick: number): void => {
    const start = open.get(id)
    if (start === undefined) return
    open.delete(id)
    notes.push({
      ch: id >> 7,
      key: id & 127,
      startSec: ticksToSeconds(song, start),
      endSec: ticksToSeconds(song, tick),
    })
  }
  let lastTick = 0
  for (const e of song.events) {
    lastTick = e.tick
    if (e.type === 'noteOn') {
      close((e.ch << 7) | e.key, e.tick)
      open.set((e.ch << 7) | e.key, e.tick)
    } else if (e.type === 'noteOff') close((e.ch << 7) | e.key, e.tick)
  }
  for (const id of [...open.keys()]) close(id, lastTick)
  return notes.sort((a, b) => a.startSec - b.startSec)
}

function drawRoll(
  ctx: CanvasRenderingContext2D,
  f: Frame,
  song: MidiSong,
  notes: RollNote[],
): void {
  const { width: w, height: h, palette: p, snap } = f
  const lanes = song.channelsUsed
  if (lanes.length === 0) return
  const laneH = h / lanes.length
  const now = snap.seconds
  const from = now - ROLL_BEFORE_SEC
  const xOf = (sec: number): number => ((sec - from) / ROLL_SPAN_SEC) * w
  ctx.font = '10px monospace'
  ctx.textBaseline = 'top'
  lanes.forEach((ch, i) => {
    const top = i * laneH
    ctx.fillStyle = p.sep
    ctx.fillRect(0, top, w, 1)
    ctx.fillStyle = snap.ch[ch]?.active ? p.fg : p.dim
    ctx.fillText(`CH${ch + 1}`, 2, top + 2)
  })
  for (const n of notes) {
    if (n.startSec > from + ROLL_SPAN_SEC) break // sorted by start
    if (n.endSec < from) continue
    const lane = lanes.indexOf(n.ch)
    if (lane < 0) continue
    const key = Math.max(KEY_LO, Math.min(KEY_HI, n.key))
    const y = lane * laneH + laneH * (1 - (key - KEY_LO) / (KEY_HI - KEY_LO + 1)) - 1
    const x = xOf(n.startSec)
    ctx.fillStyle = n.startSec <= now && n.endSec >= now ? p.accent : p.note
    ctx.fillRect(x, y, Math.max(1, xOf(n.endSec) - x), Math.max(2, laneH / (KEY_HI - KEY_LO)))
  }
  ctx.fillStyle = p.accent
  ctx.fillRect(xOf(now), 0, 1, h)
}

export const pattern: VisualizerDef = {
  id: 'pattern',
  name: 'Pattern',
  streams: false,
  create: () => {
    let page = 0
    let pages = 1
    let lit: number[] = []
    let rollSong: MidiSong | null = null
    let roll: RollNote[] = []

    const draw = (ctx: CanvasRenderingContext2D, f: Frame | null, dt: number): void => {
      const w = f?.width ?? ctx.canvas.clientWidth
      const h = f?.height ?? ctx.canvas.clientHeight
      const p = f?.palette
      ctx.fillStyle = p?.bg ?? '#000'
      ctx.fillRect(0, 0, w, h)
      if (f && p && f.song.kind === 'midi') {
        if (rollSong !== f.song) {
          rollSong = f.song
          roll = rollNotes(f.song)
        }
        drawRoll(ctx, f, f.song, roll)
        return
      }
      if (!f || !p || f.song.kind !== 'tracker' || f.snap.pos.kind !== 'tracker') return
      const { song, snap } = f
      const pos = f.snap.pos
      const n = song.channels

      // Glyph metrics: monospace advance is a fixed fraction of the font size.
      ctx.font = '100px monospace'
      const advance = ctx.measureText('M').width / 100
      const rowNumChars = 3
      let mode: number = MODES[2]
      let glyph = MIN_GLYPH_PX
      let visible = 0
      for (const chars of MODES) {
        const fit = Math.floor((w - rowNumChars * MAX_GLYPH_PX) / (n * (chars + 1)))
        if (fit >= MIN_GLYPH_PX) {
          mode = chars
          glyph = Math.min(MAX_GLYPH_PX, fit)
          visible = n
          break
        }
      }
      if (visible === 0) visible = Math.max(1, Math.floor((w - rowNumChars * glyph) / (4 * glyph)))
      visible = Math.min(visible, n)
      pages = Math.ceil(n / visible)
      page = Math.min(page, pages - 1)
      const first = page * visible
      const last = Math.min(n, first + visible)

      const fontPx = glyph / advance
      ctx.font = `${fontPx}px monospace`
      ctx.textBaseline = 'middle'
      const rowH = Math.round(fontPx * 1.3)
      const cellW = (mode + 1) * glyph
      const x0 = rowNumChars * glyph

      if (lit.length !== n) lit = new Array<number>(n).fill(0)

      // Headers
      for (let c = first; c < last; c++) {
        const state = snap.ch[c]
        if (state?.triggered) lit[c] = LIT_SEC
        else lit[c] = Math.max(0, (lit[c] ?? 0) - dt)
        ctx.fillStyle = (lit[c] ?? 0) > 0 ? p.accent : state?.active ? p.fg : p.dim
        ctx.fillText(pad2(c + 1), x0 + (c - first) * cellW, rowH / 2)
      }

      const body = h - rowH
      const curY = rowH + body * 0.4
      const pat = song.patterns[pos.pattern]
      if (!pat) return
      ctx.fillStyle = p.cur
      ctx.fillRect(0, curY - rowH / 2, w, rowH)
      const above = Math.ceil((curY - rowH) / rowH)
      const below = Math.ceil((h - curY) / rowH)
      for (let i = -above; i <= below; i++) {
        const r = pos.row + i
        if (r < 0 || r >= pat.rows) continue
        const y = curY + i * rowH
        if (y - rowH / 2 < rowH) continue // under the header
        if (i !== 0 && r % 4 === 0) {
          ctx.fillStyle = p.beat
          ctx.fillRect(0, y - rowH / 2, w, rowH)
        }
        ctx.fillStyle = p.rownum
        ctx.fillText(hex2(r), 0, y)
        for (let c = first; c < last; c++) {
          const cell = pat.cells[r * n + c]
          if (!cell) continue
          const x = x0 + (c - first) * cellW
          const text = (s: string, color: string, col: number, empty: boolean): void => {
            ctx.fillStyle = empty ? p.empty : color
            ctx.fillText(s, x + col * glyph, y)
          }
          text(noteText(cell.note), p.note, 0, cell.note === -1)
          if (mode >= 6) text(cell.ins > 0 ? pad2(cell.ins) : '..', p.inst, 4, cell.ins === 0)
          if (mode >= 13) {
            text(cell.vol >= 0 ? pad2(cell.vol) : '..', p.vol, 7, cell.vol < 0)
            const fx = effectText(cell, song)
            text(fx, p.fx, 10, fx === '...')
          }
        }
      }
      // Channel separators
      ctx.fillStyle = p.sep
      for (let c = first + 1; c < last; c++)
        ctx.fillRect(x0 + (c - first) * cellW - glyph / 2, rowH, 1, body)
      if (pages > 1) {
        ctx.fillStyle = p.accent
        ctx.textAlign = 'right'
        ctx.fillText(`CH ${first + 1}–${last}/${n}`, w - 2, h - rowH / 2)
        ctx.textAlign = 'left'
      }
    }

    return {
      draw,
      click() {
        page = (page + 1) % pages
      },
    }
  },
}
