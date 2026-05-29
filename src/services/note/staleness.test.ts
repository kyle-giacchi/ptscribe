import { describe, it, expect } from 'vitest';
import { noteMatchesInputs, isNoteStale } from './staleness';
import type { Note, SessionModifiers } from '@/types';

// A note carries an immutable snapshot of the transcript / template / modifiers it
// was generated from (`generatedFromTranscript`, `templateId`, `modifiers`). These
// pure helpers compare the live generation inputs against that snapshot:
//   - noteMatchesInputs → true when a note exists and nothing has changed
//     (drives the Regenerate soft-gate: regenerating an unchanged note is a no-op).
//   - isNoteStale → true when a note exists but an input has since diverged
//     (drives the stale banner + the Finalize gate). It is the inverse, and is
//     false when no note exists (nothing to be stale).

const EMPTY: SessionModifiers = {
  clinicalDetail: [],
  codingBilling: [],
  beyondNote: [],
  customInstructions: [],
};

function note(over: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    sessionId: 's1',
    patientId: 'p1',
    format: 'soap',
    templateId: 'tpl-1',
    sections: [],
    finalized: false,
    createdAt: 0,
    updatedAt: 0,
    generatedFromTranscript: 'the visit transcript',
    modifiers: EMPTY,
    ...over,
  } as Note;
}

const baseInputs = {
  transcript: 'the visit transcript',
  templateId: 'tpl-1',
  modifiers: EMPTY,
};

describe('noteMatchesInputs', () => {
  it('returns false when there is no note', () => {
    expect(noteMatchesInputs(undefined, baseInputs)).toBe(false);
  });

  it('returns true when transcript, template, and modifiers all match the snapshot', () => {
    expect(noteMatchesInputs(note(), baseInputs)).toBe(true);
  });

  it('returns false when the transcript has changed', () => {
    expect(noteMatchesInputs(note(), { ...baseInputs, transcript: 'edited transcript' })).toBe(false);
  });

  it('returns false when the template has changed', () => {
    expect(noteMatchesInputs(note(), { ...baseInputs, templateId: 'tpl-2' })).toBe(false);
  });

  it('returns false when a modifier has changed', () => {
    expect(
      noteMatchesInputs(note(), {
        ...baseInputs,
        modifiers: { ...EMPTY, clinicalDetail: ['include_ros'] },
      }),
    ).toBe(false);
  });

  it('treats an undefined snapshot transcript as empty string', () => {
    expect(
      noteMatchesInputs(note({ generatedFromTranscript: undefined }), { ...baseInputs, transcript: '' }),
    ).toBe(true);
  });

  it('treats undefined modifiers on either side as the empty modifier set', () => {
    expect(noteMatchesInputs(note({ modifiers: undefined }), { ...baseInputs, modifiers: undefined })).toBe(
      true,
    );
    expect(noteMatchesInputs(note({ modifiers: undefined }), { ...baseInputs, modifiers: EMPTY })).toBe(true);
  });

  it('is insensitive to the selection order of multi-select modifiers', () => {
    const a: SessionModifiers = { ...EMPTY, clinicalDetail: ['include_ros', 'risk_scores'] };
    const b: SessionModifiers = { ...EMPTY, clinicalDetail: ['risk_scores', 'include_ros'] };
    expect(noteMatchesInputs(note({ modifiers: a }), { ...baseInputs, modifiers: b })).toBe(true);
  });
});

describe('isNoteStale', () => {
  it('is false when no note exists', () => {
    expect(isNoteStale(undefined, baseInputs)).toBe(false);
  });

  it('is false when inputs still match the snapshot', () => {
    expect(isNoteStale(note(), baseInputs)).toBe(false);
  });

  it('is true when an input has diverged from the snapshot', () => {
    expect(isNoteStale(note(), { ...baseInputs, transcript: 'edited' })).toBe(true);
  });
});
