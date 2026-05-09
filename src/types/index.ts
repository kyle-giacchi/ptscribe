export type ID = string;

export const APP_DATA_VERSION = 13;
export type AppDataVersion = typeof APP_DATA_VERSION;

/**
 * Disclosure copy version. Bump when the HIPAA / data-handling text changes
 * meaningfully so the user is re-prompted to acknowledge the new wording.
 */
export const DISCLOSURE_VERSION = 1;

// ─── Clinician ──────────────────────────────────────────────────────────────

export interface Clinician {
  name: string;
  credentials: string; // e.g. "DPT, OCS"
  npi?: string;
  practiceName?: string;
  practiceAddress?: string;
  phone?: string;
  email?: string;
  signatureBlock?: string;
  /**
   * Timestamp (ms) when the clinician acknowledged the HIPAA / data-handling
   * disclosure. Set during Setup; absence means the wizard hasn't completed.
   */
  acknowledgedDisclosureAt?: number;
}

// ─── Patient ────────────────────────────────────────────────────────────────

export type Sex = 'F' | 'M' | 'X';
export type PatientStatus = 'active' | 'discharged' | 'on_hold';

export interface Patient {
  id: ID;
  firstName: string;
  lastName: string;
  dob?: number; // ms timestamp
  sex?: Sex;
  mrn?: string;
  primaryDiagnosis?: string;
  icd10?: string;
  referringProvider?: string;
  notes?: string;
  status: PatientStatus;
  createdAt: number;
  updatedAt: number;
}

// ─── Session ────────────────────────────────────────────────────────────────

export type SessionType = 'evaluation' | 'follow_up' | 'progress' | 'discharge';
export type SessionStatus =
  | 'draft'
  | 'recording'
  | 'transcribing'
  | 'generating'
  | 'ready'
  | 'finalized';
export type TranscriptSource = 'whisper' | 'webspeech' | 'manual';

/**
 * One discrete audio take inside a session. A session is a sequence of these.
 * `id` doubles as the AudioRepository key (both for the consolidated Blob in
 * `recordings` and for the per-chunk WAL rows in `recording_chunks`).
 */
export type ClipStatus =
  | 'pending' // recording in flight; no consolidated Blob yet
  | 'ready' // audio saved, awaiting transcription
  | 'transcribing' // Whisper request in flight
  | 'transcribed' // transcript text populated
  | 'failed'; // last transcription attempt failed

export interface SessionClip {
  id: ID;
  index: number;
  durationSec: number;
  status: ClipStatus;
  transcript?: string;
  liveTranscript?: string;
  localTranscript?: string;
  transcriptedAt?: number;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  id: ID;
  patientId: ID;
  type: SessionType;
  date: number;
  durationMin?: number;
  status: SessionStatus;
  clips: SessionClip[];
  transcript?: string;
  liveTranscript?: string;
  transcriptSource?: TranscriptSource;
  noteId?: ID;
  templateId?: ID;
  createdAt: number;
  updatedAt: number;
}

// ─── Note ───────────────────────────────────────────────────────────────────

export type NoteFormat = 'soap' | 'evaluation' | 'progress' | 'discharge' | 'custom';

export interface NoteSection {
  key: string;
  label: string;
  body: string;
}

