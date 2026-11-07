import { ByteReader, ParseError, decodeCp437 } from './bytes'
import type { Preset, SoundBank, Zone } from './song'

type Gens = Map<number, number> // generator id → raw 16-bit amount

interface Bag {
  gen: number
}
interface Shdr {
  start: number
  end: number
  startLoop: number
  endLoop: number
  sampleRate: number
  rootKey: number
  pitchCorrection: number
  type: number
}

const GEN = {
  startAddrsOffset: 0,
  endAddrsOffset: 1,
  startloopAddrsOffset: 2,
  endloopAddrsOffset: 3,
  startAddrsCoarse: 4,
  endAddrsCoarse: 12,
  pan: 17,
  delayVolEnv: 33,
  attackVolEnv: 34,
  holdVolEnv: 35,
  decayVolEnv: 36,
  sustainVolEnv: 37,
  releaseVolEnv: 38,
  instrument: 41,
  keyRange: 43,
  velRange: 44,
  startloopAddrsCoarse: 45,
  initialAttenuation: 48,
  endloopAddrsCoarse: 50,
  coarseTune: 51,
  fineTune: 52,
  sampleID: 53,
  sampleModes: 54,
  exclusiveClass: 57,
  overridingRootKey: 58,
} as const

/** RIFF chunk list inside [r.pos, end). */
function readChunks(r: ByteReader, end: number): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>()
  while (r.pos + 8 <= end) {
    const id = decodeCp437(r.bytes(4))
    const size = r.u32le()
    const data = r.bytes(size)
    if (size & 1 && r.pos < r.length) r.pos++
    out.set(id, data)
  }
  return out
}

const signed = (v: number): number => (v << 16) >> 16

/** Reads `count` records of `size` bytes with `fn`. */
function records<T>(data: Uint8Array | undefined, size: number, fn: (r: ByteReader) => T): T[] {
  if (!data) throw new ParseError('Missing SoundFont chunk')
  const out: T[] = []
  for (let p = 0; p + size <= data.length; p += size) out.push(fn(new ByteReader(data, p)))
  return out
}

const bag = (r: ByteReader): Bag => {
  const gen = r.u16le()
  r.u16le()
  return { gen }
}

/** Generators of bag i (a Map, later entries win). */
function gensOf(bags: Bag[], gens: [number, number][], i: number): Gens {
  const m: Gens = new Map()
  const from = bags[i]?.gen ?? 0
  const to = bags[i + 1]?.gen ?? from
  for (let k = from; k < to; k++) {
    const g = gens[k]
    if (g) m.set(g[0], g[1])
  }
  return m
}

const readGen = (r: ByteReader): [number, number] => [r.u16le(), r.u16le()]

const num = (...ms: (Gens | undefined)[]): ((id: number, def: number) => number) => {
  return (id, def) => {
    for (const m of ms) {
      const v = m?.get(id)
      if (v !== undefined) return signed(v)
    }
    return def
  }
}

const range = (m: Gens | undefined, id: number): [number, number] => {
  const v = m?.get(id)
  return v === undefined ? [0, 127] : [v & 0xff, (v >> 8) & 0xff]
}

const seconds = (tc: number): number => 2 ** (Math.max(-12000, Math.min(8000, tc)) / 1200)

