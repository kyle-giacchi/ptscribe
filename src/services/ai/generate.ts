import type {
  GenerationProvider,
  NoteSection,
  NoteTemplate,
  Note,
  Patient,
  SessionType,
  ToneStyle,
} from '@/types';
import { callAnthropic } from './client/anthropic';
import { buildUserPrompt } from '@/lib/clinical/prompts';

export interface GenerateNoteArgs {
  provider: GenerationProvider;
  model: string;
  template: NoteTemplate;
  transcript: string;
  patient: Patient;
  priorNote?: Note;
  sessionType?: SessionType;
  toneStyle?: ToneStyle;
  signal?: AbortSignal;
}

export interface GenerateNoteResult {
  sections: NoteSection[];
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

    const result = await callAnthropic({
      model: args.model || 'claude-sonnet-4-6',
      // Send the raw template system prompt WITHOUT the tone block. The Worker
      // appends the tone block server-side from its static TONE_BLOCKS constant,
      // so the string Anthropic caches is always built from a stable source.
      system: args.template.systemPrompt,
      toneStyle: args.toneStyle,
      user: userPrompt,
      signal: args.signal,
    });

    const parsed = extractJson(result.text);
    const sections: NoteSection[] = args.template.sections.map((s) => ({
      key: s.key,
      label: s.label,
      body: typeof parsed[s.key] === 'string' ? (parsed[s.key] as string) : '',
    }));
    return { sections };
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
