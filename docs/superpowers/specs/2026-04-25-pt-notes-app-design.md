# PT Notes — Design Spec

**Date:** 2026-04-25
**Status:** Approved (autonomous execution)
**Supersedes:** `2026-04-25-group-finance-app-design.md` (Money Coast)

> This is a wholesale pivot from a personal-finance app to a Heidi-style clinical
> note-taking and transcription app for physical therapists. The slice-provider
> + single-write-path architecture is retained; the domain is replaced.

---

## 1. Problem & Goals

A solo or small-clinic physical therapist needs to:

1. **Capture** a session (audio recording, optional manual notes during).
2. **Transcribe** the recording to text.
3. **Generate** a structured clinical note (SOAP / Initial Eval / Progress / Discharge) from the transcript.
4. **Edit and finalize** the note before saving to the patient record.
5. **Browse** patients, prior sessions, and prescribed home-exercise programs.

Heidi's compelling property: the therapist talks naturally; the app produces a
clean structured note. PT Notes replicates that flow while staying local-first
with bring-your-own AI keys.

### Headline UX

- **Dashboard** answers "what's on today, what did I just do?"
- **Patient detail** answers "what's this patient's history and active plan?"
- **Session page** answers "record now, transcribe, and produce a note."

### Non-goals

- No backend, no auth, no multi-user sync. Single-device app.
- Not HIPAA-certified software. (Disclaimer surfaced in Setup + Settings.)
- No billing/insurance integrations.
- No scheduling (the "today" view reads sessions the user manually creates).

---

## 2. Architecture

Reused wholesale from the previous app:

```
pages → hooks → slice contexts → AppDataProvider → DataRepository → localStorage
                                                 ↘ AudioRepository → IndexedDB
```

- **Single write path**: components never touch storage directly. They call
  slice mutators, which call `AppDataProvider.updateXSlice`, which debounces a
  single `DataRepository.save()`.
- **Schema validation at boundaries**: Zod `safeParse` runs on load and import,
  not on every state update.
- **AudioRepository** is new — IndexedDB-backed, holds raw audio blobs keyed by
  session id. Audio is opaque to `DataRepository` and `AppDataSchema`.
- **AI services** (`src/services/ai/transcribe.ts`, `src/services/ai/generate.ts`)
  are pure async functions that take input + an API key + a model and return a
  result. They are NOT in the write path; the page component invokes them and
  hands the result to a slice mutator.

### Provider stack

```
AppDataProvider
  └─ ClinicianProvider           (single-clinician profile)
     └─ PatientsProvider
        └─ SessionsProvider
           └─ NotesProvider
              └─ TemplatesProvider
                 └─ ExercisesProvider
                    └─ PlansProvider     (plans of care, exercise prescriptions)
                       └─ SettingsProvider (API keys, model choices, UI prefs)
                          └─ FirstRunGuard
                             └─ Routes
```

### Units & coordinate systems

- Dates: ms timestamps (`number`).
- Durations: minutes (`number`).
- IDs: UUID via `newId()`.

---

## 3. Pages & Navigation

| Path           | Page             | Purpose                                                                       |
| -------------- | ---------------- | ----------------------------------------------------------------------------- |
| `/setup`       | Setup wizard     | First-run: clinician profile, optional API keys, HIPAA disclaimer, sample patient. |
| `/`            | Dashboard        | Today's sessions, recent unfinalized notes, quick "New session" action.       |
| `/patients`    | Patients list    | Searchable list, status, last-visit date.                                     |
| `/patients/:id`| Patient detail   | Demographics, plan of care, session history, prescriptions.                   |
| `/sessions/new`| New session      | Patient picker → recording flow.                                              |
| `/sessions/:id`| Session detail   | Recording, transcript, generated note editor, attached prescriptions.         |
| `/notes`       | Notes library    | Cross-patient search and filter.                                              |
| `/templates`   | Templates        | View / edit / clone note templates.                                           |
| `/exercises`   | Exercise library | Searchable, categorized; create/edit exercises.                               |
| `/settings`    | Settings         | Clinician profile, API keys, model selection, export/erase.                   |

