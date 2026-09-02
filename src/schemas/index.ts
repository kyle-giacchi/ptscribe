/**
 * Single source of truth for every persisted AppData shape. The TypeScript
 * domain types in `@/types` are `z.infer`red from the schemas below and
 * re-exported there, so a field is declared exactly once. Adding a domain field
 * is a 2-step ripple: add it here, then handle it in `defaultAppData()` /
 * a migration if existing saves need backfilling.
 */

import { z } from 'zod';
import { APP_DATA_VERSION, UNASSIGNED_PATIENT_ID } from '@/types';
import { BUILTIN_TEMPLATES } from '@/lib/clinical/templates';
import { BUILTIN_EXERCISES } from '@/lib/clinical/exercises';

// ─── Clinician ──────────────────────────────────────────────────────────────

export const ClinicianSchema = z.object({
  name: z.string(),
  credentials: z.string(), // e.g. "DPT, OCS"
  npi: z.string().optional(),
  practiceName: z.string().optional(),
  practiceAddress: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  signatureBlock: z.string().optional(),
  /**
   * Timestamp (ms) when the clinician acknowledged the HIPAA / data-handling
   * disclosure. Set during Setup; absence means the wizard hasn't completed.
   */
  acknowledgedDisclosureAt: z.number().int().optional(),
});
export type Clinician = z.infer<typeof ClinicianSchema>;

// ─── Patient ────────────────────────────────────────────────────────────────

export const SexSchema = z.enum(['F', 'M', 'X']);
export type Sex = z.infer<typeof SexSchema>;

export const PatientStatusSchema = z.enum(['active', 'discharged', 'on_hold']);
export type PatientStatus = z.infer<typeof PatientStatusSchema>;

