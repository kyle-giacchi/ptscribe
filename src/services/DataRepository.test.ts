import { describe, expect, it, beforeEach } from 'vitest';
import { defaultAppData } from '@/schemas';
import { dataRepository } from './DataRepository';
import { STORAGE_KEYS } from '@/lib/storageKeys';

describe('DataRepository', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing stored', () => {
    expect(dataRepository.load()).toBeNull();
  });

  it('round-trips AppData', () => {
    const data = defaultAppData();
    dataRepository.save(data);
    const loaded = dataRepository.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(data.version);
    expect(loaded!.clinician).toEqual(data.clinician);
    expect(loaded!.templates.length).toBe(data.templates.length);
  });

  it('returns null for invalid stored data', () => {
    localStorage.setItem(STORAGE_KEYS.appData, '{ "garbage": true }');
    expect(dataRepository.load()).toBeNull();
  });

  it('clears stored data', () => {
    dataRepository.save(defaultAppData());
    dataRepository.clear();
    expect(dataRepository.load()).toBeNull();
  });
});
