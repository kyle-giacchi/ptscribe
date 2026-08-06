---
status: proposed
---

# Self-hosted note generation calls the endpoint directly from the browser, bypassing the Worker

## Context

PTScribe's hard rule is _"AI calls go through our Worker proxy"_ — the browser never sees a
provider credential, and the Worker injects the server-held BYOK key ([ADR-0009](0009-byok-server-held-provider-keys.md)).
That rule exists to protect a secret.

A clinician who runs their own model — Ollama or LM Studio on the laptop, or a clinic-hosted
vLLM/TGI box on the LAN — has no secret to protect. They chose self-hosting precisely so the
transcript never leaves equipment they control. Routing that transcript through Cloudflare to
reach a server sitting on the same desk would be strictly worse for privacy and would put PHI
on our infrastructure for no benefit. Applies to **note generation only**; transcription is
out of scope.

## Decision

For the `local` and `network` generation providers, the browser calls the OpenAI-compatible
endpoint **directly**: `POST {baseUrl}/v1/chat/completions`, no Worker in the path.

- **No gate header, no cookies.** `credentials: 'omit'`, no `x-ptscribe-key` — the endpoint is
  the user's own machine, not ours. An optional user-supplied bearer token rides in
  vault-encrypted `AppData` (`AISettings.generation.endpoints`), like any other local setting.
- **Signed-in accounts only** (`useSelfHostedAllowed`). Demo mode and the test-user session are
  excluded, matching how every other cloud-adjacent route is gated.
- **The modifier block is composed client-side.** The Worker normally appends it server-side to
  keep the prompt-cache key stable; there is no Worker and no cache here, so `generate.ts`
  concatenates it before the call. The string the model receives is identical in shape.
- **URL validation is a browser-platform rule, not a preference.** An HTTPS page may fetch
  `http://localhost` (trustworthy-origin exemption) but a plain-`http://` LAN address is blocked
  as mixed content with no actionable error, so Settings rejects it up front and explains the
  reverse-proxy fix. Chrome additionally requires the server to answer the Private Network
  Access preflight with `Access-Control-Allow-Private-Network: true`.
- **Failures never auto-fall-back to cloud.** A failed self-hosted call surfaces the error
  banner with an explicit "Use cloud once" button, gated by a confirm dialog. It is a one-shot
  override passed as an argument — it does **not** write settings, so the next Generate goes
  back to the self-hosted endpoint.

The session-backed `generateCount` cap still applies: it is a workflow guard, not a spend guard.

## Consequences

- The "AI calls go through our Worker proxy" hard rule now reads: it applies to providers whose
  credential we custody. Self-hosted endpoints are the named exception.
- A browser collapses server-down, CORS rejection, mixed content, and private-network blocks
  into one indistinguishable `TypeError`. The new `unreachable` error kind covers all four with
  one message that lists the causes; there is no way to be more specific from the client.
- Setup is genuinely harder than BYOK — the user must set `OLLAMA_ORIGINS` and, on a LAN, front
  the server with a certificate. Settings ships the per-server instructions inline rather than
  pretending it is one-click.
- Small local models comply with JSON output poorly. We send
  `response_format: { type: 'json_object' }` (ignored by servers that don't know it) and the
  existing `extractJson` fence-stripping absorbs the rest.
