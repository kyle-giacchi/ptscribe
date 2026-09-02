/**
 * Domain types. Every persisted shape is `z.infer`red from its Zod schema in
 * `@/schemas` and re-exported here — declared once, validated once. This file
 * owns the runtime constants and the few types that are never persisted
 * (catalog definitions, debug payloads, UI keys).
 *
 * The `export type` re-export below is erased at compile time, so `@/schemas`
 * importing the constants from here is not a runtime cycle.
 */

export type {
  AISettings,
  ActivityEntry,
  AiErrorCall,
  AiErrorEntry,
  AiErrorEntryKind,
  AppData,
  AudioSettings,
  BodyRegion,
  Clinician,
  CustomInstruction,
  DensityMode,
  Exercise,
  ExerciseCategory,
  FirstRunRole,
  FirstRunState,
  GenerateKeyReport,
  GenerationProvider,
  Measurement,
  ModifierBeyondNote,
  ModifierClinicalDetail,
  ModifierCodingBilling,
  ModifierLanguage,
  ModifierLength,
  ModifierVoice,
  Note,
  NoteActivities,
  NoteFormat,
  NoteSection,
  NoteTemplate,
  NoteTemplateSection,
  OrgPolicySettings,
  Patient,
  PatientStatus,
  PlanGoal,
  PlanOfCare,
  Prescription,
  RecordingLimitsSettings,
  SecuritySettings,
  SelfHostedEndpoint,
  Session,
  SessionClip,
  ClipStatus,
  SessionModifiers,
  SessionStatus,
  SessionType,
  SessionWorkflowSettings,
  Settings,
  Sex,
  Side,
  SilenceDetectionSettings,
  SilenceSensitivity,
  SpeedFactor,
  SpeedUpSettings,
  ThemeMode,
  TranscriptChunk,
  TranscriptTier,
  TranscriptionProvider,
} from '@/schemas';

import type { BodyRegion, ExerciseCategory, GenerationProvider } from '@/schemas';

export type ID = string;

export const APP_DATA_VERSION = 1;

/**
 * Disclosure copy version. Bump when the HIPAA / data-handling text changes
 * meaningfully so the user is re-prompted to acknowledge the new wording.
 */
export const DISCLOSURE_VERSION = 1;

/** Lifetime cap on cloud (Nova) transcription runs per session — see `Session.cloudTranscribeCount`. */
export const MAX_TRANSCRIBES_PER_SESSION = 1;
/** Lifetime cap on Anthropic note-generation runs per session — see `Session.generateCount`. */
export const MAX_GENERATES_PER_SESSION = 10;

// ─── Exercise catalog labels ────────────────────────────────────────────────

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

// ─── Objective measures (catalog definitions — not persisted) ───────────────

export type MeasureKind = 'pain' | 'rom' | 'strength' | 'outcome' | 'functional';

/**
 * A measure *definition* from the built-in catalog (`src/lib/clinical/measures.ts`).
 * Definitions carry the unit, the plausible range, and — critically — which
 * direction counts as improvement, so a raw delta can be rendered as better/worse.
 */
export interface MeasureDef {
  /** Stable catalog key, e.g. `nprs`, `rom_knee_flexion`. Persisted on Measurement. */
  id: string;
  label: string;
  kind: MeasureKind;
  /** Display suffix: `/10`, `°`, `/5`, `kg`, `s`, `m`, `pts`, `%`. */
  unit: string;
  min: number;
  max: number;
  /** True when a HIGHER value is clinically better (ROM, MMT, LEFS, 6MWT). */
  higherIsBetter: boolean;
  /** Measure is taken per-limb — the entry form asks for a side. */
  bilateral?: boolean;
  /** Minimal clinically important difference, where one is published. */
  mcid?: number;
  /** Shown under the value in the entry form. */
  hint?: string;
}

// ─── Generation provider helpers ────────────────────────────────────────────

/** Providers whose key we store server-side and whose calls the Worker proxies. */
export type CloudGenerationProvider = Exclude<GenerationProvider, 'none' | 'local' | 'network'>;
export type SelfHostedProvider = Extract<GenerationProvider, 'local' | 'network'>;

export const CLOUD_GENERATION_PROVIDERS = ['anthropic', 'openai', 'google'] as const;

export function isCloudProvider(p: GenerationProvider): p is CloudGenerationProvider {
  return (CLOUD_GENERATION_PROVIDERS as readonly string[]).includes(p);
}
export function isSelfHostedProvider(p: GenerationProvider): p is SelfHostedProvider {
  return p === 'local' || p === 'network';
}

export const SUPPORTED_SPEEDS = [1.25, 1.5, 1.75] as const;

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
  'dashboard' | 'patients' | 'patient_detail' | 'session' | 'notes' | 'templates' | 'exercises';

// ─── AI debug (in-memory only) ──────────────────────────────────────────────

export interface AiDebugPrompts {
  /** Model id sent to the Worker (resolved, after the default fallback). */
  model: string;
  system: string;
  modifierBlock: string;
  user: string;
}
