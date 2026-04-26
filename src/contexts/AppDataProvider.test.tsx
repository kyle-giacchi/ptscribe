import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { AppDataProvider, useAppData } from './AppDataProvider';
import { defaultAppData } from '@/schemas';
import { dataRepository } from '@/services/DataRepository';

function Probe({ onReady }: { onReady: (api: ReturnType<typeof useAppData>) => void }) {
  const api = useAppData();
  onReady(api);
  return null;
}

describe('AppDataProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  it('initializes with default data when storage is empty', () => {
    let api!: ReturnType<typeof useAppData>;
    render(
      <AppDataProvider>
        <Probe onReady={(a) => (api = a)} />
      </AppDataProvider>,
    );
    expect(api.appData.version).toBe(defaultAppData().version);
  });

  it('debounces writes to localStorage', () => {
    let api!: ReturnType<typeof useAppData>;
    render(
      <AppDataProvider>
        <Probe onReady={(a) => (api = a)} />
      </AppDataProvider>,
    );
    act(() =>
      api.updateClinicianSlice({ ...api.appData.clinician, name: 'Dr. Test' }),
    );
    expect(dataRepository.load()).toBeNull();
    act(() => vi.advanceTimersByTime(350));
    expect(dataRepository.load()?.clinician.name).toBe('Dr. Test');
  });

  it('coalesces rapid writes into a single save', () => {
    let api!: ReturnType<typeof useAppData>;
    render(
      <AppDataProvider>
        <Probe onReady={(a) => (api = a)} />
      </AppDataProvider>,
    );
    const saveSpy = vi.spyOn(dataRepository, 'save');
    act(() => api.updateClinicianSlice({ ...api.appData.clinician, name: 'A' }));
    act(() => vi.advanceTimersByTime(100));
    act(() => api.updateClinicianSlice({ ...api.appData.clinician, name: 'B' }));
    act(() => vi.advanceTimersByTime(100));
    act(() => api.updateClinicianSlice({ ...api.appData.clinician, name: 'C' }));
    expect(saveSpy).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(350));
    expect(saveSpy).toHaveBeenCalledTimes(1);
    saveSpy.mockRestore();
  });
});
