import { describe, expect, it } from 'vitest';
import { buildModifierBlock, buildUserPrompt } from './prompts';
import type { Note, NoteTemplate, Patient, SessionModifiers } from '@/types';

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

describe('buildModifierBlock', () => {
  const empty: SessionModifiers = { emphasis: [] };

  it('returns empty string when no modifiers are active', () => {
    expect(buildModifierBlock(empty)).toBe('');
  });

  it('includes tone block for narrative', () => {
    const result = buildModifierBlock({ emphasis: [], tone: 'narrative' });
    expect(result).toContain('# Tone & style');
    expect(result).toContain('flowing professional prose');
  });

  it('includes tone block for terse', () => {
    const result = buildModifierBlock({ emphasis: [], tone: 'terse' });
    expect(result).toContain('bullet-point shorthand');
    expect(result).toContain('PROM');
  });

  it('includes tone block for clinical', () => {
    const result = buildModifierBlock({ emphasis: [], tone: 'clinical' });
    expect(result).toContain('formal clinical documentation style');
    expect(result).toContain('anatomical');
  });

  it('includes emphasis block with active chips', () => {
    const result = buildModifierBlock({ emphasis: ['more_detail', 'patient_progress'] });
    expect(result).toContain('# Emphasis');
    expect(result).toContain('more clinical detail');
    expect(result).toContain('patient progress');
  });

  it('includes custom instruction when provided', () => {
    const result = buildModifierBlock({ emphasis: [], customInstruction: 'Focus on gait.' });
    expect(result).toContain('# Additional instruction');
    expect(result).toContain('Focus on gait.');
  });

  it('omits custom instruction when blank', () => {
    const result = buildModifierBlock({ emphasis: [], customInstruction: '   ' });
    expect(result).not.toContain('# Additional instruction');
  });

  it('combines tone + emphasis + custom in one block', () => {
    const result = buildModifierBlock({
      tone: 'terse',
      emphasis: ['functional_outcomes'],
      customInstruction: 'Mention home exercise compliance.',
    });
    expect(result).toContain('# Tone & style');
    expect(result).toContain('# Emphasis');
    expect(result).toContain('# Additional instruction');
  });
});

describe('buildUserPrompt', () => {
  it('includes a pseudonym patient ID and omits the real name', () => {
    const result = buildUserPrompt({
      template: baseTemplate,
      transcript: baseTranscript,
      patient: basePatient,
    });
    expect(result).toContain('Patient ID: PT-p1');
    expect(result).not.toContain('Alex');
    expect(result).not.toContain('Rivera');
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
