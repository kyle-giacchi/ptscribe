import { z } from 'zod';
import {
  APP_DATA_VERSION,
  type AppData,
  type NoteTemplate,
  type Exercise,
} from '@/types';
import { newId } from '@/utils/ids';
import { BUILTIN_TEMPLATES } from '@/lib/clinical/templates';
import { BUILTIN_EXERCISES } from '@/lib/clinical/exercises';

// ─── Clinician ──────────────────────────────────────────────────────────────

const ClinicianSchema = z.object({
  name: z.string(),
  credentials: z.string(),
  npi: z.string().optional(),
  practiceName: z.string().optional(),
  practiceAddress: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  signatureBlock: z.string().optional(),
  acknowledgedDisclosureAt: z.number().int().optional(),
});

// ─── Patient ────────────────────────────────────────────────────────────────

const PatientSchema = z.object({
  id: z.string().min(1),
  firstName: z.string(),
  lastName: z.string(),
  dob: z.number().int().optional(),
  sex: z.enum(['F', 'M', 'X']).optional(),
  mrn: z.string().optional(),
  primaryDiagnosis: z.string().optional(),
  icd10: z.string().optional(),
  referringProvider: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['active', 'discharged', 'on_hold']),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

// ─── Session ────────────────────────────────────────────────────────────────

const SessionClipSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().min(0),
  durationSec: z.number().min(0),
  status: z.enum(['pending', 'ready', 'transcribing', 'transcribed', 'failed']),
  transcript: z.string().optional(),
  liveTranscript: z.string().optional(),
  transcriptedAt: z.number().int().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

const SessionSchema = z.object({
  id: z.string().min(1),
  patientId: z.string().min(1),
  type: z.enum(['evaluation', 'follow_up', 'progress', 'discharge']),
  date: z.number().int(),
  durationMin: z.number().min(0).optional(),
  status: z.enum([
    'draft',
    'recording',
    'transcribing',
    'generating',
    'ready',
    'finalized',
  ]),
  clips: z.array(SessionClipSchema),
  transcript: z.string().optional(),
  liveTranscript: z.string().optional(),
  transcriptSource: z.enum(['whisper', 'webspeech', 'manual']).optional(),
  noteId: z.string().optional(),
  templateId: z.string().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

// ─── Note ───────────────────────────────────────────────────────────────────

const NoteSectionSchema = z.object({
  key: z.string(),
  label: z.string(),
  body: z.string(),
});

const NoteSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  patientId: z.string().min(1),
  format: z.enum(['soap', 'evaluation', 'progress', 'discharge', 'custom']),
  templateId: z.string().optional(),
  sections: z.array(NoteSectionSchema),
  finalized: z.boolean(),
  finalizedAt: z.number().int().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

// ─── Template ───────────────────────────────────────────────────────────────

const NoteTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  format: z.enum(['soap', 'evaluation', 'progress', 'discharge', 'custom']),
  sections: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      promptHint: z.string().optional(),
    }),
  ),
  systemPrompt: z.string(),
  builtin: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

// ─── Exercise ───────────────────────────────────────────────────────────────

const RegionEnum = z.enum([
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

const CategoryEnum = z.enum([
  'strength',
  'mobility',
  'stability',
  'cardio',
  'neuro',
  'manual_therapy',
]);

const ExerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  region: RegionEnum,
  category: CategoryEnum,
  instructions: z.string(),
  defaultDosage: z.string().optional(),
  cues: z.string().optional(),
  videoUrl: z.string().optional(),
  builtin: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

// ─── Plan of Care ───────────────────────────────────────────────────────────

const PlanGoalSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  targetDate: z.number().int().optional(),
  met: z.boolean(),
});

const PrescriptionSchema = z.object({
  id: z.string().min(1),
  exerciseId: z.string().min(1),
  dosage: z.string(),
  notes: z.string().optional(),
});

const PlanOfCareSchema = z.object({
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

// ─── Settings ───────────────────────────────────────────────────────────────

const SettingsSchema = z.object({
  ai: z.object({
    transcription: z.object({
      provider: z.enum(['cloudflare', 'webspeech', 'local', 'none']),
      model: z.string(),
    }),
    generation: z.object({
      provider: z.enum(['anthropic', 'none']),
      model: z.string(),
    }),
  }),
  audio: z.object({
    silenceDetection: z.object({
      enabled: z.boolean(),
      sensitivity: z.enum(['low', 'medium', 'high']),
      padMs: z.number().int().min(0).max(2000),
    }),
    speedUp: z.object({
      enabled: z.boolean(),
      speed: z.union([z.literal(1.25), z.literal(1.5), z.literal(1.75)]),
    }),
  }),
  security: z.object({
    idleLockMinutes: z.number().int().min(0).max(120),
  }),
  ui: z.object({
    sidebarCollapsed: z.boolean(),
    densityMode: z.enum(['cozy', 'compact']),
  }),
  retention: z.object({
    autoDeleteAudioAfterDays: z.number().int().positive().optional(),
  }),
});

// ─── AppData root ───────────────────────────────────────────────────────────

export const AppDataSchema = z.object({
  version: z.literal(APP_DATA_VERSION),
  lastModified: z.number().int(),
  clinician: ClinicianSchema,
  patients: z.array(PatientSchema),
  sessions: z.array(SessionSchema),
  notes: z.array(NoteSchema),
  templates: z.array(NoteTemplateSchema),
  exercises: z.array(ExerciseSchema),
  plans: z.array(PlanOfCareSchema),
  settings: SettingsSchema,
});

export function defaultAppData(): AppData {
  const now = Date.now();
  const templates: NoteTemplate[] = BUILTIN_TEMPLATES.map((t) => ({
    ...t,
    id: newId(),
    builtin: true,
    createdAt: now,
    updatedAt: now,
  }));
  const exercises: Exercise[] = BUILTIN_EXERCISES.map((e) => ({
    ...e,
    id: newId(),
    builtin: true,
    createdAt: now,
    updatedAt: now,
  }));
  return {
    version: APP_DATA_VERSION,
    lastModified: now,
    clinician: { name: '', credentials: '' },
    patients: [],
    sessions: [],
    notes: [],
    templates,
    exercises,
    plans: [],
    settings: {
      ai: {
        transcription: { provider: 'cloudflare', model: '@cf/deepgram/nova-3' },
        generation: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      },
      audio: {
        silenceDetection: { enabled: false, sensitivity: 'medium', padMs: 400 },
        speedUp: { enabled: false, speed: 1.5 },
      },
      security: { idleLockMinutes: 10 },
      ui: { sidebarCollapsed: false, densityMode: 'cozy' },
      retention: {},
    },
  };
}
