// Shared data model for every parsed file. See docs/PLAN.md → Contracts → src/formats.

export type Format = 'mod' | 'stm' | 's3m' | 'mtm' | '669' | 'midi' | 'mp3' | 'flac'
/** Played by the browser through an <audio> element; we only read the header. */
export type StreamFormat = 'mp3' | 'flac'
/** Also selects the effect quirks in the engine. */
export type TrackerFormat = Exclude<Format, 'midi' | StreamFormat>
export const FORMATS: readonly Format[] = ['mod', 's3m', 'stm', '669', 'mtm', 'midi', 'mp3', 'flac']
export type MidiTarget = 'gm' | 'mt32'

/** Notes are otherwise 0..119, C-0 = 0, C-4 = 48. */
export const NOTE_NONE = -1
export const NOTE_CUT = -2
export const MAX_CHANNELS = 32

export const Fx = {
  None: 0,
  Arpeggio: 1,
  PortaUp: 2,
  PortaDown: 3,
  TonePorta: 4,
  Vibrato: 5,
  TonePortaVolSlide: 6,
  VibratoVolSlide: 7,
  Tremolo: 8,
  SetPan: 9,
  Offset: 10,
  VolSlide: 11,
  PosJump: 12,
  SetVolume: 13,
  PatBreak: 14,
  SetSpeed: 15,
  SetTempo: 16,
  FinePortaUp: 17,
  FinePortaDown: 18,
  FineVolUp: 19,
  FineVolDown: 20,
  PatLoop: 21,
  NoteCut: 22,
  NoteDelay: 23,
  PatDelay: 24,
  Retrig: 25,
  Tremor: 26,
  SetFinetune: 27,
  GlobalVolume: 28,
  VibratoWaveform: 29,
  TremoloWaveform: 30,
  StereoControl: 31,
  FreqAdjust: 32,
} as const
export type Fx = (typeof Fx)[keyof typeof Fx]

export interface Cell {
  /** 0..119 | NOTE_NONE | NOTE_CUT */
  note: number
  /** 1-based sample number, 0 = none */
  ins: number
  /** 0..64 from a volume column, -1 = none (MOD/MTM always -1) */
  vol: number
  fx: Fx
  /** 0..255 as decision 9 specifies */
  param: number
  /** command as stored (MOD/MTM 0..15, S3M/STM 1..26 = A..Z, 669 0..15); -1 = none */
  fxRaw: number
  paramRaw: number
}

export interface Pattern {
  /** 64, or the 669 break row + 1 */
  rows: number
  /** 669 per-pattern ticks/row, applied at row 0; null for other formats */
  speed: number | null
  /** cells[row * song.channels + ch], length rows * channels */
  cells: Cell[]
}

export interface Sample {
  name: string
  /** mono, [-1, 1) */
  data: Float32Array
  /** frames */
  loopStart: number
  /** frames, exclusive; loopEnd <= loopStart → no loop */
  loopEnd: number
  /** 0..64 */
  volume: number
  /** playback rate in Hz at note C-4 (48) */
  c2spd: number
}

export interface Song {
  kind: 'tracker'
  format: TrackerFormat
  title: string
  tracker: string
  message: string
  channels: number
  /** length channels, -1..1 */
  channelPan: number[]
  stereo: boolean
  initialSpeed: number
  initialTempo: number
  /** 0..64 */
  globalVolume: number
  /** 0..1 */
  mixGain: number
  orders: number[]
  patterns: Pattern[]
  /** samples[ins - 1] */
  samples: Sample[]
}

export type MidiEvent =
  | { tick: number; ch: number; type: 'noteOn'; key: number; vel: number }
  | { tick: number; ch: number; type: 'noteOff'; key: number }
  | { tick: number; ch: number; type: 'program'; program: number }
  | { tick: number; ch: number; type: 'cc'; cc: number; value: number }
  | { tick: number; ch: number; type: 'pitchBend'; value: number }

export interface MidiSong {
  kind: 'midi'
  format: 'midi'
  title: string
  tracker: string
  message: string
  ticksPerBeat: number
  tempoMap: { tick: number; usPerBeat: number }[]
  events: MidiEvent[]
  channelsUsed: number[]
  target: MidiTarget
}

/** key = bank * 128 + program; drums are bank 128 */
export interface SoundBank {
  name: string
  presets: Map<number, Preset>
}
export interface Preset {
  name: string
  zones: Zone[]
}
export interface Zone {
  keyLo: number
  keyHi: number
  velLo: number
  velHi: number
  data: Float32Array
  sampleRate: number
  rootKey: number
  tuneCents: number
  loopStart: number
  loopEnd: number
  loopMode: 0 | 1 | 3
  attenuationDb: number
  pan: number
  env: {
    delayS: number
    attackS: number
    holdS: number
    decayS: number
    sustainDb: number
    releaseS: number
  }
  exclusiveClass: number
}

/** Header-only description of a streamed file; the audio itself is never decoded by us. */
export interface StreamFile {
  kind: 'stream'
  format: StreamFormat
  /** ID3 TIT2 / Vorbis TITLE, '' if none */
  title: string
  /** ID3 TPE1 / Vorbis ARTIST, '' if none */
  artist: string
  /** always '': keeps describe() uniform */
  tracker: ''
  message: ''
  durationSec: number
  sampleRate: number
  channels: number
}

export type ParsedFile = Song | MidiSong | StreamFile