/** SoundFont 2 → SoundBank (decision 45). Throws ParseError. */
export function parseSf2(bytes: Uint8Array): SoundBank {
  const r = new ByteReader(bytes)
  if (decodeCp437(r.bytes(4)) !== 'RIFF') throw new ParseError('Not a SoundFont', 0)
  const riffSize = r.u32le()
  if (decodeCp437(r.bytes(4)) !== 'sfbk') throw new ParseError('Not a SoundFont', 8)
  const end = Math.min(8 + riffSize, r.length)

  let smpl: Uint8Array | undefined
  let pdta: Map<string, Uint8Array> | undefined
  let name = ''
  while (r.pos + 12 <= end) {
    const id = decodeCp437(r.bytes(4))
    const size = r.u32le()
    const next = r.pos + size + (size & 1)
    if (id === 'LIST') {
      const type = decodeCp437(r.bytes(4))
      const sub = readChunks(r, r.pos + size - 4)
      if (type === 'sdta') smpl = sub.get('smpl')
      else if (type === 'pdta') pdta = sub
      else if (type === 'INFO') name = decodeCp437(sub.get('INAM') ?? new Uint8Array())
    }
    r.seek(Math.min(next, r.length))
  }
  if (!smpl || !pdta) throw new ParseError('Missing SoundFont chunk')

  const pcm = new Float32Array(smpl.length >> 1)
  const dv = new DataView(smpl.buffer, smpl.byteOffset, pcm.length * 2)
  for (let i = 0; i < pcm.length; i++) pcm[i] = dv.getInt16(i * 2, true) / 32768

  const phdr = records(pdta.get('phdr'), 38, (b) => {
    const name = b.text(20)
    return { name, preset: b.u16le(), bank: b.u16le(), bag: b.u16le() }
  })
  const pbag = records(pdta.get('pbag'), 4, bag)
  const pgen = records(pdta.get('pgen'), 4, readGen)
  const inst = records(pdta.get('inst'), 22, (b) => {
    b.pos += 20
    return { bag: b.u16le() }
  })
  const ibag = records(pdta.get('ibag'), 4, bag)
  const igen = records(pdta.get('igen'), 4, readGen)
  const shdr = records(pdta.get('shdr'), 46, (b): Shdr => {
    b.pos += 20
    const start = b.u32le()
    const end = b.u32le()
    const startLoop = b.u32le()
    const endLoop = b.u32le()
    const sampleRate = b.u32le()
    const rootKey = b.u8()
    const pitchCorrection = b.i8()
    b.u16le()
    return { start, end, startLoop, endLoop, sampleRate, rootKey, pitchCorrection, type: b.u16le() }
  })

  /** Zones of one instrument, with instrument-level generators resolved. */
  const instZones = (instIdx: number): { g: Gens; s: Shdr }[] => {
    const first = inst[instIdx]?.bag ?? 0
    const last = inst[instIdx + 1]?.bag ?? first
    const out: { g: Gens; s: Shdr }[] = []
    let global: Gens | undefined
    for (let b = first; b < last; b++) {
      const g = gensOf(ibag, igen, b)
      const sid = g.get(GEN.sampleID)
      const s = sid === undefined ? undefined : shdr[sid]
      if (s === undefined) {
        if (b === first) global = g
        continue
      }
      out.push({ g: new Map([...(global ?? []), ...g]), s })
    }
    return out
  }

  const presets = new Map<number, Preset>()
  // The last phdr is the EOP terminator.
  for (let p = 0; p + 1 < phdr.length; p++) {
    const ph = phdr[p]
    const next = phdr[p + 1]
    if (!ph || !next) continue
    const zones: Zone[] = []
    let pGlobal: Gens | undefined
    for (let b = ph.bag; b < next.bag; b++) {
      const pz = gensOf(pbag, pgen, b)
      const instIdx = pz.get(GEN.instrument)
      if (instIdx === undefined) {
        if (b === ph.bag) pGlobal = pz
        continue
      }
      const pg = new Map([...(pGlobal ?? []), ...pz])
      for (const { g, s } of instZones(instIdx)) {
        const [k0, k1] = range(g, GEN.keyRange)
        const [pk0, pk1] = range(pg, GEN.keyRange)
        const [v0, v1] = range(g, GEN.velRange)
        const [pv0, pv1] = range(pg, GEN.velRange)
        const keyLo = Math.max(k0, pk0)
        const keyHi = Math.min(k1, pk1)
        const velLo = Math.max(v0, pv0)
        const velHi = Math.min(v1, pv1)
        if (keyLo > keyHi || velLo > velHi || s.type >= 0x8000) continue // ROM samples have no data
        const i = num(g)
        const both = (id: number, def: number): number => i(id, def) + num(pg)(id, 0)
        const off = (fine: number, coarse: number): number => i(fine, 0) + i(coarse, 0) * 32768
        const from = s.start + off(GEN.startAddrsOffset, GEN.startAddrsCoarse)
        const to = s.end + off(GEN.endAddrsOffset, GEN.endAddrsCoarse)
        if (from < 0 || to > pcm.length || to <= from) continue
        const root = i(GEN.overridingRootKey, -1)
        const modes = i(GEN.sampleModes, 0) & 3
        zones.push({
          keyLo,
          keyHi,
          velLo,
          velHi,
          data: pcm.subarray(from, to),
          sampleRate: s.sampleRate,
          rootKey: root >= 0 ? root : s.rootKey,
          tuneCents: both(GEN.coarseTune, 0) * 100 + both(GEN.fineTune, 0) + s.pitchCorrection,
          loopStart: s.startLoop + off(GEN.startloopAddrsOffset, GEN.startloopAddrsCoarse) - from,
          loopEnd: s.endLoop + off(GEN.endloopAddrsOffset, GEN.endloopAddrsCoarse) - from,
          loopMode: modes === 1 || modes === 3 ? modes : 0,
          // ×0.4: banks are voiced on E-mu hardware / FluidSynth, which scale this generator by 0.4
          attenuationDb: (Math.max(0, both(GEN.initialAttenuation, 0)) * 0.4) / 10,
          pan: Math.max(-1, Math.min(1, both(GEN.pan, 0) / 500)),
          env: {
            delayS: seconds(both(GEN.delayVolEnv, -12000)),
            attackS: seconds(both(GEN.attackVolEnv, -12000)),
            holdS: seconds(both(GEN.holdVolEnv, -12000)),
            decayS: seconds(both(GEN.decayVolEnv, -12000)),
            sustainDb: Math.max(0, Math.min(1440, both(GEN.sustainVolEnv, 0))) / 10,
            releaseS: seconds(both(GEN.releaseVolEnv, -12000)),
          },
          exclusiveClass: i(GEN.exclusiveClass, 0),
        })
      }
    }
    if (zones.length > 0) presets.set(ph.bank * 128 + ph.preset, { name: ph.name, zones })
  }
  return { name, presets }
}
