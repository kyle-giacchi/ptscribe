export const isDemoMode = import.meta.env.VITE_DEMO_MODE !== 'false';

export const appEnv = (import.meta.env.VITE_APP_ENV ?? 'development') as
  | 'development'
  | 'staging'
  | 'production';
