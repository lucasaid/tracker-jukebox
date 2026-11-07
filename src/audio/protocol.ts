import type { ParsedFile, SoundBank } from '../formats'
import type { PlayerOptions, PlayerStats, SeekTarget, Snapshot } from '../engine'

export const PROCESSOR_NAME = 'tj-player'
export const SNAPSHOT_EVERY_FRAMES = 512

/** main → worklet (structured clone copies the sample buffers) */
export type ToWorklet =
  | { type: 'bank'; bank: SoundBank }
  | { type: 'load'; id: string; song: ParsedFile; options: PlayerOptions; seek?: SeekTarget }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; to: SeekTarget }
  | { type: 'options'; options: Partial<PlayerOptions> }
  | { type: 'unload' }
  | { type: 'debug'; enabled: boolean }

/** worklet → main */
export type FromWorklet =
  | { type: 'loaded'; id: string }
  | { type: 'snapshot'; id: string; at: number; snap: Snapshot }
  | { type: 'ended'; id: string }
  | { type: 'error'; id: string | null; message: string }
  | { type: 'stats'; id: string; stats: PlayerStats }
