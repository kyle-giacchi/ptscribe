import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import './index.css';
import App from './App';
import { purgeLegacyUnscopedStorage } from '@/lib/profile/legacyCleanup';

// One-time cleanup of pre-ADR-0007 un-suffixed storage (greenfield Profiles).
purgeLegacyUnscopedStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* JS-driven motion honors prefers-reduced-motion; the CSS guard in index.css can't reach it. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
