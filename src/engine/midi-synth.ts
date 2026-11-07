// MIDI tick → seconds (P23) and the SF2 voice synth implementing Player (decision 46).
// Module-private to src/engine; the synth lands in P25.
import type { MidiSong } from '../formats'

/** Seconds at `tick`, walking the tempo map. */
export function ticksToSeconds(song: MidiSong, tick: number): number {
  let sec = 0
  let prevTick = 0
  let usPerBeat = 500000
  for (const t of song.tempoMap) {
    if (t.tick >= tick) break
    sec += ((t.tick - prevTick) * usPerBeat) / song.ticksPerBeat / 1e6
    prevTick = t.tick
    usPerBeat = t.usPerBeat
  }
  return sec + ((tick - prevTick) * usPerBeat) / song.ticksPerBeat / 1e6
}
