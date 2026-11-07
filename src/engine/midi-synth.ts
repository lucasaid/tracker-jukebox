// MIDI tick → seconds (P23) and the SF2 voice synth (decision 46, P25).
// Module-private to src/engine; engine/index.ts wraps it as createMidiPlayer.
import { MT32_TO_GM, NOTE_NONE } from '../formats'
import type { MidiSong, SoundBank, Zone } from '../formats'
import type { Player, PlayerOptions, PlayerStats, Snapshot } from './index'

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

// ---- Volume envelope: delay → attack (linear) → hold → decay (exponential) → sustain → release ----

export const Stage = {
  Delay: 0,
  Attack: 1,
  Hold: 2,
  Decay: 3,
  Sustain: 4,
  Release: 5,
  Done: 6,
} as const

export interface EnvState {
  stage: number
  /** frames spent in the current stage (delay, attack, hold) */
  t: number
  amp: number
  delayN: number
  attackN: number
  holdN: number
  decayMul: number
  sustainAmp: number
  releaseMul: number
}

const SILENT_AMP = 1e-5 // −100 dB

export const createEnv = (): EnvState => ({
  stage: Stage.Done,
  t: 0,
  amp: 0,
  delayN: 0,
  attackN: 0,
  holdN: 0,
  decayMul: 1,
  sustainAmp: 1,
  releaseMul: 1,
})

/** SF2 times are for a 100 dB fall, so a per-frame multiplier gives the same slope at any level. */
const mulPerFrame = (seconds: number, sampleRate: number): number =>
  10 ** (-100 / Math.max(1, seconds * sampleRate) / 20)

export function startEnv(e: EnvState, env: Zone['env'], sampleRate: number): void {
  e.stage = Stage.Delay
  e.t = 0
  e.amp = 0
  e.delayN = env.delayS * sampleRate
  e.attackN = env.attackS * sampleRate
  e.holdN = env.holdS * sampleRate
  e.decayMul = mulPerFrame(env.decayS, sampleRate)
  e.sustainAmp = 10 ** (-env.sustainDb / 20)
  e.releaseMul = mulPerFrame(env.releaseS, sampleRate)
}

export function releaseEnv(e: EnvState): void {
  if (e.stage < Stage.Release) e.stage = Stage.Release
}

/** Returns the amplitude of this frame, then advances one frame. */
export function stepEnv(e: EnvState): number {
  // Chained ifs let zero-length stages pass in a single step.
  if (e.stage === Stage.Delay && e.t >= e.delayN) {
    e.stage = Stage.Attack
    e.t = 0
  }
  if (e.stage === Stage.Attack && e.t >= e.attackN) {
    e.stage = Stage.Hold
    e.t = 0
    e.amp = 1
  }
  if (e.stage === Stage.Hold && e.t >= e.holdN) {
    e.stage = Stage.Decay
    e.t = 0
    e.amp = 1
  }
  if (e.stage === Stage.Decay && e.amp <= e.sustainAmp) {
    e.stage = Stage.Sustain
    e.amp = e.sustainAmp
  }
  if (e.stage === Stage.Release && e.amp < SILENT_AMP) e.stage = Stage.Done
  const out = e.amp
  switch (e.stage) {
    case Stage.Delay:
      e.t++
      break
    case Stage.Attack:
      e.amp = e.t / e.attackN
      e.t++
      break
    case Stage.Hold:
      e.t++
      break
    case Stage.Decay:
      e.amp *= e.decayMul
      break
    case Stage.Release:
      e.amp *= e.releaseMul
      break
  }
  return out
}

// ---- Synth ----

const VOICES = 64
const CHANNELS = 16
const DRUMS_BANK = 128
/** Set from loudness measurements against the trackers (see docs/PLAN.md decision 46); the
 *  limiter below keeps the loudest files from clipping. */
const MIX_GAIN = 2
/** Output peak the limiter holds, and how fast its gain recovers (per second, multiplicative). */
const LIMIT = 0.89 // −1 dBFS
const LIMIT_RELEASE_SEC = 0.3
const TAIL_SEC = 1 // matches computeLength: last event + 1 s

interface Voice {
  active: boolean
  ch: number
  key: number
  /** note-on order; the smallest is stolen first */
  age: number
  /** note-off arrived while the sustain pedal was down */
  held: boolean
  zone: Zone | null
  pos: number
  rate: number
  /** (vel/127)² · attenuation */
  baseGain: number
  env: EnvState
}

interface Channel {
  program: number
  gmProgram: number
  bank: number
  cc7: number
  cc10: number
  cc11: number
  sustain: boolean
  bend: number
  bendRange: number
  rpnMsb: number
  rpnLsb: number
  lastKey: number
  triggered: boolean
}

