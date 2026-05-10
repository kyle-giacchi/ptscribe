import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, act, screen, waitFor, fireEvent } from '@testing-library/react';
import {
  AppDataProvider,
  useAppData,
  purgeStaleAudio,
  purgeOrphanChunks,
} from './AppDataProvider';
import { defaultAppData } from '@/schemas';
import { dataRepository } from '@/services/DataRepository';
import { audioRepository } from '@/services/AudioRepository';
import { vault } from '@/lib/vault/vault';
import { toast } from 'sonner';
import type { AppData } from '@/types';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

// ─── helpers ──────────────────────────────────────────────────────────────────

function Probe({ onReady }: { onReady: (api: ReturnType<typeof useAppData>) => void }) {
  const api = useAppData();
  onReady(api);
  return null;
}

async function renderProviderAndAwait(): Promise<ReturnType<typeof useAppData>> {
  let api: ReturnType<typeof useAppData> | null = null;
  render(
    <AppDataProvider>
      <Probe onReady={(a) => (api = a)} />
    </AppDataProvider>,
  );
  await waitFor(() => expect(api).not.toBeNull());
  return api as unknown as ReturnType<typeof useAppData>;
}

// Captured by the onConflictChange spy so tests can trigger vault conflict events.
let capturedConflictCb: ((conflicted: boolean) => void) | null = null;

// ─── provider tests ────────────────────────────────────────────────────────────

