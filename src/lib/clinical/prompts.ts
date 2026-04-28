import type { NoteTemplate, Patient, Note, SessionType } from '@/types';

export interface BuildPromptArgs {
  template: NoteTemplate;
  transcript: string;
  patient: Patient;
  priorNote?: Note;
  sessionType?: SessionType;
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
  lines.push(`Name: ${patient.firstName} ${patient.lastName}`);
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
  lines.push('# Today\'s session transcript');
  lines.push(transcript || '(no transcript provided)');

  return lines.join('\n');
}
