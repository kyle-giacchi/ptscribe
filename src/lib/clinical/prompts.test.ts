import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from './prompts';
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

describe('buildSystemPrompt', () => {
  const templateWithPrompt: NoteTemplate = {
    ...baseTemplate,
    systemPrompt: 'You are a physical therapy documentation assistant.\n\n## Subjective\n## Objective\n## Assessment\n## Plan',
  };

  it('appends the tone block after the base system prompt', () => {
    const result = buildSystemPrompt(templateWithPrompt, 'narrative');
    expect(result).toContain(templateWithPrompt.systemPrompt.trimEnd());
    expect(result).toContain('# Tone & style');
  });

  it('preserves the full base system prompt verbatim', () => {
    const result = buildSystemPrompt(templateWithPrompt, 'narrative');
    expect(result.startsWith(templateWithPrompt.systemPrompt.trimEnd())).toBe(true);
  });

  it('defaults to narrative tone when no toneStyle is supplied', () => {
    const result = buildSystemPrompt(templateWithPrompt);
    expect(result).toContain('flowing professional prose');
  });

  it('includes narrative tone instruction for narrative style', () => {
    const result = buildSystemPrompt(templateWithPrompt, 'narrative');
    expect(result).toContain('flowing professional prose');
  });

  it('includes bullet-point / abbreviation instruction for terse style', () => {
    const result = buildSystemPrompt(templateWithPrompt, 'terse');
    expect(result).toContain('bullet-point shorthand');
    expect(result).toContain('PROM');
  });

  it('includes anatomical / formal instruction for clinical style', () => {
    const result = buildSystemPrompt(templateWithPrompt, 'clinical');
    expect(result).toContain('formal clinical documentation style');
    expect(result).toContain('anatomical');
  });

  it('produces different output for each tone style', () => {
    const narrative = buildSystemPrompt(templateWithPrompt, 'narrative');
    const terse = buildSystemPrompt(templateWithPrompt, 'terse');
    const clinical = buildSystemPrompt(templateWithPrompt, 'clinical');
    expect(narrative).not.toBe(terse);
    expect(narrative).not.toBe(clinical);
    expect(terse).not.toBe(clinical);
  });

  it('strips trailing whitespace from the base prompt before appending', () => {
    const templateWithTrailing: NoteTemplate = {
      ...baseTemplate,
      systemPrompt: 'Base prompt.   \n  \n',
    };
    const result = buildSystemPrompt(templateWithTrailing, 'narrative');
    // The tone block must follow the trimmed base with a blank-line separator
    expect(result).toMatch(/Base prompt\.\s*\n\n# Tone & style/);
  });

  it('works with an empty system prompt on the template', () => {
    const result = buildSystemPrompt(baseTemplate, 'terse');
    expect(result).toContain('# Tone & style');
    expect(result).toContain('bullet-point shorthand');
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