Sidebar order: Dashboard, Patients, Sessions(implicit via patient/new), Notes, Templates, Exercises, Settings.

---

## 4. Data Model

```ts
type ID = string; // UUID

interface Clinician {
  name: string;
  credentials: string;        // "DPT, OCS"
  npi?: string;
  practiceName?: string;
  practiceAddress?: string;
  phone?: string;
  email?: string;
  signatureBlock?: string;
}

interface Patient {
  id: ID;
  firstName: string;
  lastName: string;
  dob?: number;               // ms timestamp
  sex?: 'F' | 'M' | 'X';
  mrn?: string;               // medical record number (clinic-assigned)
  primaryDiagnosis?: string;
  icd10?: string;
  referringProvider?: string;
  notes?: string;             // free-form patient-level notes
  status: 'active' | 'discharged' | 'on_hold';
  createdAt: number;
  updatedAt: number;
}

type SessionType = 'evaluation' | 'follow_up' | 'progress' | 'discharge';
type SessionStatus = 'draft' | 'recording' | 'transcribing' | 'generating' | 'ready' | 'finalized';

interface Session {
  id: ID;
  patientId: ID;
  type: SessionType;
  date: number;               // ms timestamp
  durationMin?: number;
  status: SessionStatus;
  audioRef?: ID;              // key into AudioRepository (IndexedDB)
  transcript?: string;
  transcriptSource?: 'whisper' | 'webspeech' | 'manual';
  noteId?: ID;                // optional final note
  templateId?: ID;
  createdAt: number;
  updatedAt: number;
}

type NoteFormat = 'soap' | 'evaluation' | 'progress' | 'discharge' | 'custom';

interface NoteSection {
  key: string;                // 'subjective', 'objective', 'assessment', 'plan', etc.
  label: string;
  body: string;               // markdown-ish
}

interface Note {
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

interface NoteTemplate {
  id: ID;
  name: string;
  format: NoteFormat;
  sections: { key: string; label: string; promptHint?: string }[];
  systemPrompt: string;       // sent to the LLM to shape generated output
  builtin: boolean;           // bundled defaults can't be deleted, only cloned
  createdAt: number;
  updatedAt: number;
}

type BodyRegion =
  | 'cervical' | 'thoracic' | 'lumbar' | 'shoulder' | 'elbow' | 'wrist_hand'
  | 'hip' | 'knee' | 'ankle_foot' | 'core' | 'gait_balance' | 'other';

interface Exercise {
  id: ID;
  name: string;
  region: BodyRegion;
  category: 'strength' | 'mobility' | 'stability' | 'cardio' | 'neuro' | 'manual_therapy';
  instructions: string;
  defaultDosage?: string;     // "3x10, daily" — free text
  cues?: string;              // therapist cues
  videoUrl?: string;          // optional external link
  builtin: boolean;
  createdAt: number;
  updatedAt: number;
}

interface PlanOfCare {
  id: ID;
  patientId: ID;
  startDate: number;
  expectedDischargeDate?: number;
  goals: { id: ID; text: string; targetDate?: number; met: boolean }[];
  prescriptions: Prescription[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

interface Prescription {
  id: ID;
  exerciseId: ID;
  dosage: string;             // "3x10, 2x/day"
  notes?: string;
}

interface Settings {
  ai: {
    transcription: { provider: 'openai' | 'webspeech' | 'none'; model: string; apiKey?: string };
    generation: { provider: 'anthropic' | 'none'; model: string; apiKey?: string };
  };
  ui: { sidebarCollapsed: boolean; densityMode: 'cozy' | 'compact' };
  retention: { autoDeleteAudioAfterDays?: number };
}

interface AppData {
  schemaVersion: 1;
  clinician: Clinician;
  patients: Patient[];
  sessions: Session[];
  notes: Note[];
  templates: NoteTemplate[];
  exercises: Exercise[];
  plans: PlanOfCare[];
  settings: Settings;
}
```