describe('AppDataProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    capturedConflictCb = null;
    vi.clearAllMocks();

    vi.spyOn(vault, 'isTwoTabConflict').mockReturnValue(false);
    vi.spyOn(vault, 'onConflictChange').mockImplementation((cb) => {
      capturedConflictCb = cb;
      return () => {};
    });
    // Prevent real IDB calls in every test; individual tests override as needed.
    vi.spyOn(audioRepository, 'listChunkSessionIds').mockResolvedValue([]);
    vi.spyOn(audioRepository, 'remove').mockResolvedValue(undefined);
    vi.spyOn(audioRepository, 'clearChunks').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── initial load ─────────────────────────────────────────────────────────────

  it('initializes with default data when storage is empty', async () => {
    const api = await renderProviderAndAwait();
    expect(api.appData.version).toBe(defaultAppData().version);
  });

  it('renders the loading screen until data resolves', async () => {
    // Block load so the loading screen is visible.
    let resolveLoad!: (v: AppData | null) => void;
    vi.spyOn(dataRepository, 'load').mockReturnValue(new Promise((r) => (resolveLoad = r)));

    render(<AppDataProvider><div data-testid="child" /></AppDataProvider>);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).toBeNull();

    await act(async () => resolveLoad(null));

    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  // ── warning banners ───────────────────────────────────────────────────────────

  it('shows the corrupt-data banner when hasCorruptData returns true', async () => {
    vi.spyOn(dataRepository, 'hasCorruptData').mockReturnValue(true);

    render(<AppDataProvider><div /></AppDataProvider>);

    await waitFor(() =>
      expect(screen.getByText(/could not be loaded/)).toBeInTheDocument(),
    );
  });

  it('dismiss button hides the corrupt-data banner and calls clearCorruptData', async () => {
    vi.spyOn(dataRepository, 'hasCorruptData').mockReturnValue(true);
    const clearSpy = vi.spyOn(dataRepository, 'clearCorruptData').mockImplementation(() => {});

    render(<AppDataProvider><div /></AppDataProvider>);
    await waitFor(() => screen.getByRole('button', { name: /dismiss/i }));

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    await waitFor(() => expect(screen.queryByText(/could not be loaded/)).toBeNull());
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the two-tab banner when isTwoTabConflict returns true on load', async () => {
    vi.spyOn(vault, 'isTwoTabConflict').mockReturnValue(true);

    render(<AppDataProvider><div /></AppDataProvider>);

    await waitFor(() =>
      expect(screen.getByText(/open in another tab/)).toBeInTheDocument(),
    );
  });

  it('tracks vault conflict changes through onConflictChange subscription', async () => {
    render(<AppDataProvider><div /></AppDataProvider>);
    await waitFor(() => expect(capturedConflictCb).not.toBeNull());

    // Trigger a conflict.
    act(() => capturedConflictCb!(true));
    await waitFor(() =>
      expect(screen.getByText(/open in another tab/)).toBeInTheDocument(),
    );

    // Clear the conflict.
    act(() => capturedConflictCb!(false));
    await waitFor(() =>
      expect(screen.queryByText(/open in another tab/)).toBeNull(),
    );
  });

  it('renders both banners simultaneously when corrupt and twoTab are both active', async () => {
    vi.spyOn(dataRepository, 'hasCorruptData').mockReturnValue(true);
    vi.spyOn(vault, 'isTwoTabConflict').mockReturnValue(true);

    render(<AppDataProvider><div /></AppDataProvider>);

    await waitFor(() => {
      expect(screen.getAllByRole('alert')).toHaveLength(2);
    });
  });

  // ── slice mutations ───────────────────────────────────────────────────────────

  it('debounces writes to localStorage', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = await renderProviderAndAwait();
    act(() => api.updateClinicianSlice({ ...api.appData.clinician, name: 'Dr. Test' }));
    expect(await dataRepository.load()).toBeNull();
    await act(async () => { vi.advanceTimersByTime(350); });
    vi.useRealTimers();
    await waitFor(async () => {
      const loaded = await dataRepository.load();
      expect(loaded?.clinician.name).toBe('Dr. Test');
    });
  });

  it('coalesces rapid writes into a single save', async () => {
    const api = await renderProviderAndAwait();
    const saveSpy = vi.spyOn(dataRepository, 'save');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    act(() => api.updateClinicianSlice({ ...api.appData.clinician, name: 'A' }));
    act(() => vi.advanceTimersByTime(100));
    act(() => api.updateClinicianSlice({ ...api.appData.clinician, name: 'B' }));
    act(() => vi.advanceTimersByTime(100));
    act(() => api.updateClinicianSlice({ ...api.appData.clinician, name: 'C' }));
    expect(saveSpy).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(350));
    vi.useRealTimers();
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    saveSpy.mockRestore();
  });

  it('function-form updater receives the current slice value as prev', async () => {
    const api = await renderProviderAndAwait();
    let capturedPrev: AppData['patients'] | null = null;

    act(() => {
      api.updatePatientsSlice((prev) => {
        capturedPrev = prev;
        return prev; // identity — no re-render or save triggered
      });
    });

    expect(capturedPrev).toBe(api.appData.patients);
  });

  it('bulkUpdate applies multiple fields in a single debounced save', async () => {
    const saveSpy = vi.spyOn(dataRepository, 'save');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = await renderProviderAndAwait();

    const newClinician = { ...api.appData.clinician, name: 'Dr. Bulk' };
    const newNotes = [{ id: 'n1' } as AppData['notes'][0]];
    act(() => api.bulkUpdate({ clinician: newClinician, notes: newNotes }));

    await act(async () => { vi.advanceTimersByTime(350); });
    vi.useRealTimers();

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const saved = saveSpy.mock.calls[0][0];
    expect(saved.clinician.name).toBe('Dr. Bulk');
    expect(saved.notes).toEqual(newNotes);
    saveSpy.mockRestore();
  });

  it('bulkUpdate skips unchanged fields and does not trigger a save', async () => {
    const saveSpy = vi.spyOn(dataRepository, 'save');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = await renderProviderAndAwait();

    // Pass the exact same reference — no diff.
    act(() => api.bulkUpdate({ clinician: api.appData.clinician }));
    act(() => vi.advanceTimersByTime(350));
    vi.useRealTimers();

    expect(saveSpy).not.toHaveBeenCalled();
    saveSpy.mockRestore();
  });

  it('resetAll resets state to defaults and triggers a save', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = await renderProviderAndAwait();
    const saveSpy = vi.spyOn(dataRepository, 'save');

    act(() => api.resetAll());
    await act(async () => { vi.advanceTimersByTime(350); });
    vi.useRealTimers();

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const saved = saveSpy.mock.calls[0][0];
    // defaultAppData produces empty clinical data — timestamps differ per call so avoid toEqual.
    expect(saved.notes).toHaveLength(0);
    expect(saved.sessions).toHaveLength(0);
    saveSpy.mockRestore();
  });

  // ── save error toasts ─────────────────────────────────────────────────────────

  it('shows the quota toast when a save fails with QuotaExceeded', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = await renderProviderAndAwait();
    vi.spyOn(dataRepository, 'save').mockRejectedValue(
      new Error('QuotaExceededError: storage full'),
    );

    act(() => api.updateClinicianSlice({ ...api.appData.clinician, name: 'x' }));
    await act(async () => { vi.advanceTimersByTime(350); });
    vi.useRealTimers();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Storage quota exceeded'),
      ),
    );
  });

  it('shows the vault-conflict toast when a save fails with the two-tab vault error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = await renderProviderAndAwait();
    vi.spyOn(dataRepository, 'save').mockRejectedValue(
      new Error('vault: open in another tab — save blocked'),
    );

    act(() => api.updateClinicianSlice({ ...api.appData.clinician, name: 'x' }));
    await act(async () => { vi.advanceTimersByTime(350); });
    vi.useRealTimers();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Vault is open in another tab'),
      ),
    );
  });

  it('shows the generic save-failure toast for unexpected errors', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = await renderProviderAndAwait();
    vi.spyOn(dataRepository, 'save').mockRejectedValue(new Error('disk I/O error'));

    act(() => api.updateClinicianSlice({ ...api.appData.clinician, name: 'x' }));
    await act(async () => { vi.advanceTimersByTime(350); });
    vi.useRealTimers();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save data'),
      ),
    );
  });

  // ── hook guard ───────────────────────────────────────────────────────────────

  it('useAppData throws when used outside AppDataProvider', () => {
    function Naked() {
      useAppData();
      return null;
    }
    expect(() => render(<Naked />)).toThrow('useAppData must be used within AppDataProvider');
  });
});

