import type { NoteTemplate, Patient, Note, SessionType, ToneStyle } from '@/types';

export interface BuildPromptArgs {
  template: NoteTemplate;
  transcript: string;
  patient: Patient;
  priorNote?: Note;
  sessionType?: SessionType;
}

const TONE_INSTRUCTIONS: Record<ToneStyle, string> = {
  narrative: 'Write in flowing professional prose. Full sentences. Clinical but readable.',
  terse:
    'Write in bullet-point shorthand. Phrases over sentences. Skip articles where ambiguity is low. Prefer abbreviations a PT will recognize (PROM, AROM, MMT, WBAT, NWB, etc.).',
  clinical:
    'Write in formal clinical documentation style. Third-person passive where natural. Use precise anatomical and biomechanical terminology. Cite specific measurements when transcript supplies them.',
};

export function buildSystemPrompt(
  template: NoteTemplate,
  toneStyle: ToneStyle = 'narrative',
): string {
  const base = template.systemPrompt.trimEnd();
  return `${base}\n\n# Tone & style\n${TONE_INSTRUCTIONS[toneStyle]}`;
}

/**
 * Build the user message that pairs with `template.systemPrompt`.
 * The transcript is the primary signal; patient + prior note give context.
 * Output format is fully specified by the system prompt — no redundant instruction here.
 */
export function buildUserPrompt({
  transcript,
  patient,
  priorNote,
  sessionType,
}: BuildPromptArgs): string {
  const lines: string[] = [];

  lines.push('# Patient context');
  // Send a pseudonym ID rather than the real name to limit PHI transmitted to Anthropic (A9).
  lines.push(`Patient ID: PT-${patient.id.slice(0, 8)}`);
  if (patient.dob) {
    const ageYears = Math.floor((Date.now() - patient.dob) / (365.25 * 24 * 3_600_000));
    lines.push(`Age: ${ageYears}`);
  }
  if (patient.sex) lines.push(`Sex: ${patient.sex}`);
  if (patient.primaryDiagnosis) lines.push(`Primary diagnosis: ${patient.primaryDiagnosis}`);
  if (patient.icd10) lines.push(`ICD-10: ${patient.icd10}`);
  if (patient.notes) lines.push(`Patient notes: ${patient.notes}`);
  if (sessionType) {
    const sessionTypeLabel: Record<SessionType, string> = {
      evaluation: 'Initial Evaluation',
      follow_up: 'Follow-up',
      progress: 'Progress Note',
      discharge: 'Discharge',
    };
    lines.push(`Session type: ${sessionTypeLabel[sessionType]}`);
  }

  if (priorNote) {
    lines.push('');
    lines.push('# Prior note (most recent)');
    for (const section of priorNote.sections) {
      lines.push(`## ${section.label}`);
      lines.push(section.body || '(empty)');
    }
  }

  lines.push('');
  lines.push("# Today's session transcript");
  lines.push(transcript || '(no transcript provided)');

  return lines.join('\n');
}
