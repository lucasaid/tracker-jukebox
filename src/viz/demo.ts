// Plasma, starfield, copper (decision 31). These keep their own colours, not the theme palette,
// except the starfield's click-on colour mode.
import { themeColours } from './colours'
import type { Frame, VisualizerDef, VisualizerInstance } from './types'

const PULSE_SEC = 0.25
const TAU = Math.PI * 2

interface Drive {
  intensity: number
  pulse: number
}

/** Shared audio drive: intensity from the mix RMS, a pulse that decays after any channel trigger. */
export function createDrive(): (f: Frame, dt: number) => Drive {
  const d: Drive = { intensity: 0, pulse: 0 }
  return (f, dt) => {
    let sum = 0
    for (let i = 0; i < f.time.length; i++) sum += (f.time[i] ?? 0) ** 2
    d.intensity = Math.min(1, Math.sqrt(sum / f.time.length) * 4)
    if (f.snap.ch.some((c) => c.triggered)) d.pulse = 1
    else d.pulse = Math.max(0, d.pulse - dt / PULSE_SEC)
    return d
  }
}

/** With reducedMotion a visualizer draws once per canvas size and then stops. */
export function createStill(): (f: Frame) => boolean {
  let key = ''
  return (f) => {
    if (!f.reducedMotion) return false
    const k = `${f.width}x${f.height}`
    if (k === key) return true
    key = k
    return false
  }
}

/** The mode name a click shows in the top-left corner for a moment, like superscope's. */
export function createModeLabel(): {
  show(text: string): void
  draw(ctx: CanvasRenderingContext2D, dt: number): void
} {
  let text = ''
  let sec = 0
  return {
    show(t) {
      text = t
      sec = 1.5
    },
    draw(ctx, dt) {
      if (sec <= 0) return
      sec -= dt
      ctx.fillStyle = '#c0c0c0'
      ctx.font = '12px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(text, 6, 16)
    },
  }
}

export const idle = (ctx: CanvasRenderingContext2D, f: Frame | null): void => {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, f?.width ?? ctx.canvas.clientWidth, f?.height ?? ctx.canvas.clientHeight)
}

/** The plasma palette is split into this many colour bands; band b follows channels b, b + 8, … */
const PLASMA_BANDS = 8
const MAX_CHANNELS = 64
/** Plasma modes, in click order. */
const SWELL = 0 // blobs puff out and their hot cores flash on any beat
const CHANNELS = 1 // each colour band lights up on its own channel's hits
const RIPPLES = 2 // each note drops a ripple at its channel's spot that bends the pattern
const SPECTRUM = 3 // bass / mids / treble drive the plasma's waves
const WOBBLE = 4 // the audio waveform pushes each row sideways
const KICK = 5 // the palette cycles with the tempo and jumps ahead on beats
const PLASMA_NAMES = ['swell', 'channels', 'ripples', 'spectrum', 'wobble', 'kick'] as const
const PLASMA_MODES = PLASMA_NAMES.length
const MAX_RIPPLES = 24
const RIPPLE_LIFE_SEC = 1.6
/** ring speed in plasma cells per second */
const RIPPLE_SPEED = 40
/** palette steps per second at the default 125 BPM / speed 6 */
const KICK_CYCLE = 20

/** Mean of freq[lo..hi) scaled to 0..1. */
const level = (freq: Uint8Array, lo: number, hi: number): number => {
  let sum = 0
  for (let i = lo; i < hi; i++) sum += freq[i] ?? 0
  return sum / ((hi - lo) * 255)
}
/** Fast attack, slower release, so bands punch in and settle back. */
const follow = (cur: number, target: number, dt: number): number =>
  cur + (target - cur) * Math.min(1, dt * (target > cur ? 20 : 5))

