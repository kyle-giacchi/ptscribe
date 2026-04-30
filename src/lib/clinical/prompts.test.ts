import { describe, expect, it } from 'vitest';
import { buildUserPrompt } from './prompts';
import type { Note, NoteTemplate, Patient } from '@/types';

const basePatient: Patient = {
  id: 'p1',
  firstName: 'Alex',
  lastName: 'Rivera',
  status: 'active',
  createdAt: 0,
  updatedAt: 0,
};

const baseTemplate: NoteTemplate = {
  id: 't1',
  name: 'SOAP Note',
  format: 'soap',
  sections: [
    { key: 'subjective', label: 'Subjective' },
    { key: 'objective', label: 'Objective' },
    { key: 'assessment', label: 'Assessment' },
    { key: 'plan', label: 'Plan' },
  ],
  systemPrompt: '',
  builtin: true,
  createdAt: 0,
  updatedAt: 0,
};

const baseTranscript = 'Patient reports left knee pain rated 6 out of 10.';

describe('buildUserPrompt', () => {
  it('includes the patient full name', () => {
    const result = buildUserPrompt({
      template: baseTemplate,
      transcript: baseTranscript,
      patient: basePatient,
    });
    expect(result).toContain('Alex Rivera');
  });

  it('includes the transcript text', () => {
    const result = buildUserPrompt({
      template: baseTemplate,
      transcript: baseTranscript,
      patient: basePatient,
    });
    expect(result).toContain(baseTranscript);
  });

  it('includes session type when provided', () => {
    const result = buildUserPrompt({
      template: baseTemplate,
      transcript: baseTranscript,
      patient: basePatient,
      sessionType: 'follow_up',
    });
    expect(result).toContain('Session type: Follow-up');
  });

  it('omits session type line when not provided', () => {
    const result = buildUserPrompt({
      template: baseTemplate,
      transcript: baseTranscript,
      patient: basePatient,
    });
    expect(result).not.toContain('Session type:');
  });

  it('uses correct label for evaluation session type', () => {
    const result = buildUserPrompt({
      template: baseTemplate,
      transcript: baseTranscript,
      patient: basePatient,
      sessionType: 'evaluation',
    });
    expect(result).toContain('Session type: Initial Evaluation');
  });

  it('includes a prior note block when priorNote is provided', () => {
    const priorNote: Note = {
      id: 'n0',
      sessionId: 's0',
      patientId: 'p1',
      format: 'soap',
      sections: [{ key: 'subjective', label: 'Subjective', body: 'Prior visit content.' }],
      finalized: true,
      createdAt: 0,
      updatedAt: 0,
    };
    const result = buildUserPrompt({
      template: baseTemplate,
      transcript: baseTranscript,
      patient: basePatient,
      priorNote,
    });
    expect(result).toContain('Prior note');
    expect(result).toContain('Prior visit content.');
  });

  it('omits the prior note section when priorNote is not provided', () => {
    const result = buildUserPrompt({
      template: baseTemplate,
      transcript: baseTranscript,
      patient: basePatient,
    });
    expect(result).not.toContain('Prior note');
  });

  it('includes optional patient fields when present', () => {
    const patient: Patient = {
      ...basePatient,
      sex: 'F',
      primaryDiagnosis: 'Knee OA',
      icd10: 'M17.11',
      notes: 'Allergic to NSAIDs',
    };
    const result = buildUserPrompt({ template: baseTemplate, transcript: baseTranscript, patient });
    expect(result).toContain('Sex: F');
    expect(result).toContain('Primary diagnosis: Knee OA');
    expect(result).toContain('ICD-10: M17.11');
    expect(result).toContain('Allergic to NSAIDs');
  });

  it('omits optional patient fields when absent', () => {
    const result = buildUserPrompt({
      template: baseTemplate,
      transcript: baseTranscript,
      patient: basePatient,
    });
    expect(result).not.toContain('Sex:');
    expect(result).not.toContain('ICD-10:');
  });

  it('shows placeholder when transcript is empty', () => {
    const result = buildUserPrompt({
      template: baseTemplate,
      transcript: '',
      patient: basePatient,
    });
    expect(result).toContain('(no transcript provided)');
  });

  it('does not leak MRN into the prompt', () => {
    const patient: Patient = { ...basePatient, mrn: 'MRN-12345-SECRET' };
    const result = buildUserPrompt({
      template: baseTemplate,
      transcript: baseTranscript,
      patient,
    });
    expect(result).not.toContain('MRN-12345-SECRET');
    expect(result).not.toContain('MRN');
  });

});