// ─── purgeStaleAudio (pure unit tests — no rendering) ─────────────────────────

describe('purgeStaleAudio', () => {
  it('calls remove for each clip whose createdAt is before the cutoff', () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const sessions = [
      {
        clips: [
          { id: 'old-clip', createdAt: 100 },
          { id: 'new-clip', createdAt: 2000 },
        ],
      },
    ] as unknown as AppData['sessions'];

    purgeStaleAudio(sessions, { remove }, 500);

    expect(remove).toHaveBeenCalledWith('old-clip');
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('does not call remove when no clips predate the cutoff', () => {
    const remove = vi.fn();
    const sessions = [
      { clips: [{ id: 'recent', createdAt: 9999 }] },
    ] as unknown as AppData['sessions'];

    purgeStaleAudio(sessions, { remove }, 500);

    expect(remove).not.toHaveBeenCalled();
  });

  it('handles an empty sessions array without error', () => {
    const remove = vi.fn();
    purgeStaleAudio([], { remove }, Date.now());
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes clips across multiple sessions', () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const sessions = [
      { clips: [{ id: 'a', createdAt: 1 }] },
      { clips: [{ id: 'b', createdAt: 2 }, { id: 'c', createdAt: 9999 }] },
    ] as unknown as AppData['sessions'];

    purgeStaleAudio(sessions, { remove }, 500);

    expect(remove).toHaveBeenCalledWith('a');
    expect(remove).toHaveBeenCalledWith('b');
    expect(remove).toHaveBeenCalledTimes(2);
  });
});

// ─── purgeOrphanChunks (pure unit tests — no rendering) ───────────────────────

describe('purgeOrphanChunks', () => {
  it('clears chunk IDs that are absent from activeClipIds', async () => {
    const clearChunks = vi.fn().mockResolvedValue(undefined);
    const listChunkSessionIds = vi.fn().mockResolvedValue(['active-id', 'orphan-id']);

    await purgeOrphanChunks(new Set(['active-id']), { listChunkSessionIds, clearChunks });

    expect(clearChunks).toHaveBeenCalledWith('orphan-id');
    expect(clearChunks).not.toHaveBeenCalledWith('active-id');
  });

  it('does not call clearChunks when all chunk IDs belong to active clips', async () => {
    const clearChunks = vi.fn().mockResolvedValue(undefined);
    const listChunkSessionIds = vi.fn().mockResolvedValue(['active-id']);

    await purgeOrphanChunks(new Set(['active-id']), { listChunkSessionIds, clearChunks });

    expect(clearChunks).not.toHaveBeenCalled();
  });

  it('does nothing when there are no chunks at all', async () => {
    const clearChunks = vi.fn();
    const listChunkSessionIds = vi.fn().mockResolvedValue([]);

    await purgeOrphanChunks(new Set(['x', 'y']), { listChunkSessionIds, clearChunks });

    expect(clearChunks).not.toHaveBeenCalled();
  });

  it('resolves without throwing when listChunkSessionIds rejects', async () => {
    const clearChunks = vi.fn();
    const listChunkSessionIds = vi.fn().mockRejectedValue(new Error('IDB unavailable'));

    await expect(
      purgeOrphanChunks(new Set(), { listChunkSessionIds, clearChunks }),
    ).resolves.toBeUndefined();

    expect(clearChunks).not.toHaveBeenCalled();
  });
});
