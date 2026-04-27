import { describe, expect, it } from 'vitest';
import { renderNoteMarkdown, renderNotePlainText } from './noteFormat';
import type { Note, NoteTemplate, Patient } from '@/types';

const patient: Patient = {
  id: 'p1',
  firstName: 'Alex',
  lastName: 'Rivera',
  status: 'active',
  createdAt: 0,
  updatedAt: 0,
};

const template: NoteTemplate = {
  id: 't1',
  name: 'SOAP Note',
  format: 'soap',
  sections: [],
  systemPrompt: '',
  builtin: true,
  createdAt: 0,
  updatedAt: 0,
};

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    sessionId: 's1',
    patientId: 'p1',
    format: 'soap',
    sections: [
      { key: 'subjective', label: 'Subjective', body: 'Patient reports pain.' },
      { key: 'objective', label: 'Objective', body: '' },
    ],
    finalized: false,
    createdAt: new Date('2024-06-15T10:00:00Z').getTime(),
    updatedAt: new Date('2024-06-15T10:00:00Z').getTime(),
    ...overrides,
  };
}

describe('renderNoteMarkdown', () => {
  it('includes the patient full name in the header', () => {
    const result = renderNoteMarkdown(makeNote(), template, patient);
    expect(result).toContain('Alex Rivera');
  });

  it('includes the template name in the header', () => {
    const result = renderNoteMarkdown(makeNote(), template, patient);
    expect(result).toContain('SOAP Note');
  });

  it('shows "Draft" status for unfinalized notes', () => {
    const result = renderNoteMarkdown(makeNote({ finalized: false }), template, patient);
    expect(result).toContain('Status:** Draft');
  });

  it('shows "Finalized" status for finalized notes', () => {
    const result = renderNoteMarkdown(makeNote({ finalized: true }), template, patient);
    expect(result).toContain('Status:** Finalized');
  });

  it('includes each section label', () => {
    const result = renderNoteMarkdown(makeNote(), template, patient);
    expect(result).toContain('## Subjective');
    expect(result).toContain('## Objective');
  });

  it('includes section body content', () => {
    const result = renderNoteMarkdown(makeNote(), template, patient);
    expect(result).toContain('Patient reports pain.');
  });

  it('renders placeholder for empty section body', () => {
    const result = renderNoteMarkdown(makeNote(), template, patient);
    expect(result).toContain('_(empty)_');
  });

  it('falls back to note.format when template is undefined', () => {
    const result = renderNoteMarkdown(makeNote(), undefined, patient);
    expect(result).toContain('soap');
  });
});

describe('renderNotePlainText', () => {
  it('includes the patient full name', () => {
    const result = renderNotePlainText(makeNote(), template, patient);
    expect(result).toContain('Alex Rivera');
  });

  it('includes the template name', () => {
    const result = renderNotePlainText(makeNote(), template, patient);
    expect(result).toContain('SOAP Note');
  });

  it('shows "Draft" for unfinalized notes', () => {
    const result = renderNotePlainText(makeNote({ finalized: false }), template, patient);
    expect(result).toContain('Status: Draft');
  });

  it('shows "Finalized" for finalized notes', () => {
    const result = renderNotePlainText(makeNote({ finalized: true }), template, patient);
    expect(result).toContain('Status: Finalized');
  });

  it('uppercases section labels', () => {
    const result = renderNotePlainText(makeNote(), template, patient);
    expect(result).toContain('SUBJECTIVE');
    expect(result).toContain('OBJECTIVE');
  });

  it('renders placeholder for empty section body', () => {
    const result = renderNotePlainText(makeNote(), template, patient);
    expect(result).toContain('(empty)');
  });

  it('contains no markdown syntax', () => {
    const result = renderNotePlainText(makeNote(), template, patient);
    expect(result).not.toContain('**');
    expect(result).not.toContain('##');
  });
});
