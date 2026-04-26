export type ID = string;

export const APP_DATA_VERSION = 3;
export type AppDataVersion = typeof APP_DATA_VERSION;

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
  | 'pending'      // recording in flight; no consolidated Blob yet
  | 'ready'        // audio saved, awaiting transcription
  | 'transcribing' // Whisper request in flight
  | 'transcribed'  // transcript text populated
  | 'failed';      // last transcription attempt failed

export interface SessionClip {
  id: ID;
  index: number;
  durationSec: number;
  status: ClipStatus;
  transcript?: string;
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

export type TranscriptionProvider = 'cloudflare' | 'webspeech' | 'none';
export type GenerationProvider = 'anthropic' | 'none';
export type DensityMode = 'cozy' | 'compact';

export interface AISettings {
  transcription: {
    provider: TranscriptionProvider;
    model: string; // e.g. '@cf/openai/whisper-large-v3-turbo'
    apiKey?: string; // Cloudflare API token
    accountId?: string; // Cloudflare account ID (required for the cloudflare provider)
  };
  generation: {
    provider: GenerationProvider;
    model: string; // e.g. 'claude-sonnet-4-6'
    apiKey?: string;
  };
}

export interface Settings {
  ai: AISettings;
  ui: {
    sidebarCollapsed: boolean;
    densityMode: DensityMode;
  };
  retention: {
    autoDeleteAudioAfterDays?: number;
  };
}

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
  clinician: Clinician;
  patients: Patient[];
  sessions: Session[];
  notes: Note[];
  templates: NoteTemplate[];
  exercises: Exercise[];
  plans: PlanOfCare[];
  settings: Settings;
}
