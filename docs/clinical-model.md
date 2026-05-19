# Clinical model

The domain a PT cares about: who is being treated, what was said in the room, what the note records, and what they were prescribed to do at home.

## Entities

### Patient

A person under care. Demographics + a free-text `notes` field for chart context.

| Field                  | Type                                    | Notes                                               |
| ---------------------- | --------------------------------------- | --------------------------------------------------- |
| `firstName`/`lastName` | string                                  | Required.                                           |
| `dob`                  | ms timestamp                            | Optional.                                           |
| `sex`                  | `'F' \| 'M' \| 'X'`                     | Optional.                                           |
| `mrn`                  | string                                  | Local chart number — optional, never sent to AI.    |
| `primaryDiagnosis`     | string                                  | Free text. Plays a role in note generation prompts. |
| `icd10`                | string                                  | Optional code.                                      |
| `referringProvider`    | string                                  | Optional.                                           |
| `status`               | `'active' \| 'on_hold' \| 'discharged'` | Drives filtering in patient picker.                 |

### Session

One treatment encounter. Owns the audio + transcript and (eventually) the generated `Note`.

| Field              | Type                                                       | Notes                                                           |
| ------------------ | ---------------------------------------------------------- | --------------------------------------------------------------- |
| `patientId`        | id                                                         | FK into `patients`.                                             |
| `type`             | `'evaluation' \| 'follow_up' \| 'progress' \| 'discharge'` | Drives the default template selection.                          |
| `date`             | ms timestamp                                               | Set when the session is created.                                |
| `status`           | see below                                                  | State machine.                                                  |
| `audioRef`         | sessionId (string)                                         | Key into `AudioRepository` (IndexedDB). Absent if no recording. |
| `transcript`       | string                                                     | Final transcript text.                                          |
| `transcriptSource` | `'whisper' \| 'webspeech' \| 'manual'`                     | Where the transcript came from.                                 |
| `noteId`           | id                                                         | FK into `notes`. Set on first generate or first manual edit.    |
| `templateId`       | id                                                         | FK into `templates`. Stamped at session start.                  |

#### Session status state machine

```
draft  -- start recording -->  recording
recording  -- stop -->  draft (with audio + optional live transcript)
draft  -- transcribe -->  transcribing  -->  draft (transcript filled)
draft  -- generate -->  generating  -->  ready
ready  -- finalize -->  finalized
```

Transitions are owned by the `Session` page. A session can skip transcription entirely if the clinician dictates straight into the note editor (`transcriptSource: 'manual'`).

#### SessionClip status state machine

Each clip (recorded or uploaded) progresses through:

```
pending  -- audio saved -->  ready  -- auto-transcribe -->  transcribing  -->  transcribed (or failed)
```

The background auto-transcription effect (`useBackgroundTranscription`) fires for every clip reaching `status: 'ready'` with no `t2Transcript`. It calls `transcribeWithLocalWhisper` via the worker pool, then patches the clip with the result storing output in `t2Transcript`. The session-level `transcript` is merged from all transcribed clips.

### Note

The structured chart note generated from (or written against) a session's transcript.

| Field         | Type                                                              | Notes                                                           |
| ------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `format`      | `'soap' \| 'evaluation' \| 'progress' \| 'discharge' \| 'custom'` | Mirrors `NoteTemplate.format`.                                  |
| `sections`    | `{ key, label, body }[]`                                          | One entry per template section. Bodies are plain text/Markdown. |
| `templateId`  | id                                                                | FK to the template the note was generated against.              |
| `finalized`   | boolean                                                           | Locks the editor when true. Toggled by Finalize/Re-open.        |
| `finalizedAt` | ms timestamp                                                      | Stamped when `finalized` flips true.                            |

A note is created lazily — only when the clinician asks the AI to generate, or starts editing manually. Until then the session has `noteId: undefined`.

### NoteTemplate

The structure + system prompt for a `Note`. Built-ins (`SOAP`, `Evaluation`, `Progress`, `Discharge`) ship with the app and seed via `defaultAppData()`. Custom templates have `builtin: false`.

`sections[]` defines the section keys that the AI is asked to fill, plus a `promptHint` per section to nudge the model. `systemPrompt` controls overall tone, jargon level, and what to do when the transcript is silent on a topic ("write 'Not assessed' rather than fabricating").

Built-in templates are read-only at the provider level — the UI exposes Clone instead of Edit/Delete.

### Exercise

Reusable item in the home-exercise library. Built-ins seed common PT exercises across body regions; clinicians can add their own.

| Field           | Type                                                                                 |
| --------------- | ------------------------------------------------------------------------------------ |
| `name`          | string                                                                               |
| `region`        | `BodyRegion` (cervical, lumbar, shoulder, knee, …)                                   |
| `category`      | `'strength' \| 'mobility' \| 'stability' \| 'cardio' \| 'neuro' \| 'manual_therapy'` |
| `instructions`  | string — what the patient does                                                       |
| `cues`          | string — coaching pointers                                                           |
| `defaultDosage` | string — e.g. "3 sets of 10, 2x/day"                                                 |
| `videoUrl`      | string — optional reference                                                          |

### PlanOfCare

Per-patient, owns the goals and prescribed exercises that survive across sessions.

| Field                   | Type                                                     |
| ----------------------- | -------------------------------------------------------- |
| `patientId`             | id                                                       |
| `startDate`             | ms timestamp                                             |
| `expectedDischargeDate` | ms timestamp (optional)                                  |
| `goals`                 | `{ id, text, targetDate?, met }[]`                       |
| `prescriptions`         | `{ id, exerciseId, dosage, notes? }[]`                   |
| `active`                | boolean — only one active plan per patient by convention |

## AI prompt shape

`generateNote()` builds the user prompt as:

```
Context:
- Patient: <First Last>, age <derived from dob>
- Diagnosis: <primaryDiagnosis ?? "—">
- Visit type: <session.type>
- Template: <template.name> (<format>)

Sections to produce (one JSON key per section, value = string):
- <section.key>: <section.label> — <section.promptHint>
- ...

Transcript:
"""
<session.transcript>
"""

Return a single JSON object whose keys are the section keys above. If the transcript does not cover a section, write "Not assessed" rather than guessing.
```

The system prompt is the template's `systemPrompt`. Models are asked to produce JSON; `extractJson()` is forgiving about markdown fences.

## Manual fallback

Every AI step is optional:

- **No transcription provider** → recorder still saves audio; clinician types the transcript or writes the note from memory.
- **No generation provider** → clinician edits sections directly. Note format = the chosen template's format.
- **No recording at all** → clinician opens a session, picks a template, and writes the note straight in the editor.

The app is usable end-to-end without ever sending data off-device.