export interface Note {
  id: ID;
  sessionId: ID;
  patientId: ID;
  format: NoteFormat;
  templateId?: ID;
  sections: NoteSection[];
  finalized: boolean;
  finalizedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Template ───────────────────────────────────────────────────────────────

export interface NoteTemplateSection {
  key: string;
  label: string;
  promptHint?: string;
  /** When true, NotePanel blocks finalize until this section has a non-empty body. */
  required?: boolean;
}

export interface NoteTemplate {
  id: ID;
  name: string;
  format: NoteFormat;
  sections: NoteTemplateSection[];
  systemPrompt: string;
  builtin: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── Exercise ───────────────────────────────────────────────────────────────

export type BodyRegion =
  | 'cervical'
  | 'thoracic'
  | 'lumbar'
  | 'shoulder'
  | 'elbow'
  | 'wrist_hand'
  | 'hip'
  | 'knee'
  | 'ankle_foot'
  | 'core'
  | 'gait_balance'
  | 'other';

export type ExerciseCategory =
  | 'strength'
  | 'mobility'
  | 'stability'
  | 'cardio'
  | 'neuro'
  | 'manual_therapy';

export const BODY_REGIONS: BodyRegion[] = [
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
];

export const EXERCISE_CATEGORIES: ExerciseCategory[] = [
  'strength',
  'mobility',
  'stability',
  'cardio',
  'neuro',
  'manual_therapy',
];

export const REGION_LABEL: Record<BodyRegion, string> = {
  cervical: 'Cervical',
  thoracic: 'Thoracic',
  lumbar: 'Lumbar',
  shoulder: 'Shoulder',
  elbow: 'Elbow',
  wrist_hand: 'Wrist / Hand',
  hip: 'Hip',
  knee: 'Knee',
  ankle_foot: 'Ankle / Foot',
  core: 'Core',
  gait_balance: 'Gait & Balance',
  other: 'Other',
};

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  strength: 'Strength',
  mobility: 'Mobility',
  stability: 'Stability',
  cardio: 'Cardio',
  neuro: 'Neuro re-ed',
  manual_therapy: 'Manual therapy',
};

export interface Exercise {
  id: ID;
  name: string;
  region: BodyRegion;
  category: ExerciseCategory;
  instructions: string;
  defaultDosage?: string;
  cues?: string;
  videoUrl?: string;
  builtin: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── Plan of Care ───────────────────────────────────────────────────────────

export interface PlanGoal {
  id: ID;
  text: string;
  targetDate?: number;
  met: boolean;
}

export interface Prescription {
  id: ID;
  exerciseId: ID;
  dosage: string;
  notes?: string;
}

export interface PlanOfCare {
  id: ID;
  patientId: ID;
  startDate: number;
  expectedDischargeDate?: number;
  goals: PlanGoal[];
  prescriptions: Prescription[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── Settings ───────────────────────────────────────────────────────────────

export type TranscriptionProvider = 'cloudflare' | 'webspeech' | 'local' | 'none';
export type GenerationProvider = 'anthropic' | 'none';
export type DensityMode = 'cozy' | 'compact';

export interface AISettings {
  transcription: {
    provider: TranscriptionProvider;
    model: string; // e.g. '@cf/openai/whisper-large-v3-turbo'
  };
  generation: {
    provider: GenerationProvider;
    model: string; // e.g. 'claude-sonnet-4-6'
  };
}

export type SilenceSensitivity = 'low' | 'medium' | 'high';

export interface SilenceDetectionSettings {
  enabled: boolean;
  sensitivity: SilenceSensitivity;
  padMs: number;
}

export const SUPPORTED_SPEEDS = [1.25, 1.5, 1.75] as const;
export type SpeedFactor = (typeof SUPPORTED_SPEEDS)[number];

export interface SpeedUpSettings {
  enabled: boolean;
  speed: SpeedFactor;
}

export interface AudioSettings {
  silenceDetection: SilenceDetectionSettings;
  speedUp: SpeedUpSettings;
}

export interface SecuritySettings {
  /**
   * Minutes of user inactivity before the vault auto-locks. `0` disables
   * auto-lock; default `10`. Bounded `[0, 120]` in the schema.
   */
  idleLockMinutes: number;
}

export interface SessionWorkflowSettings {
  /**
   * When true, "Stop & finish" chains stop → transcribe → generate → copy in one
   * tap. When false, the user advances each step manually. Default true.
   */
  autoFinish: boolean;
}

/**
 * Soft + hard caps on how long a single recording can run before the recorder
 * nudges the clinician to split, then auto-stops. Defends Marcus's
 * cost-predictability and "lunch-left-recording" failure modes.
 */
export interface RecordingLimitsSettings {
  /** Show a non-blocking "split this?" banner once duration passes this many minutes. Default 75. Bounded [15, 240]. */
  softWarnAtMinutes: number;
  /** Auto-stop the recorder when duration crosses this many minutes. Default 90. Bounded [30, 240]. */
  maxMinutes: number;
  /** When the mic input has been silent for this many continuous minutes, surface an idle-stop prompt. `0` disables. Default 10. Bounded [0, 60]. */
  idleAutoStopMinutes: number;
}

export type ToneStyle = 'narrative' | 'terse' | 'clinical';

/**
 * Org-wide documentation policy. The `activeTemplateId` makes one template the
 * organization default — NewSession and the generator use it unless the
 * clinician explicitly picks another. `toneStyle` flows into the generator
 * prompt so two clinicians dictating the same visit produce notes that read
 * alike.
 */
export interface OrgPolicySettings {
  activeTemplateId?: ID;
  toneStyle: ToneStyle;
}

export type FirstRunRole = 'owner' | 'clinician';

/**
 * State captured during the first launch fork. `role` distinguishes the
 * owner-set-up-the-team flow from the clinician-just-record flow.
 * `disclosureVersion` matches `DISCLOSURE_VERSION` at the time the user
 * acknowledged the disclosure — bump the constant to re-prompt.
 * `onboardingUrlConsumed` is set true after `?role=…&clinic=…` URL params have
 * been read once so refreshes don't re-pre-fill.
 */
export interface FirstRunState {
  role?: FirstRunRole;
  onboardingDoneAt?: number;
  disclosureVersion?: number;
  onboardingUrlConsumed?: boolean;
}

export interface Settings {
  ai: AISettings;
  audio: AudioSettings;
  security: SecuritySettings;
  session: SessionWorkflowSettings;
  recordingLimits: RecordingLimitsSettings;
  orgPolicy: OrgPolicySettings;
  firstRun: FirstRunState;
  ui: {
    sidebarCollapsed: boolean;
    densityMode: DensityMode;
  };
  retention: {
    autoDeleteAudioAfterDays?: number;
  };
}

/**
 * Fixed ID for the built-in "Unassigned" patient. Quick-record paths target this
 * ID so a session can start before a real patient is selected; the user can
 * reassign later from the session screen. Treated as read-only by
 * PatientsProvider (update/remove are no-ops).
 */
export const UNASSIGNED_PATIENT_ID = 'patient:unassigned';

// ─── Page mode (carry-over for compact/detailed view per page) ──────────────

export type AnalysisMode = 'simple' | 'power';
export type PageKey =
  | 'dashboard'
  | 'patients'
  | 'patient_detail'
  | 'session'
  | 'notes'
  | 'templates'
  | 'exercises';

// ─── AppData root ───────────────────────────────────────────────────────────

export interface AppData {
  version: AppDataVersion;
  lastModified: number;
  tenantId: string;
  clinician: Clinician;
  patients: Patient[];
  sessions: Session[];
  notes: Note[];
  templates: NoteTemplate[];
  exercises: Exercise[];
  plans: PlanOfCare[];
  settings: Settings;
}
