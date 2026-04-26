# Future concerns — hosted Worker mode

Living list of issues we knowingly punted when we moved AI calls behind a Cloudflare Worker proxy with shared secrets. None block the current testing build; revisit before any real-PHI or wider-than-trusted-testers rollout.

## Cost / billing

- **Cost shifted to our account.** Anthropic tokens and Workers AI neurons are billed to whoever owns the deployed Worker, not to each clinician. Whisper ≈ 1 neuron/sec of audio; CF free tier is 10k neurons/day (~2.7 hrs of audio). Anthropic generation is the bigger line item per session. Budget alarms / a hard daily cap would be smart before opening this up further.
- **No per-user quota.** A single bad actor or a runaway recording could drain the daily neuron budget for everyone.

## Abuse / access control

- **Public URL is reachable to anyone.** The 6-digit gate is a soft UX gate, not security. Anyone who completes the gate can see the code in DevTools network panel; anyone who finds the deploy URL can also brute-force 1M combinations against `/api/*` if they want.
- **No rate limiting.** Add Cloudflare rate-limiting rules (or a simple in-memory counter keyed by IP in the Worker) before this is exposed to anyone outside the trusted-test group. 10 bad gate attempts per minute per IP is a sensible starting cap.
- **No structured audit log.** We have observability enabled but no separate "who hit /api with what gate code" trail. If the URL leaks we can't tell who did what.

## Privacy / PHI

- **Audio passes through our Worker.** That's a HIPAA-relevant change from the prior browser-direct model. The Setup/Settings disclaimer text was updated, but BAA terms with Cloudflare and Anthropic should be reviewed before a real PT puts a real patient through it.
- **Don't log audio.** `observability: { enabled: true }` is on. The Worker must never `console.log` request bodies or include them in error responses. (Current code does not.)
- **No retention policy on the Worker.** We don't store anything ourselves, but we should explicitly state that in the disclaimer + confirm with both providers.

## Architecture

- **Anthropic streaming.** The current `/api/generate` proxy buffers the full response. Switching to SSE streaming through the Worker would noticeably improve perceived latency on long notes. Workers stream fine; mostly a client-side rewrite.
- **Body wire format is `application/octet-stream`.** Chosen over base64 JSON to leave room for future binary integrations. No issue today; just noting for posterity.
- **No request size guard at the Worker.** The browser-side auto-rotation keeps clips under the Whisper input cap, but the Worker should defensively reject bodies larger than ~24 MB to avoid surprising error shapes.

## Schema / migration

- **Stale credential fields in old localStorage.** `Settings.ai.transcription.apiKey/accountId` and `Settings.ai.generation.apiKey` are no longer in the schema. Zod's default `.strip()` quietly drops them on next save, so no version bump was needed — but a backup JSON exported from a pre-Worker build will silently lose any keys it contained on import. Document this if anyone tries to migrate data between forks.

## Operational

- **Secret rotation.** `wrangler secret put ANTHROPIC_API_KEY` redeploys the Worker; rotation is a one-line ops task. We should still write down the rotation runbook somewhere it won't get lost.
- **Local dev requires two terminals.** `wrangler dev` (Worker + AI binding + secrets) on :8787, plus `npm run dev` (Vite) on :8080 with a proxy. Documented in README; consider a single `npm run dev:full` later.
