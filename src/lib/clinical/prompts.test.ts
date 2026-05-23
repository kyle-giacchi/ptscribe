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

const emptyModifiers: SessionModifiers = {
  clinicalDetail: [],
  codingBilling: [],
  beyondNote: [],
  customInstructions: [],
};

describe('buildModifierBlock', () => {
  it('returns empty string when no modifiers are active', () => {
    expect(buildModifierBlock(emptyModifiers)).toBe('');
  });

  it('includes Voice section for 1st_person', () => {
    const result = buildModifierBlock({ ...emptyModifiers, voice: '1st_person' });
    expect(result).toContain('# Voice');
    expect(result).toContain('first-person');
  });

  it('includes Voice section for 3rd_person', () => {
    const result = buildModifierBlock({ ...emptyModifiers, voice: '3rd_person' });
    expect(result).toContain('third-person voice');
  });

  it('includes Length section for concise', () => {
    const result = buildModifierBlock({ ...emptyModifiers, length: 'concise' });
    expect(result).toContain('# Length');
    expect(result).toContain('tight clinical prose');
  });

  it('includes Length section for detailed', () => {
    const result = buildModifierBlock({ ...emptyModifiers, length: 'detailed' });
    expect(result).toContain('full detail');
  });

  it('includes Language section for plain_language', () => {
    const result = buildModifierBlock({ ...emptyModifiers, language: 'plain_language' });
    expect(result).toContain('# Language');
    expect(result).toContain('7th-grade');
  });

  it('includes Clinical detail section with active items', () => {
    const result = buildModifierBlock({
      ...emptyModifiers,
      clinicalDetail: ['pertinent_negatives', 'include_ros'],
    });
    expect(result).toContain('# Clinical detail');
    expect(result).toContain('pertinent negatives');
    expect(result).toContain('Review of Systems');
  });

  it('includes Coding & billing section', () => {
    const result = buildModifierBlock({ ...emptyModifiers, codingBilling: ['icd10_suggestions'] });
    expect(result).toContain('# Coding & billing');
    expect(result).toContain('ICD-10');
  });

  it('includes Beyond the note section', () => {
    const result = buildModifierBlock({
      ...emptyModifiers,
      beyondNote: ['patient_education', 'suggested_orders'],
    });
    expect(result).toContain('# Beyond the note');
    expect(result).toContain('patient education');
    expect(result).toContain('suggested orders');
  });

  it('includes active custom instructions', () => {
    const result = buildModifierBlock({
      ...emptyModifiers,
      customInstructions: [
        { id: '1', text: 'Focus on gait.', active: true },
        { id: '2', text: 'Ignored rule.', active: false },
      ],
    });
    expect(result).toContain('# Custom instructions');
    expect(result).toContain('Focus on gait.');
    expect(result).not.toContain('Ignored rule.');
  });

  it('omits custom instructions when all inactive', () => {
    const result = buildModifierBlock({
      ...emptyModifiers,
      customInstructions: [{ id: '1', text: 'Skip me.', active: false }],
    });
    expect(result).not.toContain('# Custom instructions');
  });

  it('omits custom instruction when text is blank', () => {
    const result = buildModifierBlock({
      ...emptyModifiers,
      customInstructions: [{ id: '1', text: '   ', active: true }],
    });
    expect(result).not.toContain('# Custom instructions');
  });

  it('combines multiple sections in one block', () => {
    const result = buildModifierBlock({
      voice: '2nd_person',
      length: 'concise',
      language: 'medical_terminology',
      clinicalDetail: ['differential_diagnosis'],
      codingBilling: ['em_level'],
      beyondNote: ['transcript_timestamps'],
      customInstructions: [{ id: '1', text: 'Always note A1c.', active: true }],
    });
    expect(result).toContain('# Voice');
    expect(result).toContain('# Length');
    expect(result).toContain('# Language');
    expect(result).toContain('# Clinical detail');
    expect(result).toContain('# Coding & billing');
    expect(result).toContain('# Beyond the note');
    expect(result).toContain('# Custom instructions');
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
