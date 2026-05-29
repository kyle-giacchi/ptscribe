import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { purgeLegacyUnscopedStorage } from '@/lib/profile/legacyCleanup';

// One-time cleanup of pre-ADR-0007 un-suffixed storage (greenfield Profiles).
purgeLegacyUnscopedStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
