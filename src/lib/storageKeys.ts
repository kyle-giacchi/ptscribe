export const STORAGE_KEYS = {
  appData: 'ptnotes.appData',
  appDataCorrupt: 'ptnotes.appData.corrupt',
  vault: 'ptnotes.vault',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export const AUDIO_DB = {
  name: 'ptnotes-audio',
  version: 2,
  store: 'recordings',
  chunkStore: 'recording_chunks',
} as const;