function plasmaInstance(start = 0): VisualizerInstance {
  const drive = createDrive()
  const skip = createStill()
  const small = document.createElement('canvas')
  const sctx = small.getContext('2d')
  const lut = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i++) {
    lut[i * 3] = 128 + 127 * Math.sin((i / 256) * TAU)
    lut[i * 3 + 1] = 128 + 127 * Math.sin((i / 256) * TAU + 2.1)
    lut[i * 3 + 2] = 128 + 127 * Math.sin((i / 256) * TAU + 4.2)
  }
  let t = 0
  /** per-channel pulse, 1 on a trigger, decaying over PULSE_SEC; bands take the max of theirs */
  const chPulse = new Float32Array(MAX_CHANNELS)
  const bandPulse = new Float32Array(PLASMA_BANDS)
  /** ring buffer of ripples: x, y (cells), age (s), amplitude; age >= life means unused */
  const ripples = new Float32Array(MAX_RIPPLES * 4)
  for (let r = 0; r < MAX_RIPPLES; r++) ripples[r * 4 + 2] = RIPPLE_LIFE_SEC
  let nextRipple = 0
  let bass = 0
  let mid = 0
  let high = 0
  let palettePhase = 0
  let mode = start % PLASMA_MODES
  const label = createModeLabel()
  return {
    click() {
      mode = (mode + 1) % PLASMA_MODES
      label.show(PLASMA_NAMES[mode] ?? '')
      return mode
    },
    draw(ctx, f, dt) {
      if (!f || !sctx) return idle(ctx, f)
      if (skip(f)) return
      const { intensity, pulse } = drive(f, dt)
      t += f.reducedMotion ? 1 : dt * (0.4 + 3 * intensity)
      const cols = 96
      const rows = Math.max(16, Math.round((cols * f.height) / Math.max(f.width, 1)))
      if (small.width !== cols || small.height !== rows) {
        small.width = cols
        small.height = rows
      }
      const chs = f.snap.ch
      const nCh = Math.min(chs.length, MAX_CHANNELS)
      const nBands = Math.max(1, Math.min(nCh, PLASMA_BANDS))
      bandPulse.fill(0)
      for (let c = 0; c < nCh; c++) {
        const ch = chs[c]
        const p = ch?.triggered ? 1 : Math.max(0, (chPulse[c] ?? 0) - dt / PULSE_SEC)
        chPulse[c] = p
        const b = c % nBands
        bandPulse[b] = Math.max(bandPulse[b] ?? 0, p)
        // a channel's ripples start from its own spot: across by pan, down by channel number
        if (mode === RIPPLES && ch?.triggered && !f.reducedMotion) {
          const o = nextRipple * 4
          ripples[o] = cols * (0.15 + 0.35 * (ch.pan + 1))
          ripples[o + 1] = rows * (0.15 + 0.7 * ((c * 0.618034) % 1))
          ripples[o + 2] = 0
          ripples[o + 3] = 0.4 + 0.6 * ch.volume
          nextRipple = (nextRipple + 1) % MAX_RIPPLES
        }
      }
      for (let r = 0; r < MAX_RIPPLES; r++) ripples[r * 4 + 2] = (ripples[r * 4 + 2] ?? 0) + dt
      // ~21 Hz per bin at 44.1 kHz: bass ≈ 20–130 Hz, mids ≈ 200–2000 Hz, treble ≈ 3–10 kHz
      bass = follow(bass, level(f.freq, 1, 7), dt)
      mid = follow(mid, level(f.freq, 10, 90), dt)
      high = follow(high, level(f.freq, 150, 450), dt)
      const pos = f.snap.pos
      const rowsPerSec = pos.kind === 'tracker' ? (pos.tempo * 0.4) / Math.max(1, pos.speed) : 8.33
      const tempo = Math.min(4, Math.max(0.25, rowsPerSec / 8.33))
      // the beat pulse decays over PULSE_SEC, so each beat pushes the palette ~25 steps ahead
      if (mode === KICK && !f.reducedMotion)
        palettePhase = (palettePhase + dt * (KICK_CYCLE * tempo + 200 * pulse)) % 256
      const shift = mode === KICK ? Math.floor(palettePhase) : 0

      const img = sctx.createImageData(cols, rows)
      const bright = 0.35 + 0.5 * intensity
      // swell mode zooms the field in around the centre on a beat, so the blobs puff out
      const zoom = mode === SWELL ? 1 - 0.12 * pulse : 1
      // spectrum mode: treble sharpens and boosts the fine wave, mids the cross waves,
      // bass surges the big circular ripple outwards
      const spec = mode === SPECTRUM
      const aHigh = spec ? 0.5 + 1.5 * high : 1
      const fHigh = spec ? 0.16 * (1 + 1.5 * high) : 0.16
      const aMid = spec ? 0.5 + 1.5 * mid : 1
      const aBass = spec ? 0.5 + 2 * bass : 1
      const pBass = spec ? bass * 3 : 0
      for (let y = 0; y < rows; y++) {
        const ys = rows / 2 + (y - rows / 2) * zoom
        // wobble mode: this row's slice of the waveform pushes it sideways
        const wob =
          mode === WOBBLE ? (f.time[Math.floor((y / rows) * f.time.length)] ?? 0) * cols * 0.3 : 0
        for (let x = 0; x < cols; x++) {
          const xs = cols / 2 + (x - cols / 2) * zoom + wob
          let v =
            aHigh * Math.sin(xs * fHigh + t) +
            aMid * Math.sin(ys * 0.22 + t * 1.3) +
            aMid * Math.sin((xs + ys) * 0.1 + t * 0.7) +
            aBass * Math.sin(Math.hypot(xs - cols / 2, ys - rows / 2) * 0.25 - t - pBass)
          if (mode === RIPPLES) {
            for (let r = 0; r < MAX_RIPPLES; r++) {
              const age = ripples[r * 4 + 2] ?? RIPPLE_LIFE_SEC
              if (age >= RIPPLE_LIFE_SEC) continue
              const d = Math.hypot(xs - (ripples[r * 4] ?? 0), ys - (ripples[r * 4 + 1] ?? 0))
              const front = d - age * RIPPLE_SPEED
              if (front < -12 || front > 12) continue
              const env = Math.exp(-(front * front) / 18) * (1 - age / RIPPLE_LIFE_SEC)
              v += 2.2 * (ripples[r * 4 + 3] ?? 0) * env * Math.sin(front * 0.8)
            }
          }
          const idx = Math.floor((v + 4) * 32) & 255
          const i = ((idx + shift) & 255) * 3
          const o = (y * cols + x) * 4
          const r = lut[i] ?? 0
          const g = lut[i + 1] ?? 0
          const b = lut[i + 2] ?? 0
          let k = bright
          if (mode === SWELL) {
            // only the hot cores flash: how far the colour is into the top 30% of its range
            const core = Math.max(0, Math.max(r, g, b) / 255 - 0.7) / 0.3
            k = bright * (1 + 0.9 * pulse * core)
          } else if (mode === CHANNELS) {
            // each colour band follows a channel: its blobs light up on that channel's hits,
            // most in the middle of the band so the edges stay soft
            const p = (idx / 256) * nBands
            const band = Math.floor(p)
            const centre = 1 - Math.abs(2 * (p - band) - 1) * 0.6
            k = bright * (1 + 0.9 * (bandPulse[band] ?? 0) * centre)
          }
          img.data[o] = r * k
          img.data[o + 1] = g * k
          img.data[o + 2] = b * k
          img.data[o + 3] = 255
        }
      }
      sctx.putImageData(img, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(small, 0, 0, f.width, f.height)
      label.draw(ctx, dt)
    },
  }
}

