// AudioWorkletGlobalScope entry. The DOM lib lacks the worklet scope, so it is declared here.
import { createMidiPlayer, createTrackerPlayer } from '../engine'
import type { Player } from '../engine'
import type { SoundBank } from '../formats'
import { PROCESSOR_NAME, SNAPSHOT_EVERY_FRAMES } from './protocol'
import type { FromWorklet, ToWorklet } from './protocol'

declare global {
  var currentFrame: number
  var sampleRate: number
  function registerProcessor(name: string, ctor: new () => AudioWorkletProcessorBase): void
}
interface AudioWorkletProcessorBase {
  readonly port: MessagePort
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean
}
declare const AudioWorkletProcessor: new () => AudioWorkletProcessorBase

class TrackerProcessor extends AudioWorkletProcessor {
  private player: Player | null = null
  private bank: SoundBank | null = null
  private id = ''
  private playing = false
  private endedSent = false
  private debug = false
  private sinceSnapshot = 0
  private sinceStats = 0

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<ToWorklet>) => this.onMessage(e.data)
  }

  private post(m: FromWorklet): void {
    this.port.postMessage(m)
  }

  private snapshot(): void {
    if (this.player) {
      this.post({ type: 'snapshot', id: this.id, at: currentFrame, snap: this.player.snapshot() })
    }
  }

  private onMessage(m: ToWorklet): void {
    try {
      switch (m.type) {
        case 'bank':
          this.bank = m.bank
          break
        case 'load':
          this.id = m.id
          this.playing = false
          this.endedSent = false
          this.sinceSnapshot = 0
          this.sinceStats = 0
          if (m.song.kind === 'stream') {
            this.player = null
            this.post({
              type: 'error',
              id: m.id,
              message: 'Streamed songs play outside the worklet',
            })
            break
          }
          if (m.song.kind === 'midi') {
            if (!this.bank) {
              this.player = null
              this.post({ type: 'error', id: m.id, message: 'No sound bank loaded' })
              break
            }
            this.player = createMidiPlayer(m.song, this.bank, sampleRate, m.options)
          } else this.player = createTrackerPlayer(m.song, sampleRate, m.options)
          if (m.seek) this.player.seek(m.seek)
          this.post({ type: 'loaded', id: m.id })
          this.snapshot()
          break
        case 'play':
          this.playing = true
          break
        case 'pause':
          this.playing = false
          break
        case 'seek':
          this.player?.seek(m.to)
          this.endedSent = false
          this.snapshot()
          break
        case 'options':
          this.player?.setOptions(m.options)
          break
        case 'unload':
          this.player = null
          this.playing = false
          break
        case 'debug':
          this.debug = m.enabled
          break
      }
    } catch (err) {
      this.player = null
      this.playing = false
      this.post({
        type: 'error',
        id: this.id,
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const player = this.player
    const left = outputs[0]?.[0]
    const right = outputs[0]?.[1]
    if (!player || !this.playing || !left || !right) return true
    try {
      const frames = left.length
      player.render(left, right, frames)
      this.sinceSnapshot += frames
      if (this.sinceSnapshot >= SNAPSHOT_EVERY_FRAMES) {
        this.sinceSnapshot = 0
        this.post({
          type: 'snapshot',
          id: this.id,
          at: currentFrame + frames,
          snap: player.snapshot(),
        })
      }
      if (this.debug) {
        this.sinceStats += frames
        if (this.sinceStats >= sampleRate) {
          this.sinceStats = 0
          this.post({ type: 'stats', id: this.id, stats: { ...player.stats } })
        }
      }
      if (player.ended && !this.endedSent) {
        this.endedSent = true
        this.post({ type: 'ended', id: this.id })
      }
    } catch (err) {
      this.player = null
      this.playing = false
      left.fill(0)
      right.fill(0)
      this.post({
        type: 'error',
        id: this.id,
        message: err instanceof Error ? err.message : 'Render failed',
      })
    }
    return true
  }
}

registerProcessor(PROCESSOR_NAME, TrackerProcessor)
