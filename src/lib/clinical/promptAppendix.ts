// The fixed segments PTScribe appends to *every* template's system prompt at
// generation time (see services/ai/generate.ts). They are not part of the
// editable template — they are app-enforced guarantees. Extracted here so the
// Templates editor can show clinicians exactly what gets sent without
// duplicating (and risking drift from) the strings the generator actually uses.

// Appended to the system prompt when a diarized (Nova / T3) transcript is
// available. Only the cloud path (Nova-3) emits speaker labels, so this rule
// is added exclusively for T3 — it tells the model how to map labelled turns
// to note sections.
export const DIARIZATION_NOTE =
  '\n\n# Transcript speaker context\n' +
  'Speaker labels (e.g. "Speaker 0:", "Speaker 1:") in the transcript identify turns from a ' +
  "diarized recording. Treat the clinician's questions and observations as objective/intervention " +
  "content and the patient's reports as subjective content — infer roles from context.";

// Appended to the system prompt when no diarized transcript is available.
// Local Whisper (T2) and browser speech recognition (T1) capture a single
// merged audio stream with no speaker labels, so we explicitly signal that the
// transcript does not split up the different speakers in the room.
export const NO_DIARIZATION_NOTE =
  '\n\n# Transcript speaker context\n' +
  'This transcript was captured without speaker diarization, so it does not split up the ' +
  'different speakers in the room. The clinician and patient voices are merged into a single ' +
  'stream with no speaker labels — use clinical context to infer who is speaking rather than ' +
  'relying on speaker labels.';

// Always appended to the system prompt, for every template and every transcript
// tier. The generated note must capture clinical content (symptoms, findings,
// interventions, plan) WITHOUT echoing back direct personal identifiers — i.e.
// the output must be de-identified. This is a privacy hard rule, not a stylistic
// preference: the note is reviewed and stored on-device, and we never want
// identifying PII/PHI to be reproduced in the AI's output even if it appears in
// the transcript or patient context.
export const NO_PII_RULE =
  '\n\n# Privacy: never return personal identifiers (PII / PHI)\n' +
  'This is a strict, non-negotiable rule that overrides every other instruction. Even when the ' +
  'transcript or patient context contains personally identifying information, you MUST NOT copy, ' +
  'echo, paraphrase, or otherwise reproduce any direct personal identifiers in your output. The ' +
  'note must be de-identified.\n' +
  '- Never include names of the patient, clinician, family members, or any other individual. ' +
  'Refer to people generically — "the patient", "the clinician", "the patient\'s spouse", etc.\n' +
  '- Never include dates of birth, ages tied to a specific date, or exact calendar dates that ' +
  'could identify a visit. Use relative time only (e.g. "since the last visit", "3 weeks ago").\n' +
  '- Never include addresses, cities, ZIP codes, or any geographic detail more specific than is ' +
  'clinically necessary.\n' +
  '- Never include phone numbers, email addresses, fax numbers, or URLs.\n' +
  '- Never include Social Security numbers, medical record numbers (MRN), insurance or member ' +
  'IDs, account numbers, license/certificate numbers, device identifiers, or any other ID code.\n' +
  '- Never include employer names, school names, or other identifying institutions unless they ' +
  'are clinically essential (e.g. a work demand relevant to rehab) — and even then, omit the ' +
  'proper name.\n' +
  'Preserve the clinical substance (symptoms, measurements, interventions, assessment, plan); ' +
  'strip only the identifying details. When in doubt, leave the identifier out.';
