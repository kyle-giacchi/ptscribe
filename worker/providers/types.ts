// worker/providers/types.ts
//
// Shared shapes for the BYOK generation provider registry (ADR-0009, issue 02).
// Each provider adapter turns the provider-agnostic note-generation request into
// that vendor's chat/messages API call, and parses the raw text back out. Routing
// and key resolution live in issue 03 — adapters here are pure request builders +
// response parsers + a standalone live key validator.

export type ProviderId = 'anthropic' | 'openai' | 'google';

export const PROVIDER_IDS: readonly ProviderId[] = ['anthropic', 'openai', 'google'];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

/** Provider-agnostic generation request (mirrors GenerateBody + the resolved key). */
export interface BuildRequestInput {
  model: string;
  system: string;
  /** Pre-built modifier block appended to the system prompt; provider-agnostic. */
  modifierBlock?: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Anthropic-only ephemeral prompt cache. No-op for OpenAI/Google. */
  cacheSystem?: boolean;
  /** The resolved plaintext provider key (decrypted upstream in issue 03). */
  apiKey: string;
}

/** Everything the caller needs to `fetch()` the upstream — no fetching done here. */
export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  /** JSON-serialized request body. */
  body: string;
}

export type ValidateReason = 'invalid_key' | 'rate_limited' | 'upstream_error' | 'network_error';

export interface ValidateResult {
  ok: boolean;
  reason?: ValidateReason;
}

export interface ProviderAdapter {
  id: ProviderId;
  /** Allowlisted generation model IDs. Replaces the single ALLOWED_GENERATE_MODELS. */
  modelAllowlist: Set<string>;
  /** Where the client sends the user to mint a key. */
  consoleUrl: string;
  /** Visual prefix hint for the key-entry field, e.g. "sk-ant-…". */
  keyHint: string;
  buildRequest(input: BuildRequestInput): ProviderRequest;
  /** Pull the raw text content out of this provider's success payload ("" if none). */
  extractText(json: unknown): string;
  /** Minimal live call (a models-list GET — no token spend) to validate the key. */
  validateKey(apiKey: string): Promise<ValidateResult>;
}