interface Star {
  x: number
  y: number
  z: number
  /** picks the channel this star follows: group % channel count */
  group: number
  /** projected position this frame; visible = on screen */
  px: number
  py: number
  visible: boolean
}

interface Planet {
  x: number
  y: number
  z: number
  /** world-space radius */
  r: number
  group: number
  /** plain-mode body colour */
  body: string
  /** ring tilt in radians, or null for no ring */
  ring: number | null
}

/** Enough groups that any channel count up to this spreads evenly over the stars. */
const STAR_GROUPS = 64
/** A trail reaches back to where the star was this many seconds ago. */
const TRAIL_SEC = 0.12
const PLANET_COOLDOWN_SEC = 8
const MAX_PLANETS = 2
/** planets drift at this fraction of the star speed */
const PLANET_SPEED = 0.6
/** planets start beyond the stars (z 1), so they come in small */
const PLANET_START_Z = 2.5
/** fade in from transparent over this much of the approach */
const PLANET_FADE_Z = 0.8
/** planets move slowly, so their trails reach further back than the stars' */
const PLANET_TRAIL_SEC = 0.6
const PLANET_BODIES = ['#4f6290', '#8a6a52', '#5e8270', '#735c8c', '#8c5a5a']
/** MIDI has no patterns: a planet comes when the loudness jumps this far over its slow average */
const LOUD_JUMP = 1.6
/** MP3/FLAC have neither: a planet comes on the first beat this long after the last one */
const STREAM_PLANET_SEC = 12

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo)

