import { SoundTouch } from 'soundtouchjs';

interface WorkerInput {
  id: number;
  samples: Float32Array;
  tempo: number;
}

interface WorkerSuccess {
  id: number;
  result: Float32Array;
  error?: never;
}

interface WorkerFailure {
  id: number;
  result?: never;
  error: string;
}

const post = self as unknown as {
  postMessage: (d: WorkerSuccess | WorkerFailure, t?: Transferable[]) => void;
};

self.onmessage = (event: MessageEvent<WorkerInput>) => {
  const { id, samples, tempo } = event.data;
  try {
    if (samples.length === 0) {
      post.postMessage({ id, result: new Float32Array(0) }, []);
      return;
    }

    const st = new SoundTouch();
    st.tempo = tempo;
    st.pitch = 1;

    const stereoIn = new Float32Array(samples.length * 2);
    for (let i = 0; i < samples.length; i += 1) {
      stereoIn[i * 2] = samples[i];
      stereoIn[i * 2 + 1] = samples[i];
    }
    st.inputBuffer.putSamples(stereoIn, 0, samples.length);

    const FLUSH_FRAMES = 8192;
    st.inputBuffer.putSamples(new Float32Array(FLUSH_FRAMES * 2), 0, FLUSH_FRAMES);
    st.process();

    const expectedFrames = Math.round(samples.length / tempo);
    const availableFrames = st.outputBuffer.frameCount as number;
    const outputFrames = Math.min(availableFrames, expectedFrames);

    if (outputFrames === 0) {
      post.postMessage({ id, result: new Float32Array(0) }, []);
      return;
    }

    const stereoOut = new Float32Array(outputFrames * 2);
    st.outputBuffer.receiveSamples(stereoOut, outputFrames);

    const out = new Float32Array(outputFrames);
    for (let i = 0; i < outputFrames; i += 1) out[i] = stereoOut[i * 2];

    post.postMessage({ id, result: out }, [out.buffer]);
  } catch (e) {
    post.postMessage({ id, error: (e as Error).message ?? 'Unknown worker error' });
  }
};
