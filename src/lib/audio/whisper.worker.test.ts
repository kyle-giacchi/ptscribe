import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pipelineMock = vi.fn();

vi.mock('@huggingface/transformers', () => ({
  pipeline: (...args: unknown[]) => pipelineMock(...args),
  env: {
    remoteHost: '',
    useBrowserCache: false,
    allowLocalModels: false,
    backends: { onnx: { wasm: {} } },
  },
}));

/**
 * Covers issue 02's WebGPU→WASM fallback branch in getPipeline(): the case most
 * likely to be silently broken by an incomplete try/catch. Full cross-browser
 * verification is issue 03's job (real devices); this just proves the branch
 * logic against a mocked `pipeline()`.
 */
describe('whisper.worker backend selection', () => {
  let postSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    pipelineMock.mockReset();
    postSpy = vi.spyOn(self, 'postMessage').mockImplementation(() => {});
    delete (navigator as unknown as Record<string, unknown>).gpu;
  });

  afterEach(() => {
    postSpy.mockRestore();
    delete (navigator as unknown as Record<string, unknown>).gpu;
  });

  it('skips the webgpu attempt and goes straight to wasm when navigator.gpu is absent', async () => {
    pipelineMock.mockResolvedValue({});
    await import('./whisper.worker');

    self.onmessage!({ data: { id: 1, type: 'preload', model: 'x' } } as MessageEvent);
    await vi.waitFor(() => expect(pipelineMock).toHaveBeenCalled());

    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(pipelineMock.mock.calls[0][2]).toMatchObject({ device: 'wasm' });
  });

  it('uses webgpu when navigator.gpu is present and init succeeds', async () => {
    Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
    pipelineMock.mockResolvedValue({});
    await import('./whisper.worker');

    self.onmessage!({ data: { id: 2, type: 'preload', model: 'x' } } as MessageEvent);
    await vi.waitFor(() => expect(pipelineMock).toHaveBeenCalled());

    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(pipelineMock.mock.calls[0][2]).toMatchObject({ device: 'webgpu' });
    await vi.waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'backend', device: 'webgpu' }),
      ),
    );
  });

  it('falls back to wasm when the webgpu attempt throws', async () => {
    Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
    pipelineMock.mockRejectedValueOnce(new Error('no adapter')).mockResolvedValueOnce({});
    await import('./whisper.worker');

    self.onmessage!({ data: { id: 3, type: 'preload', model: 'x' } } as MessageEvent);
    await vi.waitFor(() => expect(pipelineMock).toHaveBeenCalledTimes(2));

    expect(pipelineMock.mock.calls[0][2]).toMatchObject({ device: 'webgpu' });
    expect(pipelineMock.mock.calls[1][2]).toMatchObject({ device: 'wasm' });
    await vi.waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'backend', device: 'wasm' }),
      ),
    );
  });
});
