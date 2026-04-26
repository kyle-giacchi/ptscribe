import type { Note, NoteTemplate, Patient } from '@/types';

/**
 * Render a Note + its template into a clean markdown block suitable for
 * copy/paste into an EMR.
 */
export function renderNoteMarkdown(
  note: Note,
  template: NoteTemplate | undefined,
  patient: Patient,
): string {
  const date = new Date(note.createdAt).toLocaleString();
  const lines: string[] = [
    `# ${patient.firstName} ${patient.lastName} — ${template?.name ?? note.format}`,
    `**Date:** ${date}`,
    note.finalized ? '**Status:** Finalized' : '**Status:** Draft',
    '',
  ];
  for (const section of note.sections) {
    lines.push(`## ${section.label}`);
    lines.push(section.body || '_(empty)_');
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Plain-text version (no markdown) suitable for email or quick paste.
 */
export function renderNotePlainText(
  note: Note,
  template: NoteTemplate | undefined,
  patient: Patient,
): string {
  const date = new Date(note.createdAt).toLocaleString();
  const lines: string[] = [
    `${patient.firstName} ${patient.lastName} — ${template?.name ?? note.format}`,
    `Date: ${date}`,
    note.finalized ? 'Status: Finalized' : 'Status: Draft',
    '',
  ];
  for (const section of note.sections) {
    lines.push(`${section.label.toUpperCase()}`);
    lines.push(section.body || '(empty)');
    lines.push('');
  }
  return lines.join('\n');
}
