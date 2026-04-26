import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { AppDataProvider, useAppData } from './AppDataProvider';
import { defaultAppData } from '@/schemas';
import { dataRepository } from '@/services/DataRepository';

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

describe('AppDataProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with default data when storage is empty', async () => {
    const api = await renderProviderAndAwait();
    expect(api.appData.version).toBe(defaultAppData().version);
  });

  it('debounces writes to localStorage', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = await renderProviderAndAwait();
    act(() => api.updateClinicianSlice({ ...api.appData.clinician, name: 'Dr. Test' }));
    expect(await dataRepository.load()).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
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
});