const newChannel = (): Channel => ({
  program: 0,
  gmProgram: 0,
  bank: 0,
  cc7: 100,
  cc10: 64,
  cc11: 127,
  sustain: false,
  bend: 0,
  bendRange: 2,
  rpnMsb: 127,
  rpnLsb: 127,
  lastKey: NOTE_NONE,
  triggered: false,
})

/** Frame at which each event fires (event order, ticks walked through the tempo map once). */
function eventFrames(song: MidiSong, sampleRate: number): Float64Array {
  const out = new Float64Array(song.events.length)
  const tm = song.tempoMap
  let next = 0
  let segTick = 0
  let segSec = 0
  let us = 500000
  for (let i = 0; i < out.length; i++) {
    const tick = (song.events[i] as { tick: number }).tick
    for (let t = tm[next]; t !== undefined && t.tick <= tick; t = tm[++next]) {
      segSec += ((t.tick - segTick) * us) / song.ticksPerBeat / 1e6
      segTick = t.tick
      us = t.usPerBeat
    }
    out[i] = Math.round((segSec + ((tick - segTick) * us) / song.ticksPerBeat / 1e6) * sampleRate)
  }
  return out
}

export function createMidiSynth(
  song: MidiSong,
  bank: SoundBank,
  sampleRate: number,
  initial: PlayerOptions,
  scopeLen: number,
): Player {
  let options = initial
  const events = song.events
  const evFrame = eventFrames(song, sampleRate)
  const lastEvFrame = evFrame.length > 0 ? (evFrame[evFrame.length - 1] as number) : 0
  const endFrame = lastEvFrame + TAIL_SEC * sampleRate

  const chans: Channel[] = Array.from({ length: CHANNELS }, newChannel)
  const voices: Voice[] = Array.from({ length: VOICES }, () => ({
    active: false,
    ch: 0,
    key: 0,
    age: 0,
    held: false,
    zone: null,
    pos: 0,
    rate: 0,
    baseGain: 0,
    env: createEnv(),
  }))
  const chGain = new Float64Array(CHANNELS)
  const scopeRing = chans.map(() => new Float32Array(scopeLen))
  const scopeMask = scopeLen - 1 // scopeLen is a power of two (SCOPE_LEN)
  let scopeAt = 0
  let ageCounter = 0
  let evIdx = 0
  /** limiter gain, 0..1 */
  let lim = 1
  const limRelease = Math.pow(1 / LIMIT, 1 / (LIMIT_RELEASE_SEC * sampleRate))
  let frame = 0
  let ended = false
  const stats: PlayerStats = { unknownFx: 0, voices: 0 }

  const releaseVoice = (v: Voice): void => {
    v.held = false
    releaseEnv(v.env)
  }

  const presetFor = (c: Channel, ch: number) => {
    if (ch === 9)
      return bank.presets.get(DRUMS_BANK * 128 + c.gmProgram) ?? bank.presets.get(DRUMS_BANK * 128)
    return bank.presets.get(c.bank * 128 + c.gmProgram) ?? bank.presets.get(c.gmProgram)
  }

  const noteOn = (ch: number, c: Channel, key: number, vel: number): void => {
    c.lastKey = key
    c.triggered = true
    const preset = presetFor(c, ch)
    if (!preset) return
    for (let z = 0; z < preset.zones.length; z++) {
      const zone = preset.zones[z] as Zone
      if (key < zone.keyLo || key > zone.keyHi || vel < zone.velLo || vel > zone.velHi) continue
      if (zone.exclusiveClass !== 0)
        for (let q = 0; q < VOICES; q++) {
          const o = voices[q] as Voice
          if (o.active && o.ch === ch && o.zone?.exclusiveClass === zone.exclusiveClass)
            releaseVoice(o)
        }
      let slot = voices[0] as Voice
      for (let q = 0; q < VOICES; q++) {
        const o = voices[q] as Voice
        if (!o.active) {
          slot = o
          break
        }
        if (o.age < slot.age) slot = o
      }
      slot.active = true
      slot.ch = ch
      slot.key = key
      slot.age = ++ageCounter
      slot.held = false
      slot.zone = zone
      slot.pos = 0
      slot.baseGain = (vel / 127) ** 2 * 10 ** (-zone.attenuationDb / 20)
      startEnv(slot.env, zone.env, sampleRate)
    }
  }

  const noteOff = (ch: number, c: Channel, key: number): void => {
    for (let q = 0; q < VOICES; q++) {
      const v = voices[q] as Voice
      if (!v.active || v.ch !== ch || v.key !== key || v.env.stage >= Stage.Release) continue
      if (c.sustain) v.held = true
      else releaseVoice(v)
    }
  }

  const releaseWhere = (ch: number, heldOnly: boolean): void => {
    for (let q = 0; q < VOICES; q++) {
      const v = voices[q] as Voice
      if (v.active && v.ch === ch && (!heldOnly || v.held)) releaseVoice(v)
    }
  }

  const controller = (ch: number, c: Channel, cc: number, value: number): void => {
    if (cc === 0) c.bank = value
    else if (cc === 6) {
      if (c.rpnMsb === 0 && c.rpnLsb === 0) c.bendRange = value
    } else if (cc === 7) c.cc7 = value
    else if (cc === 10) c.cc10 = value
    else if (cc === 11) c.cc11 = value
    else if (cc === 64) {
      c.sustain = value >= 64
      if (!c.sustain) releaseWhere(ch, true)
    } else if (cc === 100) c.rpnLsb = value
    else if (cc === 101) c.rpnMsb = value
    else if (cc === 121) {
      c.cc7 = 100
      c.cc11 = 127
      c.sustain = false
      releaseWhere(ch, true)
      c.bend = 0
      c.rpnMsb = 127
      c.rpnLsb = 127
    } else if (cc === 123) releaseWhere(ch, false)
  }

  /** `silent` (used by seek) applies state changes but starts no notes. */
  const apply = (i: number, silent: boolean): void => {
    const e = events[i]
    if (!e) return
    const c = chans[e.ch] as Channel
    switch (e.type) {
      case 'noteOn':
        if (!silent) noteOn(e.ch, c, e.key, e.vel)
        break
      case 'noteOff':
        if (!silent) noteOff(e.ch, c, e.key)
        break
      case 'program':
        c.program = e.program
        c.gmProgram =
          song.target === 'mt32' && e.ch !== 9 ? (MT32_TO_GM[e.program] ?? e.program) : e.program
        break
      case 'cc':
        controller(e.ch, c, e.cc, e.value)
        break
      case 'pitchBend':
        c.bend = e.value
        break
    }
  }

  /** Mixes `n` frames of every voice into left/right[start..), then applies the output gain. */
  const mix = (left: Float32Array, right: Float32Array, start: number, n: number): void => {
    const ring = scopeAt
    for (let ch = 0; ch < CHANNELS; ch++) {
      const c = chans[ch] as Channel
      chGain[ch] = options.muteMask & (1 << ch) ? 0 : (c.cc7 / 127) ** 2 * (c.cc11 / 127) ** 2
      const sc = scopeRing[ch] as Float32Array
      for (let i = 0; i < n; i++) sc[(ring + i) & scopeMask] = 0
    }
    for (let vi = 0; vi < VOICES; vi++) {
      const v = voices[vi] as Voice
      const zone = v.zone
      if (!v.active || !zone) continue
      const c = chans[v.ch] as Channel
      const data = zone.data
      const len = data.length
      const bendCents = (c.bend / 8192) * c.bendRange * 100
      const rate =
        2 ** (((v.key - zone.rootKey) * 100 + zone.tuneCents + bendCents) / 1200) *
        (zone.sampleRate / sampleRate)
      const pan =
        Math.max(-1, Math.min(1, zone.pan + (c.cc10 - 64) / 64)) * options.stereoSeparation
      const gain = v.baseGain * (chGain[v.ch] as number) * MIX_GAIN
      const gl = ((1 - pan) / 2) * gain
      const gr = ((1 + pan) / 2) * gain
      const sc = scopeRing[v.ch] as Float32Array
      const loopLen = Math.min(zone.loopEnd, len) - zone.loopStart
      const loops = (zone.loopMode === 1 || zone.loopMode === 3) && loopLen > 1
      let pos = v.pos
      for (let i = 0; i < n; i++) {
        const amp = stepEnv(v.env)
        if (v.env.stage === Stage.Done) {
          v.active = false
          break
        }
        if (
          loops &&
          pos >= zone.loopStart + loopLen &&
          (zone.loopMode === 1 || v.env.stage < Stage.Release)
        )
          pos = zone.loopStart + ((pos - zone.loopStart) % loopLen)
        const i0 = pos | 0
        if (i0 >= len) {
          v.active = false
          break
        }
        const f = pos - i0
        const s0 = data[i0] as number
        const out = (s0 + ((i0 + 1 < len ? (data[i0 + 1] as number) : s0) - s0) * f) * amp
        left[start + i] = (left[start + i] as number) + out * gl
        right[start + i] = (right[start + i] as number) + out * gr
        const k = (ring + i) & scopeMask
        sc[k] = (sc[k] as number) + out * gain
        pos += rate
      }
      v.pos = pos
    }
    // Peak limiter: instant attack, exponential release. MIDI files differ by ~20 dB in level, so
    // a fixed gain loud enough for the quiet ones would clip the loud ones.
    // ponytail: no look-ahead, so attacks are slightly squared off; add a short delay line if audible
    for (let i = start; i < start + n; i++) {
      const l = left[i] as number
      const r = right[i] as number
      const peak = Math.max(Math.abs(l), Math.abs(r)) * lim
      lim = peak > LIMIT ? (lim * LIMIT) / peak : Math.min(1, lim * limRelease)
      left[i] = Math.max(-1, Math.min(1, l * lim))
      right[i] = Math.max(-1, Math.min(1, r * lim))
    }
    scopeAt = (ring + n) & scopeMask
  }

  const reset = (): void => {
    for (let i = 0; i < CHANNELS; i++) chans[i] = newChannel()
    for (const v of voices) {
      v.active = false
      v.zone = null
    }
    for (const s of scopeRing) s.fill(0)
    evIdx = 0
    lim = 1
    ended = false
  }

  const snap: Snapshot = {
    frame: 0,
    seconds: 0,
    pos: { kind: 'midi', tick: 0, tempo: 120 },
    ch: chans.map(() => ({
      active: false,
      note: NOTE_NONE,
      ins: 0,
      volume: 0,
      pan: 0,
      triggered: false,
    })),
    scopes: chans.map(() => new Float32Array(scopeLen)),
  }
  const midiPos = snap.pos as { kind: 'midi'; tick: number; tempo: number }

  return {
    sampleRate,
    get ended() {
      return ended
    },
    stats,
    render(left, right, frames) {
      left.fill(0, 0, frames)
      right.fill(0, 0, frames)
      let done = 0
      while (done < frames) {
        if (frame >= endFrame) {
          ended = true
          for (let q = 0; q < VOICES; q++) (voices[q] as Voice).active = false
          break
        }
        while (evIdx < events.length && (evFrame[evIdx] as number) <= frame) apply(evIdx++, false)
        const nextEv = evIdx < events.length ? (evFrame[evIdx] as number) : endFrame
        const n = Math.min(frames - done, nextEv - frame, scopeLen, endFrame - frame)
        mix(left, right, done, n)
        done += n
        frame += n
      }
      stats.voices = 0
      for (let q = 0; q < VOICES; q++) if ((voices[q] as Voice).active) stats.voices++
      return done
    },
    seek(to) {
      const sec = 'seconds' in to ? to.seconds : 0
      reset()
      // ponytail: notes sounding at the seek point are not restarted, start a voice replay if it is audible
      frame = Math.max(0, Math.min(Math.round(sec * sampleRate), endFrame))
      while (evIdx < events.length && (evFrame[evIdx] as number) < frame) apply(evIdx++, true)
    },
    setOptions(o) {
      options = { ...options, ...o }
    },
    snapshot() {
      const sec = frame / sampleRate
      snap.frame = frame
      snap.seconds = sec
      // tick and tempo at `sec`, walking the tempo map
      let sec0 = 0
      let tick0 = 0
      let us = 500000
      for (let i = 0; i < song.tempoMap.length; i++) {
        const t = song.tempoMap[i] as { tick: number; usPerBeat: number }
        const s = sec0 + ((t.tick - tick0) * us) / song.ticksPerBeat / 1e6
        if (s > sec) break
        sec0 = s
        tick0 = t.tick
        us = t.usPerBeat
      }
      midiPos.tick = tick0 + ((sec - sec0) * 1e6 * song.ticksPerBeat) / us
      midiPos.tempo = 6e7 / us
      for (let ch = 0; ch < CHANNELS; ch++) {
        const c = chans[ch] as Channel
        const out = snap.ch[ch]
        const scope = snap.scopes[ch]
        const ring = scopeRing[ch]
        if (!out || !scope || !ring) continue
        out.active = false
        for (const v of voices) if (v.active && v.ch === ch) out.active = true
        out.note = c.lastKey
        out.ins = c.program
        out.volume = (c.cc7 / 127) * (c.cc11 / 127)
        out.pan = Math.max(-1, Math.min(1, (c.cc10 - 64) / 64))
        out.triggered = c.triggered
        c.triggered = false
        for (let k = 0; k < scopeLen; k++) scope[k] = ring[(scopeAt + k) & scopeMask] as number
      }
      return snap
    },
  }
}
