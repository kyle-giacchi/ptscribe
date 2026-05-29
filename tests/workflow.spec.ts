import { test, expect, type Page } from '@playwright/test';

// End-to-end coverage for the headline session surface, driven entirely through
// the UI with no microphone and no real AI.
//
// How the dependencies are removed:
//  - Demo mode is ON by default under `npm run dev`, so the app auto-unlocks the
//    vault and seeds a demo patient + empty draft session (no login/wizard).
//  - The access gate is a client-side sha256 obscurity check; we pre-seed its
//    stored hash so the Landing code prompt is skipped.
//  - The record tab's "Skip — edit manually" tile reaches the Review tab without
//    a microphone, and `/api/*` is stubbed so nothing hits the network.
//
// This exercises the real entry → access gate → setup-check → demo-bootstrap →
// session-mount → Review chain (which is easy to break and had no E2E coverage)
// and the note-staleness detection that recently landed.

const TRANSCRIPT = 'Patient reports right shoulder pain, worse with overhead reach.';
const EDITOR_PLACEHOLDER = 'Speak while recording, paste in a transcript, or type freely.';
// sha256('112233') — the published demo access code. The gate is obscurity-only
// (real enforcement is the Worker's x-ptscribe-key header), so seeding the hash
// is the legitimate way to skip the Landing code prompt in a test.
const GATE_HASH = 'e0bc60c82713f64ef8a57c0c40d02ce24fd0141d5cc3086259c19b1e62a62bea';

/** Stub every AI/network endpoint the session might touch. */
async function stubNetwork(page: Page): Promise<void> {
  await page.route('**/api/generate', (route) =>
    route.fulfill({
      json: {
        text: JSON.stringify({
          subjective: 'Reports right shoulder pain with overhead reach.',
          objective: 'AROM limited in flexion. Tenderness over supraspinatus.',
          assessment: 'Rotator cuff strain, improving.',
          plan: 'Continue strengthening; reassess in one week.',
        }),
      },
    }),
  );
  await page.route('**/api/transcribe', (route) => route.fulfill({ json: { text: '' } }));
  // `npm run dev` runs only Vite (not the Worker on :8787), so model fetches would
  // hang on ECONNREFUSED and keep the setup-check spinner busy. Fail them fast.
  await page.route('**/api/model/**', (route) => route.fulfill({ status: 404, body: '' }));
}

/**
 * Boot fresh, clear the access + setup-check gates, and reach the Review tab of
 * the demo session with a blank note (via "Skip — edit manually"). Leaves the
 * page showing the "Clinical note" heading and the editable transcript.
 */
async function reachBlankReview(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate((hash) => {
    localStorage.clear();
    localStorage.setItem('ptnotes.gate', hash);
  }, GATE_HASH);

  await page.goto('/sessions/demo-session');

  // First run routes to /setup-check; the mic/model checks can't pass headless,
  // so take the explicit "Continue to recording" escape hatch (SPA nav — no reload,
  // so the demo "Welcome back" prompt does not appear).
  const cont = page.getByRole('button', { name: /continue to recording/i });
  await expect(cont).toBeVisible({ timeout: 20_000 });
  await cont.click();

  // Skip recording → Review tab with an empty, editable transcript.
  const skip = page.getByText(/Skip.*edit manually/i);
  await expect(skip).toBeVisible({ timeout: 15_000 });
  await skip.click();

  await expect(page.getByRole('heading', { name: 'Clinical note' })).toBeVisible({
    timeout: 15_000,
  });
}

test('headline session surface is reachable with a blank, editable note', async ({ page }) => {
  await stubNetwork(page);
  await reachBlankReview(page);

  // The clinician can type a transcript by hand…
  await expect(page.getByPlaceholder(EDITOR_PLACEHOLDER)).toBeVisible();
  // …and the note-generation control is present.
  await expect(page.getByRole('button', { name: /generate/i }).first()).toBeVisible();
});

test('editing the transcript after generating marks the note stale', async ({ page }) => {
  await stubNetwork(page);
  await reachBlankReview(page);

  // The empty-state textarea flips to a read-only formatted view once the
  // transcript is non-empty, so type once, then re-open it via "Edit transcript"
  // (which pins edit mode) and blur to commit through patchSession → encrypted save.
  await page.getByPlaceholder(EDITOR_PLACEHOLDER).fill(TRANSCRIPT);
  await page.getByRole('button', { name: 'Edit transcript' }).click();
  const editor = page.getByPlaceholder(EDITOR_PLACEHOLDER);
  await expect(editor).toBeVisible();
  await editor.fill(TRANSCRIPT);
  await editor.blur();

  // Generate a note from the committed transcript (stubbed response).
  const generate = page.getByRole('button', { name: /generate/i }).first();
  await expect(generate).toBeEnabled({ timeout: 15_000 });
  await generate.click();

  // The "last generated …" indicator only renders once a note exists.
  await expect(page.getByText(/last generated/i)).toBeVisible({ timeout: 15_000 });

  // Edit the transcript so it no longer matches the generated note, then commit.
  const editor2 = page.getByPlaceholder(EDITOR_PLACEHOLDER);
  await expect(editor2).toBeVisible();
  await editor2.fill(TRANSCRIPT + ' Also reports improved sleep.');
  await editor2.blur();

  // The note is now out of sync with its inputs → the stale banner is shown.
  const staleBanner = page.getByText(/generated from an earlier version of the transcript/i);
  await expect(staleBanner).toBeVisible({ timeout: 15_000 });
});
