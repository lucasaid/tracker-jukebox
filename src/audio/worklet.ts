// AudioWorkletGlobalScope entry. The DOM lib lacks the worklet scope, so it is declared here.
import { PROCESSOR_NAME } from './protocol'

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
  // Outputs silence until P13 hosts a Player here.
  process(): boolean {
    return true
  }
}

registerProcessor(PROCESSOR_NAME, TrackerProcessor)
