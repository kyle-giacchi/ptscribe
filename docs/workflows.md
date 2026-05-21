# Workflows

State transitions and data changes for every major user journey in PTScribe. Read when adding a new flow, debugging unexpected state, or understanding what owns a particular side-effect.

For canonical names of the phases (Capture / Curate / Generate / Finalize) and clinician-facing concepts (curated transcript, locked transcript, Improve with AI, Modifiers, audio retention), see [CONTEXT.md](../CONTEXT.md). This file documents the *implementation* of that vocabulary.

Each section names the hook(s) that own the relevant handlers.

---

## Session entry points

Three named ways to start a session, presented at session creation after patient + visit-type selection:

1. **Recording** — capture a live visit with the mic; live preview (T1) during, T2 transcription on stop.
2. **Audio Upload** — provide one or more existing audio files; no live preview, T2 runs on the combined silence-removed blob.
3. **Skip / Manually type** — no audio at all; clinician types/pastes the transcript and proceeds directly to Curate. "Improve with AI" is hidden in this path (no audio to re-transcribe).

All three converge on the same state machine after Capture (Curate → Generate → Finalize). Differences are only in *how the transcript gets into the system*. Entry 3 bypasses [Capture flow](#capture-flow-t2-before-curate) entirely.

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

**Owner:** `useRecordingFlow` + `useRecorder`

### Normal record → stop

```
handleStartRecording()
  → newId() → clipId
  → patchClips: append { id: clipId, status: 'pending', ... }
  → patchSession: status = 'recording'
  → recorder.start(clipId)
      → MediaRecorder.start(5s timeslice)
      → per-timeslice: audioRepository.appendChunk(clipId, index, blob)  ← WAL
      → VAD segment recorder fires on each speech segment (≤15 s):
          → POST /api/transcribe → whisperTextRef.current += text
          → patchClip(clipId, { t1Transcript: whisperTextRef.current })  ← T1 written continuously
          → whisperBubbles updated (transient display state — not persisted)
  [if webSpeechEnabled: true]
  → useWebSpeechTranscript.start()  ← Web Speech streaming begins instead
      → per finalized segment: patchClip(clipId, { t1Transcript: accumulatedText })

handleFinishedRecording()
  → recorder.stop() → finalBlob (consolidated from MediaRecorder)
  → segment recorder flushed → patchClip(clipId, { t1Transcript: whisperTextRef.current })  ← T1 final flush
  → audioRepository.save(clipId, finalBlob)           ← consolidated Blob to IDB
  → audioRepository.clearChunks(clipId)               ← WAL purged (best-effort)
  → patchClip(clipId, { status: 'ready', durationSec })
  → patchSession: status = 'draft'
  → [background auto-pass fires] → T2 Whisper transcription begins (see transcription.md)
```

### Stop & finish

`handleStopAndFinish()` calls `handleFinishedRecording()` then triggers the Capture-end pipeline. See [Capture flow — T2 before Curate](#capture-flow-t2-before-curate) for the gating contract: navigation to Curate only happens **after** T2 lands (or the T2-failure dialog resolves), not immediately on stop.

### Pause / resume

`handlePauseResume()` calls `recorder.pause()` / `recorder.resume()` and mirrors the live transcript start/stop. Session and clip status are not changed — the session stays `recording` during a pause.

### Review tab merge

When the user navigates to Review, `buildMergedAudioForReview()` runs:

```
buildMergedAudioForReview()
  → load all ready/transcribed clip blobs from IDB
  → mergeAudioBlobs(blobs) → setMergedAudioBlob   ← used for playback only, not persisted
  → compile best-available transcript per clip:
      transcript ?? t2Transcript ?? t1Transcript
  → patchSession: transcript = compiled, activeTranscriptTier = 't1'
  → setActiveTab('review')
```

The Session page only has two tabs (`record` and `review`). The legacy `clips` tab is gone — clip review is owned by `ClipsDrawer`, a side drawer (≥ 768 px) / bottom sheet (< 768 px) opened from `SessionTopBar`'s "Audio clips" toggle. Jumping from a clip to its place in the transcript calls `transcriptRef.current?.scrollToTimestamp(startOffsetSec)` on `TranscriptPanel` (a `forwardRef` panel that searches for the nearest `[data-ts]` segment and smooth-scrolls it into view). If the transcript pane is collapsed, the inspector expands it first before scrolling.

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

When any of these flags is true and `recorder.status === 'stopped'`, an effect in `useRecordingFlow` fires `handleFinishedRecording()` automatically — the same path as a manual stop. The clip lands in `ready` and the Whisper auto-pass picks it up.

A background visibility warning (`wasBackgrounded`) is a separate sticky flag set by `useRecorder` the first time the tab is hidden during a clip. It surfaces a "verify duration" banner in `Session.tsx` but does not stop recording.

---

## Capture flow — T2 before Curate

**Contract (per [CONTEXT.md §Capture phase](../CONTEXT.md#capture-phase)):** T2 (local Whisper, post-stop, on the combined silence-removed blob) **must complete before the clinician is navigated to Curate**. There is no Curate UI with an in-flight "transcribing…" indicator. Capture is "active" — the system does the work the clinician trusts is happening, then hands them a finished transcript.

The pipeline on Stop / Upload-complete:

1. Consolidate all clips into one combined audio blob (`buildMergedAudioForReview`).
2. Silence-remove and run local Whisper (T2) on that blob.
3. Only when T2 resolves successfully → navigate to Curate.
4. On T2 failure (see below) → show explicit dialog; do not silently fall through.

### T2 failure handling (not-yet-built)

Currently `useBackgroundTranscription` retries up to 8× then surfaces a notification. CONTEXT.md §T2 failure handling specifies a richer end-of-Capture dialog with two paths — **Re-transcribe with cloud AI** (consumes the per-session Nova budget) or **Proceed with live preview as transcript** (T1 fallback with an inline banner). Empty / no-speech-detected is **not** a failure path — clinician is navigated into Curate with an empty editable transcript.

## T2 background transcription

**Owner:** `useBackgroundTranscription` (background `useEffect` on `session.clips`)

Fires automatically for every clip that reaches `status: 'ready'` with no `t2Transcript`, regardless of the configured provider. See [transcription.md — T2 Local Whisper auto-pass](transcription.md#t2--local-whisper-auto-pass-usebackgroundtranscription) for the full write path.

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
      → patchClip: status='transcribed', transcript=nova, t3Transcript=nova
  → buildBestAvailableTranscript(updatedClips)
  → patchSession: transcript=merged, activeTranscriptTier='t3', t3Transcript=merged, status='draft'
  → setBusy(null)
```

`session.t2Transcript` (T2) is **not touched** by this path.

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
| `transcribe` | **1 per session, lifetime** (cloud Nova passes only). The counter is per-Session, persisted with the entity, and is **not** reset by Revert to original, Unlock, page reload, or any other client action. The same counter is consumed by an explicit "Improve with AI" click *and* by a "Re-transcribe with cloud AI" choice from the T2-failure dialog. |
| `generate` | `MAX_GENERATES_PER_SESSION` |

**Demo mode:** Cloud transcription is **hard-disabled**. "Improve with AI" and the T2-failure dialog's cloud option are both unavailable with an explanatory tooltip ("Cloud transcription is disabled in demo mode."). T2 local Whisper and note generation against the real Anthropic Worker remain enabled — see [CONTEXT.md §Demo mode](../CONTEXT.md#demo-mode).

The background T2 Whisper pass bypasses the guard — `useBackgroundTranscription` calls `transcribeWithLocalWhisper` directly and never touches `checkActionGuard`.

## Audio retention

Two-stage automatic retention model defined in [CONTEXT.md §Audio retention](../CONTEXT.md#audio-retention) — pre-Finalize keeps everything; at-Finalize drops per-clip audio + WAL chunks (keeps silenced+combined blob); +14 days drops the combined blob (keeps transcript + Note). After full purge, Improve with AI is no longer available for the session; the Note and locked transcript remain intact.

Today the silenced+combined Blob is computed for playback only and is not persisted. The Finalize prune step requires it to become persistent — a small storage change still to be made.

## Regeneration and Modifiers (not-yet-built)

[CONTEXT.md §Modifier](../CONTEXT.md#modifier) and [§Regeneration](../CONTEXT.md#regeneration) define a curated chip library (tone, emphasis, format) + an optional length-capped Custom-instruction free-text slot, attached to each Regenerate call. After **3 regenerations** in a session, every subsequent regen is preceded by a reflective dialog ("You've regenerated this Note 3 times — what isn't quite right?") whose checkbox + free-text feedback is injected into the next regen's AI prompt. None of this exists in the current code; the present Regenerate path is a straight re-call of `generateNote()` with no modifier injection and no soft-gate.

---

## Whisper live preview (during recording)

**Owner:** `useRecordingFlow` VAD segment recorder

A VAD-gated segment recorder fires on each detected speech segment (Silero VAD, up to 15 s). Each segment blob is sent to `POST /api/transcribe` (Cloudflare Worker → Whisper). The transcribed text serves two purposes simultaneously:

1. **T1 persistence** — appended to `whisperTextRef` and written to `clip.t1Transcript` on every segment. This is the default T1 transcript source.
2. **Live display** — results also update `whisperBubbles: string[]` in the recording panel. Bubbles separated by more than 2 500 ms are appended as new items; results within the gap replace the last bubble (continuous refinement of the current utterance). `whisperBubbles` is transient state — it resets each session and is never written to storage.

The authoritative T2 transcript is produced by the post-clip `transcribeWithLocalWhisper` pass in `useBackgroundTranscription` (local ONNX, no network), not by these live segment chunks.
