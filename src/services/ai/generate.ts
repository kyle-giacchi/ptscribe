import type {
  AiDebugPrompts,
  GenerateKeyReport,
  GenerationProvider,
  NoteSection,
  NoteTemplate,
  Note,
  Patient,
  SelfHostedEndpoint,
  SelfHostedProvider,
  SessionModifiers,
  SessionType,
  TranscriptTier,
} from '@/types';
import { callAnthropic } from './client/anthropic';
import { callOpenAiCompat } from './client/openaiCompat';
import { buildUserPrompt, buildModifierBlock } from '@/lib/clinical/prompts';
import { DIARIZATION_NOTE, NO_DIARIZATION_NOTE, NO_PII_RULE } from '@/lib/clinical/promptAppendix';

export interface GenerateNoteArgs {
  provider: GenerationProvider;
  model: string;
  template: NoteTemplate;
  transcript: string;
  patient: Patient;
  priorNote?: Note;
  sessionType?: SessionType;
  modifiers?: SessionModifiers;
  activeTranscriptTier?: TranscriptTier;
  regenerationDraft?: Note;
  regenerationFeedback?: string;
  /** Required when `provider` is 'local' or 'network'. Resolved by the caller
   *  from settings so this module stays settings-agnostic. */
  endpoint?: SelfHostedEndpoint;
  signal?: AbortSignal;
  onRetry?: (info: { attempt: number; max: number; reason: string }) => void;
}

export interface GenerateNoteResult {
  sections: NoteSection[];
  rawText: string;
  debugPrompts: AiDebugPrompts;
  keyReport: GenerateKeyReport;
}

type GenerateBackend = (args: GenerateNoteArgs) => Promise<GenerateNoteResult>;

// All three BYOK providers (Anthropic, OpenAI, Google) share one backend: the
// prompt build is identical and only the `provider` sent to the Worker differs.
// The Worker resolves the user's key for that provider and forwards the call.
const workerBackend: GenerateBackend = async (args) => {
  const provider = args.provider as 'anthropic' | 'openai' | 'google';
  const { system, modifierBlock, userPrompt } = buildPrompts(args);
  const model = args.model || (provider === 'anthropic' ? 'claude-sonnet-4-6' : args.model);

  const result = await callAnthropic({
    provider,
    model,
    system,
    modifierBlock,
    user: userPrompt,
    signal: args.signal,
    onRetry: args.onRetry,
  });

  return parseIntoSections(args, result.text, { model, system, modifierBlock, user: userPrompt });
};

/**
 * Self-hosted generation (ADR-0011): the browser talks to the user's own
 * OpenAI-compatible server directly — no Worker, so the transcript never
 * touches our infrastructure.
 */
const selfHostedBackend: GenerateBackend = async (args) => {
  const provider = args.provider as SelfHostedProvider;
  if (!args.endpoint?.baseUrl || !args.endpoint.model) {
    throw new Error(
      `No ${provider === 'local' ? 'local' : 'in-network'} endpoint configured. Add one in Settings.`,
    );
  }
  const { system, modifierBlock, userPrompt } = buildPrompts(args);
  // The Worker normally appends the modifier block server-side to keep the
  // prompt-cache key stable. There is no Worker and no cache here, so compose it
  // client-side — the string sent to the model must still be identical in shape.
  const fullSystem = system + modifierBlock;

  const result = await callOpenAiCompat({
    provider,
    endpoint: args.endpoint,
    system: fullSystem,
    user: userPrompt,
    signal: args.signal,
    onRetry: args.onRetry,
  });

  return parseIntoSections(args, result.text, {
    model: args.endpoint.model,
    system: fullSystem,
    modifierBlock,
    user: userPrompt,
  });
};

const generateBackends: Record<GenerationProvider, GenerateBackend> = {
  anthropic: workerBackend,
  openai: workerBackend,
  google: workerBackend,
  local: selfHostedBackend,
  network: selfHostedBackend,
  none: () => {
    throw new Error('AI generation is disabled. Pick a provider in Settings.');
  },
};

