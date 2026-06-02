import type {
  AiDebugPrompts,
  GenerateKeyReport,
  GenerationProvider,
  NoteSection,
  NoteTemplate,
  Note,
  Patient,
  SessionModifiers,
  SessionType,
  TranscriptTier,
} from '@/types';
import { callAnthropic } from './client/anthropic';
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
  const isDiarized = args.activeTranscriptTier === 't3';
  const speakerNote = isDiarized ? DIARIZATION_NOTE : NO_DIARIZATION_NOTE;
  const system = args.template.systemPrompt.trimEnd() + speakerNote + NO_PII_RULE;

  const modifierBlock = args.modifiers ? buildModifierBlock(args.modifiers) : '';
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

  const parsed = extractJson(result.text);
  const sections: NoteSection[] = args.template.sections.map((s) => ({
    key: s.key,
    label: s.label,
    body: typeof parsed[s.key] === 'string' ? (parsed[s.key] as string) : '',
  }));
  return {
    sections,
    rawText: result.text,
    debugPrompts: { model, system, modifierBlock, user: userPrompt },
    keyReport: buildKeyReport(args.template, parsed),
  };
};

const generateBackends: Record<GenerationProvider, GenerateBackend> = {
  anthropic: workerBackend,
  openai: workerBackend,
  google: workerBackend,
  none: () => {
    throw new Error('AI generation is disabled. Pick a provider in Settings.');
  },
};

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