function starfieldInstance(start = 0): VisualizerInstance {
  const drive = createDrive()
  const skip = createStill()
  const stars: Star[] = Array.from({ length: 220 }, () => ({
    x: Math.random() * 2 - 1,
    y: Math.random() * 2 - 1,
    z: Math.random() * 0.95 + 0.05,
    group: Math.floor(Math.random() * STAR_GROUPS),
    px: 0,
    py: 0,
    visible: false,
  }))
  /** per-channel pulse, 1 on a trigger, decaying over PULSE_SEC */
  const pulses = new Float32Array(STAR_GROUPS)
  /** click cycles 8 modes; bit 1 = coloured, bit 2 = trails, bit 4 = planets */
  let mode = start % 8
  let planets: Planet[] = []
  let sinceSpawnSec = PLANET_COOLDOWN_SEC
  let lastOrder: number | null = null
  let slowLoud = 0
  const label = createModeLabel()
  return {
    click() {
      mode = (mode + 1) % 8
      if (!(mode & 4)) planets = []
      label.show(
        [mode & 1 ? 'colour' : 'plain', mode & 2 ? 'trails' : '', mode & 4 ? 'planets' : '']
          .filter(Boolean)
          .join(' + '),
      )
      return mode
    },
    draw(ctx, f, dt) {
      if (!f) return idle(ctx, f)
      if (skip(f)) return
      const { intensity } = drive(f, dt)
      const chs = f.snap.ch
      const nCh = Math.max(1, Math.min(chs.length, STAR_GROUPS))
      for (let i = 0; i < nCh; i++)
        pulses[i] = chs[i]?.triggered ? 1 : Math.max(0, (pulses[i] ?? 0) - dt / PULSE_SEC)
      const colours = mode & 1 ? themeColours(f.palette) : []
      const tintOf = (group: number): string | undefined =>
        colours[(group % nCh) % Math.max(1, colours.length)]
      const trails = (mode & 2) !== 0
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, f.width, f.height)
      const speed = f.reducedMotion ? 0 : 0.25 + 1.2 * intensity
      const cx = f.width / 2
      const cy = f.height / 2
      const scale = Math.max(f.width, f.height) / 2
      const projX = (x: number, z: number): number => cx + (x / z) * scale * 0.5
      const projY = (y: number, z: number): number => cy + (y / z) * scale * 0.5

      // Planets: one on each new pattern (MIDI: a loudness jump), with a cooldown.
      const pos = f.snap.pos
      let spawn: boolean
      if (pos.kind === 'tracker') {
        spawn = lastOrder !== null && pos.order !== lastOrder
        lastOrder = pos.order
      } else if (pos.kind === 'stream') {
        // mastered audio is too evenly loud for a loudness jump: wait, then land on a beat
        spawn = sinceSpawnSec >= STREAM_PLANET_SEC && chs.some((c) => c.triggered)
      } else {
        spawn = intensity > 0.2 && intensity > slowLoud * LOUD_JUMP
        slowLoud += (intensity - slowLoud) * Math.min(1, dt / 3)
      }
      sinceSpawnSec += dt
      if (mode & 4 && speed > 0) {
        if (spawn && sinceSpawnSec >= PLANET_COOLDOWN_SEC && planets.length < MAX_PLANETS) {
          sinceSpawnSec = 0
          const a = rand(0, TAU)
          const off = rand(0.35, 0.7)
          planets.push({
            x: Math.cos(a) * off,
            y: Math.sin(a) * off,
            z: PLANET_START_Z,
            r: rand(0.07, 0.16),
            group: Math.floor(Math.random() * STAR_GROUPS),
            body: PLANET_BODIES[Math.floor(Math.random() * PLANET_BODIES.length)] ?? '#4f6290',
            ring: Math.random() < 0.4 ? rand(-0.5, 0.5) : null,
          })
        }
        for (const p of planets) p.z -= speed * PLANET_SPEED * dt
        // gone once it has passed the camera or its disc has left the screen
        planets = planets.filter((p) => {
          if (p.z <= 0.05) return false
          const rr = (p.r / p.z) * scale * 0.5 * 1.8
          const px = projX(p.x, p.z)
          const py = projY(p.y, p.z)
          return px + rr > 0 && px - rr < f.width && py + rr > 0 && py - rr < f.height
        })
        planets.sort((a, b) => b.z - a.z)
      }

      for (const s of stars) {
        s.z -= speed * dt
        if (s.z <= 0.02) {
          s.x = Math.random() * 2 - 1
          s.y = Math.random() * 2 - 1
          s.z = 1
        }
        s.px = projX(s.x, s.z)
        s.py = projY(s.y, s.z)
        s.visible = s.px >= 0 && s.px < f.width && s.py >= 0 && s.py < f.height
        if (!s.visible) s.z = 1
      }

      const drawStar = (s: Star): void => {
        // Each star follows one channel: on its hits nearer stars swell, whiten and get a halo.
        // Coloured mode fades the group into its theme colour instead of white.
        const pulse = pulses[s.group % nCh] ?? 0
        const tint = tintOf(s.group)
        const { px, py } = s
        const near = 1 - s.z
        const size = (near * 2.5 + 0.5) * (1 + pulse * (0.5 + 1.5 * near))
        const c = Math.round(120 + 135 * near + (tint ? 0 : (135 - 135 * near) * pulse))
        const base = `rgb(${c},${c},255)`
        // Trails flash with the channel, like the halo: full on a hit, gone once the pulse decays.
        if (trails && speed > 0 && pulse > 0.05) {
          const tz = s.z + speed * TRAIL_SEC
          ctx.beginPath()
          ctx.moveTo(projX(s.x, tz), projY(s.y, tz))
          ctx.lineTo(px, py)
          ctx.lineWidth = size * 0.7
          ctx.globalAlpha = 0.6 * pulse
          ctx.strokeStyle = tint ?? base
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        if (pulse > 0.05) {
          const halo = size * 3
          ctx.globalAlpha = 0.25 * pulse * (0.3 + near)
          ctx.fillStyle = tint ?? base
          ctx.fillRect(px - halo / 2, py - halo / 2, halo, halo)
          ctx.globalAlpha = 1
        }
        ctx.fillStyle = base
        ctx.fillRect(px - size / 2, py - size / 2, size, size)
        if (tint && pulse > 0) {
          ctx.globalAlpha = pulse
          ctx.fillStyle = tint
          ctx.fillRect(px - size / 2, py - size / 2, size, size)
          ctx.globalAlpha = 1
        }
      }

      const drawPlanet = (p: Planet): void => {
        const px = projX(p.x, p.z)
        const py = projY(p.y, p.z)
        const r = (p.r / p.z) * scale * 0.5
        const pulse = pulses[p.group % nCh] ?? 0
        const tint = tintOf(p.group)
        const body = tint ?? p.body
        const glow = tint ?? 'rgb(200,210,255)'
        const fade = Math.min(1, (PLANET_START_Z - p.z) / PLANET_FADE_Z)
        // Trail modes: a streak the width of the disc, fading out toward where the planet was.
        // Like the star trails it flashes with the planet's channel.
        if (trails && speed > 0 && pulse > 0.05) {
          const tz = p.z + speed * PLANET_SPEED * PLANET_TRAIL_SEC
          const tx = projX(p.x, tz)
          const ty = projY(p.y, tz)
          const tg = ctx.createLinearGradient(tx, ty, px, py)
          tg.addColorStop(0, 'rgba(0,0,0,0)')
          tg.addColorStop(1, glow)
          ctx.beginPath()
          ctx.moveTo(tx, ty)
          ctx.lineTo(px, py)
          ctx.lineCap = 'round'
          ctx.lineWidth = r * 1.6
          ctx.globalAlpha = 0.35 * pulse * fade
          ctx.strokeStyle = tg
          ctx.stroke()
          ctx.lineCap = 'butt'
        }
        ctx.globalAlpha = fade
        // the ring pulses with the planet: it brightens toward the glow colour and blooms on hits
        const ringPath = (from: number, to: number): void => {
          if (p.ring === null) return
          ctx.beginPath()
          ctx.ellipse(px, py, r * 1.8, r * 0.45, p.ring, from, to)
          ctx.lineWidth = Math.max(1, r * 0.12 * (1 + 0.5 * pulse))
          ctx.globalAlpha = 0.7 * fade
          ctx.strokeStyle = body
          ctx.stroke()
          if (pulse > 0.05) {
            ctx.globalAlpha = 0.8 * pulse * fade
            ctx.shadowColor = glow
            ctx.shadowBlur = r * 0.3 * pulse
            ctx.strokeStyle = glow
            ctx.stroke()
            ctx.shadowBlur = 0
          }
          ctx.globalAlpha = fade
        }
        ringPath(Math.PI, TAU) // back half, behind the body
        // lit from the upper left, dark side to black so the bloom overlay can't wash it out
        const g = ctx.createRadialGradient(px - r * 0.4, py - r * 0.4, r * 0.1, px, py, r)
        g.addColorStop(0, body)
        g.addColorStop(0.6, body)
        g.addColorStop(1, '#000')
        ctx.beginPath()
        ctx.arc(px, py, r, 0, TAU)
        ctx.fillStyle = g
        ctx.fill()
        // the planet follows a channel too: its rim lights up on that channel's hits
        if (pulse > 0.05) {
          ctx.globalAlpha = 0.8 * pulse * fade
          ctx.shadowColor = glow
          ctx.shadowBlur = r * 0.4 * pulse
          ctx.lineWidth = Math.max(1, r * 0.06)
          ctx.strokeStyle = glow
          ctx.stroke()
          ctx.shadowBlur = 0
          ctx.globalAlpha = fade
        }
        ringPath(0, Math.PI) // front half
        ctx.globalAlpha = 1
      }

      // far to near: each planet hides the stars behind it, nearer stars pass in front
      let pi = 0
      for (const s of stars.filter((st) => st.visible).sort((a, b) => b.z - a.z)) {
        for (let p = planets[pi]; p && p.z >= s.z; p = planets[++pi]) drawPlanet(p)
        drawStar(s)
      }
      for (let p = planets[pi]; p; p = planets[++pi]) drawPlanet(p)
      label.draw(ctx, dt)
    },
  }
}

