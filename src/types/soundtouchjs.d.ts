declare module 'soundtouchjs' {
  export class SoundTouch {
    tempo: number;
    pitch: number;
    readonly inputBuffer: { putSamples(samples: Float32Array, start: number, numFrames: number): void };
    readonly outputBuffer: { frameCount: number; receiveSamples(output: Float32Array, numFrames: number): number };
    process(): void;
  }
}
