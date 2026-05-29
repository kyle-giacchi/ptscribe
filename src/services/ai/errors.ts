export type AiErrorKind =
  | 'network' // offline, fetch TypeError, all retries exhausted on 5xx/408
  | 'rate_limit' // 429
  | 'auth' // 401, 403
  | 'empty' // 200 OK but missing/empty text
  | 'timeout'; // AbortError from our internal timeout (NOT user-initiated cancel)

export type AiProvider = 'anthropic' | 'nova';

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

export interface FriendlyAiError {
  title: string;
  description: string;
  action: 'retry' | 'wait' | 'refresh' | 'shorten' | 'check_network';
  actionLabel: string;
}

const PROVIDER_NAMES: Record<AiProvider, string> = {
  anthropic: 'Anthropic',
  nova: 'Cloudflare Nova',
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
  }
}