export const PatientSchema = z.object({
  id: z.string().min(1),
  firstName: z.string(),
  lastName: z.string(),
  dob: z.number().int().optional(), // ms timestamp
  sex: SexSchema.optional(),
  mrn: z.string().optional(),
  primaryDiagnosis: z.string().optional(),
  icd10: z.string().optional(),
  referringProvider: z.string().optional(),
  notes: z.string().optional(),
  /** Avatar circle color as `#rrggbb`. Assigned at creation, editable. */
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional()
    .catch(undefined),
  status: PatientStatusSchema,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Patient = z.infer<typeof PatientSchema>;

// ─── Modifiers ──────────────────────────────────────────────────────────────

// Radio groups (single-select per group)
export const ModifierVoiceSchema = z.enum(['1st_person', '2nd_person', '3rd_person']);
export type ModifierVoice = z.infer<typeof ModifierVoiceSchema>;

export const ModifierLengthSchema = z.enum(['concise', 'balanced', 'detailed']);
export type ModifierLength = z.infer<typeof ModifierLengthSchema>;

export const ModifierLanguageSchema = z.enum([
  'medical_terminology',
  'plain_language',
  'spanish_output',
]);
export type ModifierLanguage = z.infer<typeof ModifierLanguageSchema>;

// Checkbox groups (multi-select)
export const ModifierClinicalDetailSchema = z.enum([
  'pertinent_negatives',
  'include_ros',
  'quote_verbatim',
  'differential_diagnosis',
  'risk_scores',
]);
export type ModifierClinicalDetail = z.infer<typeof ModifierClinicalDetailSchema>;

export const ModifierCodingBillingSchema = z.enum(['icd10_suggestions', 'em_level', 'hcc_flags']);
export type ModifierCodingBilling = z.infer<typeof ModifierCodingBillingSchema>;

export const ModifierBeyondNoteSchema = z.enum([
  'suggested_orders',
  'med_rec_check',
  'patient_education',
  'transcript_timestamps',
]);
export type ModifierBeyondNote = z.infer<typeof ModifierBeyondNoteSchema>;

export const CustomInstructionSchema = z.object({
  id: z.string().min(1),
  text: z.string().max(240),
  active: z.boolean(),
});
export type CustomInstruction = z.infer<typeof CustomInstructionSchema>;

export const SessionModifiersSchema = z.object({
  voice: ModifierVoiceSchema.optional(),
  length: ModifierLengthSchema.optional(),
  language: ModifierLanguageSchema.optional(),
  clinicalDetail: z.array(ModifierClinicalDetailSchema).default([]),
  codingBilling: z.array(ModifierCodingBillingSchema).default([]),
  beyondNote: z.array(ModifierBeyondNoteSchema).default([]),
  customInstructions: z.array(CustomInstructionSchema).default([]),
});
export type SessionModifiers = z.infer<typeof SessionModifiersSchema>;

// ─── Session ────────────────────────────────────────────────────────────────

export const SessionTypeSchema = z.enum(['evaluation', 'follow_up', 'progress', 'discharge']);
export type SessionType = z.infer<typeof SessionTypeSchema>;

export const SessionStatusSchema = z.enum([
  'draft',
  'recording',
  'transcribing',
  'generating',
  'ready',
  'finalized',
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const TranscriptTierSchema = z.enum(['t1', 't2', 't3', 'edited']);
export type TranscriptTier = z.infer<typeof TranscriptTierSchema>;

export const ClipStatusSchema = z.enum([
  'pending', // recording in flight; no consolidated Blob yet
  'ready', // audio saved, awaiting transcription
  'transcribing', // Whisper request in flight
  'transcribed', // transcript text populated
  'failed', // last transcription attempt failed
]);
export type ClipStatus = z.infer<typeof ClipStatusSchema>;

export const TranscriptChunkSchema = z.object({
  startSec: z.number().min(0), // seconds from clip start (real, not estimated)
  text: z.string(),
});
export type TranscriptChunk = z.infer<typeof TranscriptChunkSchema>;

/**
 * One discrete audio take inside a session. A session is a sequence of these.
 * `id` doubles as the AudioRepository key (both for the consolidated Blob in
 * `recordings` and for the per-chunk WAL rows in `recording_chunks`).
 */
export const SessionClipSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().min(0),
  durationSec: z.number().min(0),
  status: ClipStatusSchema,
  transcript: z.string().optional(), // active transcript — mirrors the active tier's text
  t1Transcript: z.string().optional(), // Tier 1 (Live Browser): Web Speech real-time capture during recording
  t2Transcript: z.string().optional(), // Tier 2 (Whisper Local): auto-pass result, frozen after first write
  t3Transcript: z.string().optional(), // Tier 3 (Nova AI): cloud result, written by explicit transcription action
  transcriptChunks: z.array(TranscriptChunkSchema).optional(), // real 2-min chunks from local Whisper; absent after cloud pass
  transcriptedAt: z.number().int().optional(),
  startOffsetSec: z.number().min(0).optional(),
  errorMessage: z.string().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type SessionClip = z.infer<typeof SessionClipSchema>;

/**
 * Diagnostic comparison of the JSON keys the model returned against the keys
 * the active template expects. Lets us explain a blank note precisely:
 * `matched: []` with a non-empty `returned` means a key mismatch, not an
 * empty-transcript result.
 */
export const GenerateKeyReportSchema = z.object({
  /** Section keys the template expects (`template.sections[*].key`). */
  expected: z.array(z.string()),
  /** Top-level keys present in the model's parsed JSON. */
  returned: z.array(z.string()),
  /** Expected keys the model actually returned. */
  matched: z.array(z.string()),
  /** Expected keys the model omitted. */
  missing: z.array(z.string()),
  /** Keys the model returned that the template does not use. */
  unexpected: z.array(z.string()),
  /** Matched keys whose value was blank or not a string. */
  emptyMatched: z.array(z.string()),
});
export type GenerateKeyReport = z.infer<typeof GenerateKeyReportSchema>;

/** Which AI call produced an {@link AiErrorEntry}. */
export const AiErrorCallSchema = z.enum([
  'generate',
  'transcribe-cloud',
  'transcribe-local',
  'pii',
  'model-fetch',
]);
export type AiErrorCall = z.infer<typeof AiErrorCallSchema>;

/**
 * Failure kind for an {@link AiErrorEntry}. The first five mirror the transport
 * `AiErrorKind` (services/ai/errors.ts); the rest are app-level outcomes that
 * look "successful" at the network layer but yield an unusable note.
 */
export const AiErrorEntryKindSchema = z.enum([
  'network',
  'rate_limit',
  'auth',
  'empty',
  'timeout',
  'parse', // 200 OK but the JSON could not be parsed
  'key_mismatch', // parsed, but returned keys don't match the template
  'blank', // parsed + keys matched, but every section came back empty
  // BYOK generation (ADR-0009/0010) — persisted so the error log explains a key/auth failure offline.
  'no_key',
  'key_rejected',
  'provider_limited',
  'signin_required',
  'service_unavailable',
  'demo_disabled',
  'unreachable', // self-hosted endpoint didn't answer (down / CORS / mixed content / private-network block)
  'model_missing', // self-hosted endpoint is up but doesn't serve the configured model
]);
export type AiErrorEntryKind = z.infer<typeof AiErrorEntryKindSchema>;

/**
 * One persisted AI-call failure. Transport failures store lean metadata only;
 * content failures (parse/key_mismatch/blank) additionally carry a bounded
 * `rawSnippet` and the `keyReport` so a blank note can be explained offline.
 */
export const AiErrorEntrySchema = z.object({
  id: z.string().min(1),
  ts: z.number().int(),
  call: AiErrorCallSchema,
  /** e.g. 'anthropic' | 'nova' | 'whisper-local' | 'r2' | 'huggingface'. */
  provider: z.string().optional(),
  kind: AiErrorEntryKindSchema,
  /** HTTP status, when the failure came from a fetch. */
  status: z.number().int().optional(),
  /** End-to-end duration of the failed call in ms. */
  latencyMs: z.number().min(0).optional(),
  /** Attempts made before giving up (retry-aware calls). */
  attempts: z.number().int().min(0).optional(),
  /** Short, non-content description (status text, error message). */
  detail: z.string().optional(),
  /** Content failures only: bounded slice of the raw response (~2k chars). */
  rawSnippet: z.string().optional(),
  /** Content failures on the generate path only: key-mapping diagnosis. */
  keyReport: GenerateKeyReportSchema.optional(),
});
export type AiErrorEntry = z.infer<typeof AiErrorEntrySchema>;

export const SessionSchema = z.object({
  id: z.string().min(1),
  patientId: z.string().min(1),
  type: SessionTypeSchema,
  date: z.number().int(),
  durationMin: z.number().min(0).optional(),
  status: SessionStatusSchema,
  clips: z.array(SessionClipSchema),
  transcript: z.string().optional(), // active transcript — mirrors the active tier's text
  t1Transcript: z.string().optional(), // Tier 1 (Live Browser): merged per-clip Web Speech live transcripts
  t2Transcript: z.string().optional(), // Tier 2 (Whisper Local): merged result, frozen after auto-pass
  t3Transcript: z.string().optional(), // Tier 3 (Nova AI): merged cloud result, written on explicit transcription
  editedTranscript: z.string().optional(), // Edited: user-modified transcript text
  activeTranscriptTier: TranscriptTierSchema.optional(),
  noteId: z.string().optional(),
  templateId: z.string().optional(),
  modifiers: SessionModifiersSchema.optional(),
  /**
   * Capped ring buffer (~20, newest last) of recent AI-call failures for this
   * session — generation, transcription, PII, and model-fetch. Persisted so a
   * silent/transient failure (e.g. a blank note from a key mismatch) can be
   * diagnosed from the Debug Menu after the fact, surviving reload. Encrypted
   * at rest with the rest of the Session.
   */
  aiErrors: z.array(AiErrorEntrySchema).optional(),
  /**
   * Lifetime count of cloud (Nova) transcription runs for this session. Capped at
   * MAX_TRANSCRIBES_PER_SESSION. Persisted so the cap survives reload, Revert, and
   * Unlock — never reset by any client action. Absent is treated as 0 at read time.
   * See CONTEXT.md §Cloud-transcription cap.
   */
  cloudTranscribeCount: z.number().int().min(0).optional(),
  /**
   * Lifetime count of Anthropic note-generation runs for this session. Capped at
   * MAX_GENERATES_PER_SESSION. Persisted so the cap survives reload, Revert, and
   * Unlock — never reset by any client action. Absent is treated as 0 at read time.
   */
  generateCount: z.number().int().min(0).optional(),
  /**
   * ms timestamp the session was finalized. Anchors finalize-gated audio
   * retention (CONTEXT.md §Audio retention). Absent on non-finalized sessions;
   * legacy finalized sessions are backfilled to `updatedAt` at migration time.
   */
  finalizedAt: z.number().int().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Session = z.infer<typeof SessionSchema>;

// ─── Note ───────────────────────────────────────────────────────────────────

export const NoteFormatSchema = z.enum(['soap', 'evaluation', 'progress', 'discharge', 'custom']);
export type NoteFormat = z.infer<typeof NoteFormatSchema>;

export const NoteSectionSchema = z.object({
  key: z.string(),
  label: z.string(),
  body: z.string(),
});
export type NoteSection = z.infer<typeof NoteSectionSchema>;

// Declared here rather than beside PlanOfCareSchema because NoteSchema below
// references NoteActivitiesSchema, and schemas are plain values evaluated in
// source order.
export const PrescriptionSchema = z.object({
  id: z.string().min(1),
  exerciseId: z.string().min(1),
  dosage: z.string(),
  notes: z.string().optional(),
});
export type Prescription = z.infer<typeof PrescriptionSchema>;

/**
 * One logged exercise on a Note. Extends {@link Prescription} so write-back to
 * PlanOfCare is a field-for-field map with no translation layer.
 */
export const ActivityEntrySchema = PrescriptionSchema.extend({
  /**
   * Denormalized at add-time. Built-in exercises are delete-protected, but custom
   * ones are not — without this snapshot, deleting a custom exercise would corrupt
   * the exercise name in every finalized note that referenced it.
   */
  exerciseName: z.string(),
});
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;

/**
 * Per-visit activity log (CONTEXT.md workflow: documentation artifact only).
 * Deliberately NOT part of note staleness — see `src/services/note/staleness.ts`.
 */
export const NoteActivitiesSchema = z.object({
  /** Exercises the patient performed in clinic this visit. */
  performed: z.array(ActivityEntrySchema),
  /** Take-home program assigned this visit. */
  home: z.array(ActivityEntrySchema),
});
export type NoteActivities = z.infer<typeof NoteActivitiesSchema>;

export const NoteSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  patientId: z.string().min(1),
  format: NoteFormatSchema,
  templateId: z.string().optional(),
  sections: z.array(NoteSectionSchema),
  finalized: z.boolean(),
  finalizedAt: z.number().int().optional(),
  /**
   * Timestamp (ms) of the first save after a finalized note was unlocked and
   * edited. Set on the first qualifying save; never overwritten after that.
   */
  editedAfterFinalizedAt: z.number().int().optional(),
  /**
   * Running count of save operations that occurred after finalization.
   * Incremented each time `updateNote` is called while `finalized` was true
   * at the time of unlock.
   */
  editedAfterFinalizedCount: z.number().int().optional(),
  modifiers: SessionModifiersSchema.optional(),
  generatedFromTranscript: z.string().optional(),
  /**
   * Per-visit exercise log. Never sent to the AI, never part of staleness, and
   * never written into `sections`. Survives regeneration because generation
   * patches only sections/templateId/format/modifiers/generatedFromTranscript.
   */
  activities: NoteActivitiesSchema.optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Note = z.infer<typeof NoteSchema>;

// ─── Template ───────────────────────────────────────────────────────────────

export const NoteTemplateSectionSchema = z.object({
  key: z.string(),
  label: z.string(),
  promptHint: z.string().optional(),
  /** When true, NotePanel blocks finalize until this section has a non-empty body. */
  required: z.boolean().optional(),
});
export type NoteTemplateSection = z.infer<typeof NoteTemplateSectionSchema>;

export const NoteTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  format: NoteFormatSchema,
  sections: z.array(NoteTemplateSectionSchema),
  systemPrompt: z.string(),
  builtin: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type NoteTemplate = z.infer<typeof NoteTemplateSchema>;

// ─── Exercise ───────────────────────────────────────────────────────────────

export const BodyRegionSchema = z.enum([
  'cervical',
  'thoracic',
  'lumbar',
  'shoulder',
  'elbow',
  'wrist_hand',
  'hip',
  'knee',
  'ankle_foot',
  'core',
  'gait_balance',
  'other',
]);
export type BodyRegion = z.infer<typeof BodyRegionSchema>;

export const ExerciseCategorySchema = z.enum([
  'strength',
  'mobility',
  'stability',
  'cardio',
  'neuro',
  'manual_therapy',
]);
export type ExerciseCategory = z.infer<typeof ExerciseCategorySchema>;

export const ExerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  region: BodyRegionSchema,
  category: ExerciseCategorySchema,
  instructions: z.string(),
  defaultDosage: z.string().optional(),
  cues: z.string().optional(),
  videoUrl: z.string().optional(),
  builtin: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Exercise = z.infer<typeof ExerciseSchema>;

// ─── Plan of Care ───────────────────────────────────────────────────────────

export const PlanGoalSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  targetDate: z.number().int().optional(),
  met: z.boolean(),
});
export type PlanGoal = z.infer<typeof PlanGoalSchema>;

export const PlanOfCareSchema = z.object({
  id: z.string().min(1),
  patientId: z.string().min(1),
  startDate: z.number().int(),
  expectedDischargeDate: z.number().int().optional(),
  goals: z.array(PlanGoalSchema),
  prescriptions: z.array(PrescriptionSchema),
  active: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type PlanOfCare = z.infer<typeof PlanOfCareSchema>;

// ─── Objective measures ─────────────────────────────────────────────────────

export const SideSchema = z.enum(['left', 'right']);
export type Side = z.infer<typeof SideSchema>;

/**
 * One recorded data point. Patient-owned rather than visit-owned: measures are
 * routinely taken outside a documented visit, and every useful view of them
 * (trend, baseline vs latest) is per-patient. `sessionId` is a back-link when
 * the value was captured during a visit.
 */
export const MeasurementSchema = z.object({
  id: z.string().min(1),
  patientId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  /** References `MeasureDef.id`. Free string so a retired catalog entry still renders. */
  measureId: z.string().min(1),
  side: SideSchema.optional(),
  value: z.number(),
  takenAt: z.number().int(),
  notes: z.string().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Measurement = z.infer<typeof MeasurementSchema>;

// ─── Settings ───────────────────────────────────────────────────────────────

export const TranscriptionProviderSchema = z.enum(['cloudflare', 'webspeech', 'local', 'none']);
export type TranscriptionProvider = z.infer<typeof TranscriptionProviderSchema>;

/**
 * `local` (loopback server on the clinician's machine) and `network` (clinic-hosted
 * server on the LAN/VPN) are *self-hosted*: the browser calls them directly, with no
 * Worker in the path and no BYOK key on our side. See ADR-0011.
 */
export const GenerationProviderSchema = z.enum([
  'anthropic',
  'openai',
  'google',
  'local',
  'network',
  'none',
]);
export type GenerationProvider = z.infer<typeof GenerationProviderSchema>;

export const CloudGenerationProviderSchema = z.enum(['anthropic', 'openai', 'google']);
export const SelfHostedProviderSchema = z.enum(['local', 'network']);

/** An OpenAI-compatible server the browser talks to directly (Ollama, LM Studio, vLLM…). */
export const SelfHostedEndpointSchema = z.object({
  /** Origin + optional path prefix, no trailing `/v1`. `http://` only for loopback. */
  baseUrl: z.string(),
  model: z.string(),
  /** Optional bearer token for the user's own server. Vault-encrypted with the rest of AppData. */
  apiKey: z.string().optional(),
});
export type SelfHostedEndpoint = z.infer<typeof SelfHostedEndpointSchema>;

export const AISettingsSchema = z.object({
  transcription: z.object({
    provider: TranscriptionProviderSchema,
    model: z.string(), // e.g. '@cf/openai/whisper-large-v3-turbo'
  }),
  generation: z.object({
    provider: GenerationProviderSchema,
    model: z.string(), // e.g. 'claude-sonnet-4-6'
    // Self-hosted endpoints (ADR-0011) — absent until the user configures one, and
    // partial: configuring `local` must not require also configuring `network`.
    endpoints: z.partialRecord(SelfHostedProviderSchema, SelfHostedEndpointSchema).optional(),
    /** Cloud provider offered as a fallback when a self-hosted call fails.
     *  Never used automatically — the user has to accept it in the dialog. */
    cloudFallback: CloudGenerationProviderSchema.optional(),
  }),
});
export type AISettings = z.infer<typeof AISettingsSchema>;

export const SilenceSensitivitySchema = z.enum(['low', 'medium', 'high']);
export type SilenceSensitivity = z.infer<typeof SilenceSensitivitySchema>;

export const SilenceDetectionSettingsSchema = z.object({
  enabled: z.boolean(),
  sensitivity: SilenceSensitivitySchema,
  padMs: z.number().int().min(0).max(2000),
});
export type SilenceDetectionSettings = z.infer<typeof SilenceDetectionSettingsSchema>;

export const SpeedFactorSchema = z.union([z.literal(1.25), z.literal(1.5), z.literal(1.75)]);
export type SpeedFactor = z.infer<typeof SpeedFactorSchema>;

export const SpeedUpSettingsSchema = z.object({
  enabled: z.boolean(),
  speed: SpeedFactorSchema,
});
export type SpeedUpSettings = z.infer<typeof SpeedUpSettingsSchema>;

export const AudioSettingsSchema = z.object({
  silenceDetection: SilenceDetectionSettingsSchema,
  speedUp: SpeedUpSettingsSchema,
  /**
   * `deviceId` of the microphone chosen in the AudioCheck pre-flight. Passed to
   * `getUserMedia` as `{ deviceId: { ideal } }` so a real recording reuses it,
   * falling back to the system default if the device is gone. Undefined = default
   * device. Device IDs are origin-scoped and rotate when permissions reset.
   */
  inputDeviceId: z.string().optional(),
});
export type AudioSettings = z.infer<typeof AudioSettingsSchema>;

export const SecuritySettingsSchema = z.object({
  /**
   * Minutes of user inactivity before the vault auto-locks. `0` disables
   * auto-lock; default `10`.
   */
  idleLockMinutes: z.number().int().min(0).max(120),
});
export type SecuritySettings = z.infer<typeof SecuritySettingsSchema>;

export const SessionWorkflowSettingsSchema = z.object({
  /**
   * When true, "Stop & finish" chains stop → transcribe → generate → copy in one
   * tap. When false, the user advances each step manually. Default true.
   */
  autoFinish: z.boolean(),
  /**
   * When true, the browser Web Speech API runs alongside Whisper during recording,
   * writing t1Transcript from cloud captions. Off by default — Whisper VAD segments
   * are the default T1 source.
   */
  webSpeechEnabled: z.boolean(),
  /**
   * On-device model used for PII scrubbing. 'openai/privacy-filter' requires ONNX
   * files pre-seeded to R2 (see scripts/convert-privacy-filter.py). 'Xenova/bert-base-NER'
   * has ONNX exports on HuggingFace and works without R2 setup. Default: openai/privacy-filter.
   */
  piiModel: z.enum(['openai/privacy-filter', 'Xenova/bert-base-NER']).optional(),
  /**
   * When true, skip the "transcript leaves device" confirmation that appears
   * before Generate / Regenerate sends the transcript to Anthropic. Toggled via
   * a "Don't show this again" checkbox in the dialog, restorable from User
   * Settings → Notes & Templates. Default false.
   */
  phiConfirmDismissed: z.boolean().default(false),
});
export type SessionWorkflowSettings = z.infer<typeof SessionWorkflowSettingsSchema>;

/**
 * Soft + hard caps on how long a single recording can run before the recorder
 * nudges the clinician to split, then auto-stops. Defends Marcus's
 * cost-predictability and "lunch-left-recording" failure modes.
 */
export const RecordingLimitsSettingsSchema = z.object({
  /** Show a non-blocking "split this?" banner once duration passes this many minutes. Default 75. */
  softWarnAtMinutes: z.number().int().min(15).max(240),
  /** Auto-stop the recorder when duration crosses this many minutes. Default 90. */
  maxMinutes: z.number().int().min(30).max(240),
  /** When the mic input has been silent for this many continuous minutes, surface an idle-stop prompt. `0` disables. Default 10. */
  idleAutoStopMinutes: z.number().int().min(0).max(60),
});
export type RecordingLimitsSettings = z.infer<typeof RecordingLimitsSettingsSchema>;

/**
 * Org-wide documentation policy. The `activeTemplateId` makes one template the
 * organization default — NewSession and the generator use it unless the
 * clinician explicitly picks another.
 */
export const OrgPolicySettingsSchema = z.object({
  activeTemplateId: z.string().optional(),
});
export type OrgPolicySettings = z.infer<typeof OrgPolicySettingsSchema>;

export const FirstRunRoleSchema = z.enum(['owner', 'clinician']);
export type FirstRunRole = z.infer<typeof FirstRunRoleSchema>;

/**
 * State captured during the first launch fork. `role` distinguishes the
 * owner-set-up-the-team flow from the clinician-just-record flow.
 * `disclosureVersion` matches `DISCLOSURE_VERSION` at the time the user
 * acknowledged the disclosure — bump the constant to re-prompt.
 * `onboardingUrlConsumed` is set true after `?role=…&clinic=…` URL params have
 * been read once so refreshes don't re-pre-fill.
 */
export const FirstRunStateSchema = z.object({
  role: FirstRunRoleSchema.optional(),
  onboardingDoneAt: z.number().int().optional(),
  disclosureVersion: z.number().int().optional(),
  onboardingUrlConsumed: z.boolean().optional(),
  /**
   * Set once the "Checking your setup" pre-flight gate has been completed (demo
   * first-run). Presence skips the gate on subsequent demo entries.
   */
  setupCheckDoneAt: z.number().int().optional(),
});
export type FirstRunState = z.infer<typeof FirstRunStateSchema>;

export const DensityModeSchema = z.enum(['cozy', 'compact']);
export type DensityMode = z.infer<typeof DensityModeSchema>;

export const ThemeModeSchema = z.enum(['system', 'light', 'dark']);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

export const SettingsSchema = z.object({
  ai: AISettingsSchema,
  audio: AudioSettingsSchema,
  security: SecuritySettingsSchema,
  session: SessionWorkflowSettingsSchema,
  recordingLimits: RecordingLimitsSettingsSchema,
  orgPolicy: OrgPolicySettingsSchema,
  firstRun: FirstRunStateSchema,
  ui: z.object({
    sidebarCollapsed: z.boolean(),
    densityMode: DensityModeSchema,
    theme: ThemeModeSchema,
    /** IANA timezone string (e.g. 'America/New_York'). Undefined = browser default. */
    timezone: z.string().optional(),
  }),
  retention: z.object({
    autoDeleteAudioAfterDays: z.number().int().positive().optional(),
  }),
});
export type Settings = z.infer<typeof SettingsSchema>;

// ─── AppData root ───────────────────────────────────────────────────────────

export const AppDataSchema = z.object({
  version: z.literal(APP_DATA_VERSION),
  lastModified: z.number().int(),
  tenantId: z.string(),
  clinician: ClinicianSchema,
  patients: z.array(PatientSchema),
  sessions: z.array(SessionSchema),
  notes: z.array(NoteSchema),
  templates: z.array(NoteTemplateSchema),
  exercises: z.array(ExerciseSchema),
  plans: z.array(PlanOfCareSchema),
  // `.default([])` rather than a migration step: AppData saved before objective
  // measures existed parses clean and gains an empty slice. `migrate()` has no
  // ladder (it asserts version === 1 and quarantines anything else), so an
  // additive optional field is the only backward-compatible way to grow AppData.
  measurements: z.array(MeasurementSchema).default([]),
  settings: SettingsSchema,
});
export type AppData = z.infer<typeof AppDataSchema>;

export function defaultAppData(): AppData {
  const now = Date.now();
  const templates: NoteTemplate[] = BUILTIN_TEMPLATES.map((t) => ({
    ...t,
    id: crypto.randomUUID(),
    builtin: true,
    createdAt: now,
    updatedAt: now,
  }));
  const exercises: Exercise[] = BUILTIN_EXERCISES.map((e) => ({
    ...e,
    id: crypto.randomUUID(),
    builtin: true,
    createdAt: now,
    updatedAt: now,
  }));
  const unassignedPatient: Patient = {
    id: UNASSIGNED_PATIENT_ID,
    firstName: 'Unassigned',
    lastName: '',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  return {
    version: APP_DATA_VERSION,
    lastModified: now,
    tenantId: 'local',
    clinician: { name: '', credentials: '' },
    patients: [unassignedPatient],
    sessions: [],
    notes: [],
    templates,
    exercises,
    plans: [],
    measurements: [],
    settings: {
      ai: {
        transcription: { provider: 'cloudflare', model: '@cf/deepgram/nova-3' },
        generation: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      },
      audio: {
        silenceDetection: { enabled: true, sensitivity: 'medium', padMs: 400 },
        speedUp: { enabled: true, speed: 1.25 },
      },
      security: { idleLockMinutes: 10 },
      session: { autoFinish: false, webSpeechEnabled: false, phiConfirmDismissed: false },
      recordingLimits: {
        softWarnAtMinutes: 75,
        maxMinutes: 90,
        idleAutoStopMinutes: 10,
      },
      orgPolicy: {},
      firstRun: {},
      ui: { sidebarCollapsed: false, densityMode: 'cozy', theme: 'light' },
      retention: {},
    },
  };
}
