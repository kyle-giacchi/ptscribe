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

// Appended to the system prompt when a diarized (Nova / T3) transcript is
// available. Only the cloud path (Nova-3) emits speaker labels, so this rule
// is added exclusively for T3 — it tells the model how to map labelled turns
// to note sections.
const DIARIZATION_NOTE =
  '\n\n# Transcript speaker context\n' +
  'Speaker labels (e.g. "Speaker 0:", "Speaker 1:") in the transcript identify turns from a ' +
  "diarized recording. Treat the clinician's questions and observations as objective/intervention " +
  "content and the patient's reports as subjective content — infer roles from context.";

// Appended to the system prompt when no diarized transcript is available.
// Local Whisper (T2) and browser speech recognition (T1) capture a single
// merged audio stream with no speaker labels, so we explicitly signal that the
// transcript does not split up the different speakers in the room.
const NO_DIARIZATION_NOTE =
  '\n\n# Transcript speaker context\n' +
  'This transcript was captured without speaker diarization, so it does not split up the ' +
  'different speakers in the room. The clinician and patient voices are merged into a single ' +
  'stream with no speaker labels — use clinical context to infer who is speaking rather than ' +
  'relying on speaker labels.';

// Always appended to the system prompt, for every template and every transcript
// tier. The generated note must capture clinical content (symptoms, findings,
// interventions, plan) WITHOUT echoing back direct personal identifiers — i.e.
// the output must be de-identified. This is a privacy hard rule, not a stylistic
// preference: the note is reviewed and stored on-device, and we never want
// identifying PII/PHI to be reproduced in the AI's output even if it appears in
// the transcript or patient context.
const NO_PII_RULE =
  '\n\n# Privacy: never return personal identifiers (PII / PHI)\n' +
  'This is a strict, non-negotiable rule that overrides every other instruction. Even when the ' +
  'transcript or patient context contains personally identifying information, you MUST NOT copy, ' +
  'echo, paraphrase, or otherwise reproduce any direct personal identifiers in your output. The ' +
  'note must be de-identified.\n' +
  '- Never include names of the patient, clinician, family members, or any other individual. ' +
  'Refer to people generically — "the patient", "the clinician", "the patient\'s spouse", etc.\n' +
  '- Never include dates of birth, ages tied to a specific date, or exact calendar dates that ' +
  'could identify a visit. Use relative time only (e.g. "since the last visit", "3 weeks ago").\n' +
  '- Never include addresses, cities, ZIP codes, or any geographic detail more specific than is ' +
  'clinically necessary.\n' +
  '- Never include phone numbers, email addresses, fax numbers, or URLs.\n' +
  '- Never include Social Security numbers, medical record numbers (MRN), insurance or member ' +
  'IDs, account numbers, license/certificate numbers, device identifiers, or any other ID code.\n' +
  '- Never include employer names, school names, or other identifying institutions unless they ' +
  'are clinically essential (e.g. a work demand relevant to rehab) — and even then, omit the ' +
  'proper name.\n' +
  'Preserve the clinical substance (symptoms, measurements, interventions, assessment, plan); ' +
  'strip only the identifying details. When in doubt, leave the identifier out.';

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
  keyReport: GenerateKeyReport;
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

    // Only the cloud path (Nova-3 / T3) produces a diarized transcript with
    // speaker labels. T1 (browser speech recognition) and T2 (local Whisper)
    // are a single merged stream, so we tell the model speakers aren't split.
    const isDiarized = args.activeTranscriptTier === 't3';
    const speakerNote = isDiarized ? DIARIZATION_NOTE : NO_DIARIZATION_NOTE;
    const system = args.template.systemPrompt.trimEnd() + speakerNote + NO_PII_RULE;

    const modifierBlock = args.modifiers ? buildModifierBlock(args.modifiers) : '';
    const model = args.model || 'claude-sonnet-4-6';

    const result = await callAnthropic({
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