function copperInstance(): VisualizerInstance {
  const drive = createDrive()
  const skip = createStill()
  let t = 0
  return {
    draw(ctx, f, dt) {
      if (!f) return idle(ctx, f)
      if (skip(f)) return
      const { intensity, pulse } = drive(f, dt)
      t += f.reducedMotion ? 1 : dt
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, f.width, f.height)
      const amp = 0.15 + 0.85 * intensity
      const bar = Math.max(6, f.height / 14)
      for (let i = 0; i < 8; i++) {
        const y = f.height / 2 + Math.sin(t * 1.7 + i * 0.6) * f.height * 0.4 * amp
        const hue = (i * 40 + pulse * 140 + t * 20) % 360
        ctx.fillStyle = `hsl(${hue} 90% 25%)`
        ctx.fillRect(0, y - bar / 2, f.width, bar)
        ctx.fillStyle = `hsl(${hue} 90% 50%)`
        ctx.fillRect(0, y - bar / 3, f.width, (bar * 2) / 3)
        ctx.fillStyle = `hsl(${hue} 90% 80%)`
        ctx.fillRect(0, y - bar / 8, f.width, bar / 4)
      }
    },
  }
}

export const plasma: VisualizerDef = { id: 'plasma', name: 'Plasma', create: plasmaInstance }
export const starfield: VisualizerDef = {
  id: 'starfield',
  name: 'Starfield',
  create: starfieldInstance,
}
export const copper: VisualizerDef = { id: 'copper', name: 'Copper', create: copperInstance }