### Storage layout

| Key                          | Contents                                                |
| ---------------------------- | ------------------------------------------------------- |
| `ptnotes.appData` (localStorage) | Full `AppData` minus audio blobs.                   |
| IndexedDB `ptnotes-audio` / `recordings` | `{ sessionId → Blob }`.                     |

Storage cap: 5 MB enforced for `ptnotes.appData` (existing `MAX_OBJECT_BYTES`).
Audio is unbounded (IndexedDB), with optional auto-delete via the retention setting.

---

## 5. AI Integration

### Transcription

```
audioBlob → transcribe(blob, settings.ai.transcription) → string
```

- **OpenAI Whisper** (preferred): POST `multipart/form-data` to
  `https://api.openai.com/v1/audio/transcriptions` with the user's key.
  Default model `whisper-1`.
- **Web Speech API** (fallback): live `SpeechRecognition` accumulator. Quality
  varies; useful for free-tier users on Chrome.
- **Manual**: skip transcription, type/paste a transcript.

### Note generation

```
{ transcript, template, patientContext } → generate(...) → NoteSection[]
```

- **Anthropic SDK** (`@anthropic-ai/sdk`) with `dangerouslyAllowBrowser: true`
  and the user's API key. Default model `claude-sonnet-4-6`.
- **System prompt**: per-template, prompt-cached so repeat calls are cheap.
- **User prompt**: transcript + patient demographics + prior-note summary if available.
- **Output**: JSON object keyed by section. Parsed into `NoteSection[]`.
- **Latency UX**: show a section-by-section streaming view if possible, or a
  single skeleton with "Generating…" while the full call runs.

### Failure handling

- Network/auth errors → toast with the underlying message + "Edit API key" link.
- Generation errors → keep the transcript and a stub note so nothing is lost.
- Audio capture failure → fall back to manual transcript entry.

### Privacy disclaimer

Setup wizard and Settings both display:

> PT Notes runs entirely in your browser. Patient data lives in this device's
> local storage. Enabling AI transcription or note generation sends audio and
> transcripts to the provider you configured (OpenAI / Anthropic) using the
> API key you supplied. Nothing is sent to a server we operate. **PT Notes is
> not HIPAA-certified software** — verify your providers' BAA terms before use
> with PHI.

---

## 6. Computation / Pure modules

`src/lib/clinical/` replaces `src/lib/finance/`:

- `templates.ts` — built-in template definitions (SOAP, Eval, Progress, Discharge).
- `exercises.ts` — built-in exercise library seed.
- `prompts.ts` — system-prompt builders per template.
- `noteFormat.ts` — render `NoteSection[]` to markdown / plain text for export.
- `transcript.ts` — chunking, paragraph splitting, simple PII-scrubbing helpers.

`src/services/ai/`:

- `transcribe.ts` — provider-routed transcription.
- `generate.ts` — provider-routed note generation.
- `client/openai.ts`, `client/anthropic.ts` — thin wrappers.

`src/services/AudioRepository.ts` — IndexedDB CRUD for audio blobs.

---

## 7. Provider Hierarchy & Mutators

| Slice          | Hook              | Mutators                                                        |
| -------------- | ----------------- | --------------------------------------------------------------- |
| Clinician      | `useClinician`    | `setClinician(partial)`                                         |
| Patients       | `usePatients`     | `addPatient` / `updatePatient` / `removePatient`                |
| Sessions       | `useSessions`     | `addSession` / `updateSession` / `removeSession` / `setStatus`  |
| Notes          | `useNotes`        | `addNote` / `updateNote` / `finalizeNote` / `removeNote`        |
| Templates      | `useTemplates`    | `addTemplate` / `updateTemplate` / `cloneTemplate` / `removeTemplate` |
| Exercises      | `useExercises`    | `addExercise` / `updateExercise` / `removeExercise`             |
| Plans          | `usePlans`        | `addPlan` / `updatePlan` / `removePlan` / `addPrescription` / `removePrescription` |
| Settings       | `useSettings`     | `updateSettings(partial)`                                       |

