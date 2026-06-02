export type AiErrorKind =
  | 'network' // offline, fetch TypeError, all retries exhausted on 5xx/408
  | 'rate_limit' // 429
  | 'auth' // 401, 403
  | 'empty' // 200 OK but missing/empty text
  | 'timeout' // AbortError from our internal timeout (NOT user-initiated cancel)
  // BYOK generation (ADR-0009/0010) — distinguished by the Worker's response `code`,
  // not status alone (KEY_REJECTED=401 and PROVIDER_LIMITED=429 collide with auth/rate_limit).
  | 'no_key' // 402 NO_KEY — no provider key stored for the active provider
  | 'key_rejected' // 401 KEY_REJECTED — the user's provider rejected their key
  | 'provider_limited' // 429 PROVIDER_LIMITED — the user's provider rate-limited / out of credit
  | 'signin_required'; // 401 SIGNIN_REQUIRED — not authenticated (BYOK requires a session)

export type AiProvider = 'anthropic' | 'nova' | 'openai' | 'google';

export interface AiCallErrorInit {
  kind: AiErrorKind;
  provider: AiProvider;
  status?: number;
  attemptsMade: number;
  rawDetail?: string;
  message: string;
}

export class AiCallError extends Error {
  readonly kind: AiErrorKind;
  readonly provider: AiProvider;
  readonly status?: number;
  readonly attemptsMade: number;
  readonly rawDetail?: string;

  constructor(init: AiCallErrorInit) {
    super(init.message);
    this.name = 'AiCallError';
    this.kind = init.kind;
    this.provider = init.provider;
    this.status = init.status;
    this.attemptsMade = init.attemptsMade;
    this.rawDetail = init.rawDetail;
  }
}

export function classifyResponse(res: Response, _provider: AiProvider): AiErrorKind {
  if (res.status === 429) return 'rate_limit';
  if (res.status === 401 || res.status === 403) return 'auth';
  return 'network';
}

/** Worker `code` → error kind. BYOK codes carry meaning the status can't (401/429
 *  collide), so the response body `code` wins; we fall back to status otherwise. */
const CODE_TO_KIND: Record<string, AiErrorKind> = {
  NO_KEY: 'no_key',
  KEY_REJECTED: 'key_rejected',
  PROVIDER_LIMITED: 'provider_limited',
  SIGNIN_REQUIRED: 'signin_required',
};

export function classifyError(code: string | undefined, res: Response): AiErrorKind {
  if (code && CODE_TO_KIND[code]) return CODE_TO_KIND[code];
  return classifyResponse(res, 'anthropic');
}

export interface FriendlyAiError {
  title: string;
  description: string;
  action: 'retry' | 'wait' | 'refresh' | 'shorten' | 'check_network' | 'open_settings' | 'signin';
  actionLabel: string;
}

const PROVIDER_NAMES: Record<AiProvider, string> = {
  anthropic: 'Anthropic',
  nova: 'Cloudflare Nova',
  openai: 'OpenAI',
  google: 'Google',
};

export function friendlyAiError(err: AiCallError): FriendlyAiError {
  const name = PROVIDER_NAMES[err.provider];
  switch (err.kind) {
    case 'network':
      return {
        title: `Couldn't reach ${name}`,
        description: 'Check your internet connection. We tried 4 times over about 40 seconds.',
        action: 'check_network',
        actionLabel: 'Try again',
      };
    case 'rate_limit':
      return {
        title: `${name} is rate-limiting us`,
        description: 'Too many requests in a short window. Please wait a minute and try again.',
        action: 'wait',
        actionLabel: 'Try again',
      };
    case 'auth':
      return {
        title: 'Authentication failed',
        description: 'Your session may have expired. Refresh the page and try again.',
        action: 'refresh',
        actionLabel: 'Refresh page',
      };
    case 'empty':
      return {
        title: `${name} returned an empty result`,
        description:
          'The model gave us no usable text. Try again, or use a longer or more detailed transcript.',
        action: 'shorten',
        actionLabel: 'Try again',
      };
    case 'timeout':
      return {
        title: 'Request timed out',
        description:
          'The request took longer than expected and was canceled. Try again, optionally with a shorter transcript.',
        action: 'retry',
        actionLabel: 'Try again',
      };
    case 'no_key':
      return {
        title: `No ${name} API key set`,
        description:
          'Add your provider API key in Settings → AI providers to generate notes. The account also needs billing or credits enabled.',
        action: 'open_settings',
        actionLabel: 'Open Settings',
      };
    case 'key_rejected':
      return {
        title: `${name} rejected your API key`,
        description:
          'The stored key was refused. Re-paste a valid key in Settings, and confirm the provider account has billing/credits enabled.',
        action: 'open_settings',
        actionLabel: 'Open Settings',
      };
    case 'provider_limited':
      return {
        title: `${name} rate-limited the request`,
        description:
          'Your provider account is rate-limited or out of credit. Wait a moment and try again, or check your provider billing.',
        action: 'wait',
        actionLabel: 'Try again',
      };
    case 'signin_required':
      return {
        title: 'Sign in to generate notes',
        description:
          'Note generation with your own provider key requires an account. Sign in and try again.',
        action: 'signin',
        actionLabel: 'Sign in',
      };
  }
}
