import type { NoteTemplate, Patient, Note, SessionType, SessionModifiers } from '@/types';

export interface BuildPromptArgs {
  template: NoteTemplate;
  transcript: string;
  patient: Patient;
  priorNote?: Note;
  sessionType?: SessionType;
}

const TONE_INSTRUCTIONS: Record<NonNullable<SessionModifiers['tone']>, string> = {
  narrative: 'Write in flowing professional prose. Full sentences. Clinical but readable.',
  terse:
    'Write in bullet-point shorthand. Phrases over sentences. Skip articles where ambiguity is low. Prefer abbreviations a PT will recognize (PROM, AROM, MMT, WBAT, NWB, etc.).',
  clinical:
    'Write in formal clinical documentation style. Third-person passive where natural. Use precise anatomical and biomechanical terminology. Cite specific measurements when transcript supplies them.',
};

const EMPHASIS_INSTRUCTIONS: Record<NonNullable<SessionModifiers['emphasis'][number]>, string> = {
  more_detail: 'Include more clinical detail and specificity throughout.',
  functional_outcomes: 'Emphasize functional outcomes and their impact on the patient\'s daily activities.',
  patient_progress: 'Highlight patient progress, improvements, and response to treatment.',
};

export function buildModifierBlock(modifiers: SessionModifiers): string {
  const lines: string[] = [];

  if (modifiers.tone) {
    lines.push(`# Tone & style\n${TONE_INSTRUCTIONS[modifiers.tone]}`);
  }

  if (modifiers.emphasis.length > 0) {
    const emphasisLines = modifiers.emphasis.map((e) => `- ${EMPHASIS_INSTRUCTIONS[e]}`);
    lines.push(`# Emphasis\n${emphasisLines.join('\n')}`);
  }

  if (modifiers.customInstruction?.trim()) {
    lines.push(`# Additional instruction\n${modifiers.customInstruction.trim()}`);
  }

  return lines.join('\n\n');
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
