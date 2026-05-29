import type {
  NoteTemplate,
  Patient,
  Note,
  SessionType,
  SessionModifiers,
  ModifierVoice,
  ModifierLength,
  ModifierLanguage,
  ModifierClinicalDetail,
  ModifierCodingBilling,
  ModifierBeyondNote,
} from '@/types';

export interface BuildPromptArgs {
  template: NoteTemplate;
  transcript: string;
  patient: Patient;
  priorNote?: Note;
  sessionType?: SessionType;
  regenerationDraft?: Note;
  regenerationFeedback?: string;
}

const VOICE_INSTRUCTIONS: Record<ModifierVoice, string> = {
  '1st_person':
    'Write the note in first-person voice ("I assessed…", "I observed…", "I instructed the patient to…").',
  '2nd_person':
    'Write the note in second-person voice directed at the patient ("You reported…", "Your assessment showed…", "You demonstrated…").',
  '3rd_person':
    'Write the note in third-person voice ("Patient reports…", "The patient demonstrated…"). This is the standard clinical documentation style.',
};

const LENGTH_INSTRUCTIONS: Record<ModifierLength, string> = {
  concise:
    'Write in tight clinical prose. Prefer phrases over full sentences where unambiguous. Omit preamble and filler.',
  balanced:
    'Write at standard clinical note length. Full sentences where clarity requires it; otherwise concise.',
  detailed:
    'Write in full detail. HPI in complete narrative sentences. Document exam findings system by system. Do not abbreviate observations.',
};

const LANGUAGE_INSTRUCTIONS: Record<ModifierLanguage, string> = {
  medical_terminology:
    'Use precise medical and anatomical terminology throughout. Use ICD-10-friendly phrasing.',
  plain_language:
    'Write at approximately a 7th-grade reading level. Spell out abbreviations. Avoid jargon.',
  spanish_output:
    'Write the Plan section and any patient-facing summary in Spanish. Keep all other clinical documentation sections in English.',
};

const CLINICAL_DETAIL_INSTRUCTIONS: Record<ModifierClinicalDetail, string> = {
  pertinent_negatives: 'Include pertinent negatives ("Denies…") for each system reviewed.',
  include_ros: 'Include a Review of Systems (ROS) section in the note.',
  quote_verbatim: 'Preserve key patient phrases verbatim in the HPI, in quotation marks.',
  differential_diagnosis:
    'Append a differential diagnosis list for any new or unresolved problems.',
  risk_scores:
    'Calculate and include relevant risk scores (e.g., ASCVD, CHA₂DS₂-VASc) when the transcript supplies sufficient data.',
};

const CODING_BILLING_INSTRUCTIONS: Record<ModifierCodingBilling, string> = {
  icd10_suggestions: 'Include inline ICD-10 code hints in the Assessment section.',
  em_level:
    'Recommend an E/M level (e.g., 99213 or 99214) based on complexity, with a brief rationale.',
  hcc_flags: 'Flag chronic conditions relevant for HCC risk adjustment.',
};

const BEYOND_NOTE_INSTRUCTIONS: Record<ModifierBeyondNote, string> = {
  suggested_orders:
    'Append a suggested orders section (labs, imaging, referrals) based on the Plan.',
  med_rec_check:
    'Flag potential drug interactions, dosing concerns, or medication gaps based on the transcript.',
  patient_education: 'Append a patient education paragraph in plain language after the Plan.',
  transcript_timestamps:
    'Include inline [mm:ss] timestamp references from the transcript where relevant.',
};

export function buildModifierBlock(modifiers: SessionModifiers): string {
  const lines: string[] = [];

  if (modifiers.voice) {
    lines.push(`# Voice\n${VOICE_INSTRUCTIONS[modifiers.voice]}`);
  }
  if (modifiers.length) {
    lines.push(`# Length\n${LENGTH_INSTRUCTIONS[modifiers.length]}`);
  }
  if (modifiers.language) {
    lines.push(`# Language\n${LANGUAGE_INSTRUCTIONS[modifiers.language]}`);
  }

  if (modifiers.clinicalDetail.length > 0) {
    const items = modifiers.clinicalDetail.map((d) => `- ${CLINICAL_DETAIL_INSTRUCTIONS[d]}`);
    lines.push(`# Clinical detail\n${items.join('\n')}`);
  }

  if (modifiers.codingBilling.length > 0) {
    const items = modifiers.codingBilling.map((d) => `- ${CODING_BILLING_INSTRUCTIONS[d]}`);
    lines.push(`# Coding & billing\n${items.join('\n')}`);
  }

  if (modifiers.beyondNote.length > 0) {
    const items = modifiers.beyondNote.map((d) => `- ${BEYOND_NOTE_INSTRUCTIONS[d]}`);
    lines.push(`# Beyond the note\n${items.join('\n')}`);
  }

  const activeCustom = modifiers.customInstructions.filter((c) => c.active && c.text.trim());
  if (activeCustom.length > 0) {
    const items = activeCustom.map((c) => `- ${c.text.trim()}`);
    lines.push(`# Custom instructions\n${items.join('\n')}`);
  }

  return lines.join('\n\n');
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
  regenerationDraft,
  regenerationFeedback,
}: BuildPromptArgs): string {
  const lines: string[] = [];

  lines.push('# Patient context');
  // Send a pseudonym ID rather than the real name to limit PHI transmitted to Anthropic (A9).
  // For the same reason we withhold coded/free-text identifiers: name and MRN are never sent,
  // and neither is the ICD-10 code nor the free-text patient notes. Only the pseudonym, age,
  // sex, and the clinician-authored primaryDiagnosis label leave the device.
  lines.push(`Patient ID: PT-${patient.id.slice(0, 8)}`);
  if (patient.dob) {
    const ageYears = Math.floor((Date.now() - patient.dob) / (365.25 * 24 * 3_600_000));
    lines.push(`Age: ${ageYears}`);
  }
  if (patient.sex) lines.push(`Sex: ${patient.sex}`);
  if (patient.primaryDiagnosis) lines.push(`Primary diagnosis: ${patient.primaryDiagnosis}`);
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

  if (regenerationDraft) {
    lines.push('');
    lines.push('# Previously generated note');
    for (const section of regenerationDraft.sections) {
      lines.push(`## ${section.label}`);
      lines.push(section.body || '(empty)');
    }
  }

  if (regenerationFeedback?.trim()) {
    lines.push('');
    lines.push('# What to improve');
    lines.push(regenerationFeedback.trim());
  }

  lines.push('');
  lines.push("# Today's session transcript");
  lines.push(transcript || '(no transcript provided)');

  return lines.join('\n');
}
