import type { ID, Note, SessionModifiers } from '@/types';

/**
 * Staleness tracking for generated notes (CONTEXT.md §Note staleness).
 *
 * A note records the exact inputs it was generated from — the transcript text
 * (`generatedFromTranscript`), the `templateId`, and the `modifiers` snapshot.
 * The transcript is never frozen ("locked") in the UI; instead these pure
 * helpers compare the live inputs against the note's snapshot so the app can:
 *   - disable a no-op Regenerate (inputs unchanged), and
 *   - flag a note as stale and gate Finalize when an input has since diverged.
 *
 * Because the snapshot lives on the immutable note, the audit guarantee — a note
 * always reflects the transcript/template/modifiers that produced it — holds
 * without a separate lock state.
 */

/** The live generation inputs to compare against a note's snapshot. */
export interface NoteInputs {
  transcript: string;
  templateId?: ID;
  modifiers?: SessionModifiers;
}

type NoteSnapshot = Pick<Note, 'generatedFromTranscript' | 'templateId' | 'modifiers'>;

const EMPTY_MODIFIERS: SessionModifiers = {
  clinicalDetail: [],
  codingBilling: [],
  beyondNote: [],
  customInstructions: [],
};

/**
 * Order-independent canonical string for a modifier set, so that re-selecting
 * the same chips in a different order does not read as a change. Optional scalar
 * fields are normalized to `null` so an absent vs. unset field compares equal.
 */
function canonicalModifiers(m: SessionModifiers | undefined): string {
  const x = m ?? EMPTY_MODIFIERS;
  return JSON.stringify({
    voice: x.voice ?? null,
    length: x.length ?? null,
    language: x.language ?? null,
    clinicalDetail: [...x.clinicalDetail].sort(),
    codingBilling: [...x.codingBilling].sort(),
    beyondNote: [...x.beyondNote].sort(),
    customInstructions: [...x.customInstructions]
      .map((c) => ({ id: c.id, text: c.text, active: c.active }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

/**
 * True when a note exists and all generation inputs still match the snapshot it
 * was generated from. Returns false when there is no note (nothing to match).
 */
export function noteMatchesInputs(note: NoteSnapshot | undefined, current: NoteInputs): boolean {
  if (!note) return false;
  return (
    current.transcript === (note.generatedFromTranscript ?? '') &&
    (current.templateId ?? '') === (note.templateId ?? '') &&
    canonicalModifiers(current.modifiers) === canonicalModifiers(note.modifiers)
  );
}

/**
 * True when a note exists but a generation input has since diverged from its
 * snapshot — the note no longer reflects the current transcript/template/
 * modifiers. False when there is no note.
 */
export function isNoteStale(note: NoteSnapshot | undefined, current: NoteInputs): boolean {
  return !!note && !noteMatchesInputs(note, current);
}
