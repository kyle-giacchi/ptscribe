export const STORAGE_KEYS = {
  appData: 'ptnotes.appData',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export const AUDIO_DB = {
  name: 'ptnotes-audio',
  version: 1,
  store: 'recordings',
} as const;
