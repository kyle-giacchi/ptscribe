import type {
  AiDebugPrompts,
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

// Appended to the system prompt when no AI (diarized) transcript is available.
// Browser speech recognition captures a single merged audio stream with no
// speaker labels, so we explicitly signal this to the model.
const NO_DIARIZATION_NOTE =
  '\n\n# Transcript speaker context\n' +
  'This transcript was captured using browser speech recognition without speaker diarization. ' +
  'The clinician and patient voices are merged into a single audio stream — use clinical context ' +
  'to infer who is speaking rather than relying on speaker labels.';

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
  signal?: AbortSignal;
  onRetry?: (info: { attempt: number; max: number; reason: string }) => void;
}

export interface GenerateNoteResult {
  sections: NoteSection[];
  rawText: string;
  debugPrompts: AiDebugPrompts;
}

type GenerateBackend = (args: GenerateNoteArgs) => Promise<GenerateNoteResult>;

const generateBackends: Record<GenerationProvider, GenerateBackend> = {
  anthropic: async (args) => {
    const userPrompt = buildUserPrompt({
      template: args.template,
      transcript: args.transcript,
      patient: args.patient,
      priorNote: args.priorNote,
      sessionType: args.sessionType,
    });

    const hasSpeakerContext =
      args.activeTranscriptTier === 't2' || args.activeTranscriptTier === 't3';
    const system = hasSpeakerContext
      ? args.template.systemPrompt
      : args.template.systemPrompt.trimEnd() + NO_DIARIZATION_NOTE;

    const modifierBlock = args.modifiers ? buildModifierBlock(args.modifiers) : '';

    const result = await callAnthropic({
      model: args.model || 'claude-sonnet-4-6',
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
      debugPrompts: { system, modifierBlock, user: userPrompt },
    };
  },
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