/** Prompt build shared by every backend — the model sees the same thing either way. */
function buildPrompts(args: GenerateNoteArgs) {
  const userPrompt = buildUserPrompt({
    template: args.template,
    transcript: args.transcript,
    patient: args.patient,
    priorNote: args.priorNote,
    sessionType: args.sessionType,
    regenerationDraft: args.regenerationDraft,
    regenerationFeedback: args.regenerationFeedback,
  });

  // Only the cloud path (Nova-3 / T3) produces a diarized transcript with
  // speaker labels. T1 (browser speech recognition) and T2 (local Whisper)
  // are a single merged stream, so we tell the model speakers aren't split.
  const speakerNote = args.activeTranscriptTier === 't3' ? DIARIZATION_NOTE : NO_DIARIZATION_NOTE;
  return {
    system: args.template.systemPrompt.trimEnd() + speakerNote + NO_PII_RULE,
    modifierBlock: args.modifiers ? buildModifierBlock(args.modifiers) : '',
    userPrompt,
  };
}

function parseIntoSections(
  args: GenerateNoteArgs,
  rawText: string,
  debugPrompts: AiDebugPrompts,
): GenerateNoteResult {
  const parsed = extractJson(rawText);
  const sections: NoteSection[] = args.template.sections.map((s) => ({
    key: s.key,
    label: s.label,
    body: typeof parsed[s.key] === 'string' ? (parsed[s.key] as string) : '',
  }));
  return { sections, rawText, debugPrompts, keyReport: buildKeyReport(args.template, parsed) };
}

/**
 * Send the transcript + context to the configured provider and parse the
 * JSON response into `NoteSection[]`. The response shape is fixed by the
 * template's system prompt — keys must match `template.sections[*].key`.
 */
export async function generateNote(args: GenerateNoteArgs): Promise<GenerateNoteResult> {
  const backend = generateBackends[args.provider];
  if (!backend) {
    throw new Error(`Unknown generation provider: ${args.provider}`);
  }
  return backend(args);
}

/**
 * Compare the keys the model returned against the keys the template expects.
 * Drives the precise "blank note" diagnostics (key mismatch vs. empty result)
 * in both the generate toast and the debug drawer.
 */
export function buildKeyReport(
  template: NoteTemplate,
  parsed: Record<string, unknown>,
): GenerateKeyReport {
  const expected = template.sections.map((s) => s.key);
  const returned = Object.keys(parsed);
  const expectedSet = new Set(expected);
  const returnedSet = new Set(returned);
  const matched = expected.filter((k) => returnedSet.has(k));
  return {
    expected,
    returned,
    matched,
    missing: expected.filter((k) => !returnedSet.has(k)),
    unexpected: returned.filter((k) => !expectedSet.has(k)),
    emptyMatched: matched.filter(
      (k) => typeof parsed[k] !== 'string' || (parsed[k] as string).trim() === '',
    ),
  };
}

/**
 * Pull the first JSON object out of the model's reply. Models occasionally
 * wrap JSON in markdown fences or add a leading sentence; this is forgiving.
 */
export function extractJson(text: string): Record<string, unknown> {
  // Prefer a bare JSON object in the raw text — avoids matching a prose code fence that precedes the JSON block.
  const bareStart = text.indexOf('{');
  const bareEnd = text.lastIndexOf('}');
  if (bareStart !== -1 && bareEnd > bareStart) {
    try {
      return JSON.parse(text.slice(bareStart, bareEnd + 1)) as Record<string, unknown>;
    } catch {
      // Fall through to fence-based extraction.
    }
  }

  // Fall back: extract from the first code fence.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI response did not contain a JSON object');
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Failed to parse AI JSON: ${(e as Error).message}`, { cause: e });
  }
}