Built-in templates and exercises are inserted on first run. Users can clone but not delete builtins.

---

## 8. First-run flow

1. `FirstRunGuard` checks `clinician.name === ''` → redirect to `/setup`.
2. `Setup` collects: clinician profile, optional API keys, density preference.
3. On submit, seeds built-in templates + exercises, creates a sample patient,
   navigates to `/`.

---

## 9. File structure

```
src/
  App.tsx
  main.tsx
  contexts/
    AppDataProvider.tsx
    ClinicianProvider.tsx
    PatientsProvider.tsx
    SessionsProvider.tsx
    NotesProvider.tsx
    TemplatesProvider.tsx
    ExercisesProvider.tsx
    PlansProvider.tsx
    SettingsProvider.tsx
  pages/
    Setup.tsx
    Dashboard.tsx
    Patients.tsx
    PatientDetail.tsx
    NewSession.tsx
    Session.tsx
    Notes.tsx
    Templates.tsx
    Exercises.tsx
    Settings.tsx
  components/
    common/        (AppShell, Sidebar, TopBar, FirstRunGuard, CommandPalette, PageModeToggle, etc.)
    ui/            (kept primitives)
    patients/      (PatientCard, PatientForm, PatientPicker)
    sessions/      (Recorder, TranscriptView, NoteEditor, SessionRow)
    notes/         (NoteSectionEditor, NoteCard, FinalizeButton)
    templates/     (TemplateCard, TemplateEditor)
    exercises/     (ExerciseCard, ExerciseForm, PrescriptionRow)
  hooks/
    useRecorder.ts
    useTranscription.ts
    useNoteGeneration.ts
    useEditDialog.ts (kept)
    usePageMode.ts (kept)
  lib/
    clinical/
      templates.ts
      exercises.ts
      prompts.ts
      noteFormat.ts
      transcript.ts
    motion.ts (kept)
    safeStorage.ts (kept)
    storageKeys.ts (rewritten to ptnotes.* namespace)
    utils.ts (kept)
  services/
    DataRepository.ts (kept; namespace updated)
    AudioRepository.ts (new, IndexedDB)
    ai/
      transcribe.ts
      generate.ts
      client/
        openai.ts
        anthropic.ts
  schemas/
    index.ts
  types/
    index.ts
  utils/
    dates.ts (kept)
    download.ts (kept)
    ids.ts (kept)
    migrations.ts (rewritten; v1 baseline)
```

Deleted: `lib/finance/`, `lib/snapshots/`, `lib/io/`, `lib/demo/`, `hooks/useGuiltFree.ts`, `hooks/useNetWorth.ts`, `hooks/useGoalProgress.ts`, `hooks/useYearProjection.ts`, `hooks/useSnapshotScheduler.ts`, `hooks/useAnimatedNumber.ts` (kept if used by remaining UI), all finance pages, all finance providers, all finance components, finance tests.

---

## 10. Testing

- **Vitest unit**: schema validation, repo round-trip, transcription/generation
  service stubs, prompt builder, note formatter.
- **Playwright E2E**:
  1. `setup.spec.ts` — clinician setup → seeds templates/exercises.
  2. `patient.spec.ts` — create/edit/discharge patient.
  3. `session.spec.ts` — new session → manual transcript → AI note (mocked) → finalize.
  4. `templates.spec.ts` — clone built-in, edit, use in session.
- AI calls in tests are mocked at the service layer (deterministic JSON).

---

## 11. Open questions deferred to v2

- Multi-device sync.
- PDF export of finalized notes.
- Patient portal / handouts.
- Insurance / billing CPT picker.
- Exercise video hosting.

---

## 12. Build & ops

- `npm run dev` — Vite dev on port 8080.
- `npm run typecheck` / `lint` / `test` / `test:e2e` — must be green before final commit.
- Old finance e2e fixtures and snapshots are deleted as part of the pivot.
