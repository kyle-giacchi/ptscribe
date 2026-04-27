import type { GenerationProvider, NoteSection, NoteTemplate, Note, Patient, SessionType } from '@/types';
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
  signal?: AbortSignal;
}

export interface GenerateNoteResult {
  sections: NoteSection[];
}

/**
 * Send the transcript + context to the configured provider and parse the
 * JSON response into `NoteSection[]`. The response shape is fixed by the
 * template's system prompt — keys must match `template.sections[*].key`.
 *
 * Failures fall back to an "empty note" with the section keys preserved so
 * the user can still type something in.
 */
export async function generateNote(args: GenerateNoteArgs): Promise<GenerateNoteResult> {
  if (args.provider !== 'anthropic') {
    throw new Error('AI generation is disabled. Pick a provider in Settings.');
  }

  const userPrompt = buildUserPrompt({
    template: args.template,
    transcript: args.transcript,
    patient: args.patient,
    priorNote: args.priorNote,
    sessionType: args.sessionType,
  });

  const result = await callAnthropic({
    model: args.model || 'claude-sonnet-4-6',
    system: args.template.systemPrompt,
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
}

/**
 * Pull the first JSON object out of the model's reply. Models occasionally
 * wrap JSON in markdown fences or add a leading sentence; this is forgiving.
 */
function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI response did not contain a JSON object');
  }
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Failed to parse AI JSON: ${(e as Error).message}`, { cause: e });
  }
}
