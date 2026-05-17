# Workflows

State transitions and data changes for every major user journey in PTScribe. Read when adding a new flow, debugging unexpected state, or understanding what owns a particular side-effect.

Each section names the hook(s) that own the relevant handlers.

---

## State machines

### Session status

```
draft
  ──[start recording]──► recording
  ──[begin transcription]──► transcribing ──► draft   (transcript filled)
  ──[begin generation]──► generating ──► ready        (note draft filled)
  ──[finalize]──► finalized
  ◄──[re-open]── ready                               (unfinalize)
```

`draft` is the resting state between all active operations. A session stays in `draft` while the clinician is editing the transcript or note. `recording` and `transcribing` / `generating` are transient — always resolve back to `draft` or advance to `ready`.

Transitions are owned by `Session.tsx` via `useRecordingFlow`, `useTranscriptionFlow`, and `useGenerationFlow`.

### SessionClip status

```
pending ──[audio saved to IDB]──► ready
ready   ──[auto-transcribe begins]──► transcribing
transcribing ──[Whisper succeeds]──► transcribed
transcribing ──[Whisper fails]──► failed
```

`pending` means the MediaRecorder is still live or the clip has not yet been persisted. A clip stuck in `pending` on next mount triggers crash recovery (see [Crash recovery](#crash-recovery)).

### Patient status

```
active ──[discharge]──► discharged
active ──[hold]──► on_hold
on_hold ──[re-activate]──► active
```

Purely a label used for filtering in the patient picker. No business logic gates on it except `UNASSIGNED_PATIENT_ID`, which is always treated as active regardless of stored status.

---

## Recording flow

**Owner:** `useRecordingFlow` + `useRecorder` + `useLiveTranscript`

### Normal record → stop

```
handleStartRecording()
  → newId() → clipId
  → patchClips: append { id: clipId, status: 'pending', ... }
  → patchSession: status = 'recording'
  → recorder.start(clipId)
      → MediaRecorder.start(100ms timeslice)
      → per-timeslice: audioRepository.appendChunk(clipId, index, blob)  ← WAL
      → per-timeslice: onChunk(blob) → Whisper live preview (leaky bucket)
  → useLiveTranscript.start()  ← Web Speech streaming begins → clip.liveTranscript accumulates

handleStopRecording()
  → recorder.stop() → finalBlob (consolidated from MediaRecorder)
  → useLiveTranscript.stop() → live.finalText frozen
  → audioRepository.save(clipId, finalBlob)           ← consolidated Blob to IDB
  → audioRepository.clearChunks(clipId)               ← WAL purged (best-effort)
  → patchClip(clipId, { status: 'ready', durationSec })
  → patchClip(clipId, { liveTranscript: live.finalText })  ← T1 frozen
  → patchSession: status = 'draft'
  → [background auto-pass fires] → T2 Whisper transcription begins (see transcription.md)
```

### Stop & finish

`handleStopAndFinish()` calls `handleStopRecording()` then immediately switches to the Review tab. No additional state changes — transcription and generation remain explicit.

### Pause / resume

`handlePauseResume()` calls `recorder.pause()` / `recorder.resume()` and mirrors the live transcript start/stop. Session and clip status are not changed — the session stays `recording` during a pause.

### Review tab merge

When the user navigates to Review, `handleRecordingComplete()` runs:

```
handleRecordingComplete()
  → load all ready/transcribed clip blobs from IDB
  → mergeAudioBlobs(blobs) → setMergedAudioBlob   ← used for playback only, not persisted
  → compile best-available transcript per clip:
      transcript ?? localTranscript ?? liveTranscript
  → patchSession: transcript = compiled, liveTranscript = compiled, transcriptSource = 'webspeech'
  → setActiveTab('review')
```

---

## Upload audio flow

**Owner:** `useRecordingFlow.handleUploadAudio`

```
handleUploadAudio(file)
  → validate: size ≤ 25 MB, type audio/* or video/*
  → newId() → clipId
  → patchClips: append { id: clipId, status: 'pending', ... }
  → uploadStatus: 'reading'
  → file.arrayBuffer() → Blob
  → probe duration via HTMLAudioElement.onloadedmetadata
  → uploadStatus: 'saving'
  → audioRepository.save(clipId, blob)
  → patchClip(clipId, { status: 'ready', durationSec })
  → uploadStatus: 'done' (auto-clears after 3 s)
  → [background auto-pass fires] → T2 Whisper transcription begins
```

Uploaded clips follow the exact same `status: 'pending' → 'ready' → transcribing → transcribed` path as recorded clips. The background Whisper pass picks them up identically.

---

## Crash recovery

**Owner:** `useAudioRecovery` (runs once on session mount)

The IDB `recording_chunks` store is a write-ahead log. Each 100 ms timeslice is persisted before the MediaRecorder's consolidated Blob is available. If the app crashes mid-recording, the consolidated save never happens and the clip stays `pending`.

On next mount:

```
useAudioRecovery (runs once per sessionId)
  → find clips with status: 'pending'
  → for each pending clip:
      audioRepository.loadChunks(clipId)   ← read WAL
      if chunks found:
        blob = new Blob(chunks, { type: mimeType })
        audioRepository.save(clipId, blob)  ← consolidate
        audioRepository.clearChunks(clipId) ← purge WAL
        patchClip: status = 'ready'         ← auto-pass fires
      else:
        patchClip: status = 'failed', errorMessage = 'interrupted before audio saved'
```

---

## Auto-stop scenarios

**Owner:** `useRecorder` + auto-stop effect in `useRecordingFlow`

Four conditions cause the MediaRecorder to stop without explicit user action:

| Condition | Flag | Description |
|-----------|------|-------------|
| Hard cap | `recorder.hardCapStopped` | Duration exceeded `settings.recordingLimits.maxMinutes` |
| Idle auto-stop | `recorder.idleAutoStopped` | No mic input for `idleAutoStopMinutes` continuous minutes |
| Recorder interrupted | `recorder.recorderInterrupted` | MediaRecorder error or OS-level interruption |
| Mic disconnected | `recorder.micDisconnected` | `MediaStreamTrack` ended event |

When any of these flags is true and `recorder.status === 'stopped'`, an effect in `useRecordingFlow` fires `handleStopRecording()` automatically — the same path as a manual stop. The clip lands in `ready` and the Whisper auto-pass picks it up.

A background visibility warning (`wasBackgrounded`) is a separate sticky flag set by `useRecorder` the first time the tab is hidden during a clip. It surfaces a "verify duration" banner in `Session.tsx` but does not stop recording.

---

## T2 background transcription

**Owner:** `useTranscriptionFlow` (background `useEffect` on `session.clips`)

Fires automatically for every clip that reaches `status: 'ready'` with no `localTranscript`, regardless of the configured provider. See [transcription.md — T2 background auto-pass](transcription.md#t2-background-auto-pass-usetranscriptionflow445) for the full write path.

---

## T3 explicit Nova transcription

**Owner:** `useTranscriptionFlow.handleCreateTranscript`

```
handleCreateTranscript(clipId?)
  → checkActionGuard('transcribe')   ← rate-limited; see Action guards
  → pending = clips eligible for cloud transcription
  → patchClips: set pending clips to status: 'transcribing'
  → patchSession: status = 'transcribing'
  → setBusy('transcribing')
  → runTranscribeLoop(pending, transcribed, useNova=true)
      → per clip: optional trimSilence() + speedUpAudio()
      → POST /api/transcribe (Cloudflare Worker → Deepgram Nova-3)
      → patchClip: status='transcribed', transcript=nova, aiTranscript=nova
  → mergeClipTranscripts(updatedClips)
  → patchSession: transcript=merged, transcriptSource='nova', aiTranscript=merged, status='draft'
  → setBusy(null)
```

`session.localTranscript` (T2) is **not touched** by this path.

---

## Note generation

**Owner:** `useGenerationFlow.handleGenerate`

```
handleGenerate()
  → guard: template exists, transcript non-empty, provider === 'anthropic'
  → checkActionGuard('generate')   ← rate-limited
  → patchSession: status = 'generating'
  → setBusy('generating')
  → generateNote({ template, transcript, patient, sessionType, toneStyle })
      → POST /api/generate (Cloudflare Worker → Anthropic claude-sonnet-4-6)
      → returns { sections: { key, label, body }[] }
  → if note exists: updateNote(sections)
    else: ensureNote(sections)    ← lazy note creation; patchSession: noteId = newId
  → patchSession: status = 'ready'
  → setBusy(null)
```

On error, `session.status` reverts to `'draft'`. The note is never created if generation fails.

**Lazy note creation:** `ensureNote()` is called on the first section edit or on generation. Until then, `session.noteId` is undefined and no `Note` row exists. This prevents empty placeholder notes from polluting the notes list.

---

## Finalization

**Owner:** `useGenerationFlow.handleFinalize` / `handleUnfinalize`

```
handleFinalize()
  → guard: missingRequiredLabels must be empty (template required-section check)
  → ensureNote()                    ← creates note if somehow absent
  → finalizeNote(note.id)           ← note.finalized = true, note.finalizedAt = now
  → patchSession: status = 'finalized'
```

```
handleUnfinalize()
  → unfinalizeNote(note.id)         ← note.finalized = false
  → patchSession: status = 'ready'
```

Post-finalization edits are tracked by `note.editedAfterFinalizedAt` (first-edit timestamp) and `note.editedAfterFinalizedCount` (incremented per save in `handleSectionChange`).

---

## Session deletion

**Owner:** `useGenerationFlow.handleDeleteSession`

```
handleDeleteSession()
  → if note exists: removeNote(note.id)
  → Promise.allSettled: audioRepository.remove(clip.id) for every clip
  → removeSession(session.id)
  → navigate('/today', { replace: true })
```

**Demo mode exception:** For sessions on the demo patient, `removeSession` is not called. Instead, the clips array is cleared and the session is reset to `draft` so the demo flow can start fresh from the same session record.

---

## Demo mode completion

**Owner:** `DemoBootstrap` / `DemoCompleteModal` (triggered from Session.tsx finalize wrapper)

When the clinician clicks "Complete Session" in demo mode:

```
[finalize wrapper in Session.tsx]
  → handleFinalize()                  ← normal finalization path above
  → if isDemoMode() && patient is demo patient:
      updatePatient(DEMO_PATIENT_ID, { status: 'discharged' })
      setShowDemoCompleteModal(true)

DemoCompleteModal — two choices:
  "Start fresh"
    → updatePatient(DEMO_PATIENT_ID, { status: 'active' })
    → clear all demo sessions + notes + audio
    → re-seed demo data
    → navigate('/today')
  "Keep and continue"
    → dismiss modal; demo data preserved as-is
```

---

## Action guards

**Owner:** `useActionGuard`

Rate-limits expensive AI operations per session to prevent runaway costs:

| Action | Limit |
|--------|-------|
| `transcribe` | `MAX_TRANSCRIBES_PER_SESSION` (cloud Nova passes only) |
| `generate` | `MAX_GENERATES_PER_SESSION` |

The background T2 Whisper pass bypasses the guard — it calls `transcribeClipBlob` directly with `forceLocal: true` and never touches `checkActionGuard`.

---

## Whisper live preview (during recording)

**Owner:** `useRecordingFlow` leaky-bucket processor

A leaky-bucket pattern runs Whisper on audio chunks as they arrive from the MediaRecorder. At most one Whisper job is in flight at a time; if a new chunk arrives while one is running, the new chunk replaces the pending blob so the preview always shows fresh content.

Results appear as `whisperBubbles: string[]` in the recording panel. Bubbles separated by more than 2 500 ms are appended as new items; results within the gap replace the last bubble (continuous refinement of the current utterance).

This is display-only — the bubbles are never persisted. The authoritative T2 transcript comes from the post-clip `transcribeLocalChunked` pass, not from these live preview chunks.
