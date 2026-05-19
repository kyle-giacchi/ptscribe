# Transcription

How audio becomes text in PTScribe: four independently stored tiers, one active transcript, one denormalized mirror.

## Three-tier model

Every session accumulates transcription data across up to four tiers. Higher tiers produce better text. `activeTranscriptTier` tracks which tier is active; `session.transcript` is always a denormalized copy of that tier's text.

| Tier | Name | Source | When it fires | Quality | Network |
|------|------|--------|---------------|---------|---------|
| **T1** | **Whisper VAD Segments** | VAD-gated segment recorder → POST /api/transcribe (Cloudflare Whisper) | Each VAD-detected speech segment **during** recording; flushed on pause and stop | ~85% — same Whisper model as T2; handles medical vocabulary | PTScribe Worker → Cloudflare Workers AI |
| **T2** | **Local Whisper** | `whisper-tiny.en` ONNX in a Web Worker | **Automatically after** each clip reaches `status: 'ready'` | ~87% — handles medical vocabulary, fully offline | None |
| **T3** | **Nova AI** | Deepgram Nova-3 via Cloudflare Worker | **Explicit user action** ("Transcribe with AI") only | Best — speaker diarization, accent-robust | PTScribe Worker → Deepgram |
| **Edited** | **Manual Edit** | Clinician keyboard input | On user save in the Transcript tab | N/A — human-authored | None |

**Web Speech API (opt-in alternative for T1):** When the user enables "Web Speech" in Settings → Recording (`webSpeechEnabled: true`), the browser Web Speech API replaces Whisper VAD segments as the T1 source. Quality is lower (~65%) but fires with zero network cost. Disabled by default.

**Active tier set automatically at each write:**

```
editedTranscript present → activeTranscriptTier: 'edited'
t3Transcript present     → activeTranscriptTier: 't3'
t2Transcript present     → activeTranscriptTier: 't2'
t1Transcript present     → activeTranscriptTier: 't1'
```

---

## Data fields

### Session (merged, session-level)

| Field | Tier | Written by | Notes |
|-------|------|-----------|-------|
| `t1Transcript?` | T1 | `useRecordingFlow` continuous effect + pause/stop flush | Persisted on every Whisper VAD segment during recording (or every Web Speech segment when `webSpeechEnabled`) |
| `t2Transcript?` | T2 | `useBackgroundTranscription` auto-pass | Frozen after Whisper finishes; **never overwritten by T3** |
| `t3Transcript?` | T3 | `useTranscriptionFlow.handleCreateTranscript` | Written by explicit Nova pass |
| `editedTranscript?` | Edited | `Session.handleApplyScrub` (PII scrub) or `TranscriptPanel.onCommit` (manual edit) | Written by PII scrub or direct user edit; cleared automatically when a T2 or T3 write lands |
| `transcript?` | active | All write paths | Denormalized mirror of active tier; used by note generation |
| `activeTranscriptTier?` | provenance | All write paths | `'t1'` / `'t2'` / `'t3'` / `'edited'` |

### SessionClip (per recording take)

| Field | Tier | Written by | Notes |
|-------|------|-----------|-------|
| `t1Transcript?` | T1 | `useRecordingFlow` — continuous effect + pause/stop flush | Written on each Whisper VAD segment during recording; final flush on pause or stop |
| `t2Transcript?` | T2 | `useBackgroundTranscription` auto-pass | Frozen after Whisper run; never overwritten |
| `t3Transcript?` | T3 | `useTranscriptionFlow.runTranscribeLoop` | Written alongside `transcript`; does not overwrite `t2Transcript` |
| `transcript?` | active | All write paths | Active per-clip transcript; merged to produce `session.transcript` |
| `transcriptChunks?` | T2 | `useBackgroundTranscription` auto-pass | `{ startSec, text }[]` real audio timestamps |

---

## Write paths

### T1 — Whisper VAD segments (default, continuous during recording)

A VAD-gated segment recorder runs alongside the main MediaRecorder. Each time Silero VAD detects a speech segment (up to 15 s), the audio blob is sent to `POST /api/transcribe`. The returned text is appended to `whisperTextRef` and immediately persisted to `clip.t1Transcript`. On pause or stop the final accumulated text is flushed.

```
per VAD-gated segment (during recording):
  segment recorder emits audio blob
    → POST /api/transcribe (Cloudflare Worker → Whisper)
    → whisperTextRef.current += result.text
    → patchClip(clipId, { t1Transcript: whisperTextRef.current })   ← T1 persisted continuously

on pause or handleFinishedRecording():
  → patchClip(clipId, { t1Transcript: whisperTextRef.current })     ← final flush
```

The `whisperBubbles` state displayed in the recording panel is sourced from the same segment-recorder chunks but is transient UI state — it resets on each render cycle and is never written to storage. See [Whisper live preview](workflows.md#whisper-live-preview-during-recording).

**Web Speech API alternative (opt-in):** When `webSpeechEnabled: true` (Settings → Recording), `useWebSpeechTranscript` runs instead. On each finalized speech segment its `accumulatedText` is written to `clip.t1Transcript`; a final flush runs on `handleFinishedRecording`. Web Speech quality is lower (~65%) but requires no PTScribe network beyond the browser's own cloud.

### T2 — Local Whisper auto-pass (`useBackgroundTranscription`)

Fires automatically for every clip that reaches `status: 'ready'` with no `t2Transcript`. Runs regardless of the configured transcription provider.

```
clip → audioRepository.load(clip.id)
     → transcribeWithLocalWhisper()    // 2-min chunks + VAD per chunk + parallel Whisper
     → patchClip(clip.id, {
         status: 'transcribed',
         transcript: result.text,
         t2Transcript: result.text,     // T2 frozen here — never overwritten
         transcriptChunks: result.chunks,
       })
     → buildBestAvailableTranscript(freshClips)   // t2Transcript > t1Transcript per clip
     → patchSession({
         transcript: merged,
         activeTranscriptTier: 't2',
         t2Transcript: merged,           // T2 session snapshot frozen here
       })

On failure → falls back to T1:
     → buildBestAvailableTranscript(clips)         // t1Transcript per clip
     → patchSession({
         transcript: t1Fallback,
         activeTranscriptTier: 't1',
       })
```

### T3 — Explicit Nova pass (`useTranscriptionFlow.handleCreateTranscript`)

Only fires when the user explicitly triggers "Transcribe with AI."

```
clip → audioRepository.load(clip.id)
     → optional: trimSilence() + speedUpAudio()
     → POST /api/transcribe (Cloudflare Worker → Deepgram Nova-3)
     → patchClip(clip.id, {
         status: 'transcribed',
         transcript: result.text,
         t3Transcript: result.text,     // T3 frozen here
         transcriptChunks: undefined,   // Nova replaces chunk structure
       })
     → buildBestAvailableTranscript(updatedClips)
     → patchSession({
         transcript: merged,
         activeTranscriptTier: 't3',
         t3Transcript: merged,           // T3 session snapshot frozen here
         status: 'draft',
       })
     // t2Transcript is NOT touched — T2 preserved for revert
```

### Edited tier — manual edits and PII scrub

Two actions in `Session.tsx` write `editedTranscript` and set `activeTranscriptTier: 'edited'`:

**Manual edit:** User edits text directly in `TranscriptPanel`. On `onCommit`:
```
patchSession({ editedTranscript: value, activeTranscriptTier: 'edited' })
```
If the user clears the field, `editedTranscript` is set to `undefined` (drops back to the previous tier).

**PII scrub:** User clicks "Scrub PII". After the local NER model runs, `handleApplyScrub(scrubbed)`:
```
setEditedTranscript(scrubbed)
patchSession({ editedTranscript: scrubbed, activeTranscriptTier: 'edited' })
```

In both cases `session.transcript` is **not** directly updated by the edited write path. `Session.tsx` derives `effectiveTranscript = editedTranscript.trim() ? editedTranscript : transcript` for display and note generation.

---

## Key invariants

**T1 is written continuously, not just on stop.** `clip.t1Transcript` is updated on every completed Whisper VAD segment during recording. A crash only loses the current in-flight segment. The `whisperBubbles` display in the recording panel draws from the same chunks but is transient UI state — never written to storage. When Web Speech is enabled (`webSpeechEnabled: true`), it writes T1 instead, with the same continuous-update guarantee.

**T2 (Local Whisper) is never overwritten by T3 (Nova).** `session.t2Transcript` and `clip.t2Transcript` are written exclusively by `useBackgroundTranscription`. The T3 write path skips those fields entirely, making "Revert to Draft" reliable even after multiple Nova runs.

**T2 and T3 writes clear `editedTranscript`.** When `useTranscriptionFlow` completes a T2 auto-pass or a T3 Nova pass it sets `editedTranscript: undefined` in persisted state and resets the `editedTranscript` local state in `Session.tsx`. This prevents manual edits or PII-scrub output from ghosting over a fresh transcription.

**`activeTranscriptTier` drives note generation behavior.** `generate.ts` uses `activeTranscriptTier === 't2' || 't3'` to decide whether to include speaker-context diarization sections in the AI prompt. T1 and edited tiers do not trigger diarization.

**The T2 background auto-pass fires for every clip regardless of provider setting.** It runs automatically after any clip reaches `ready`. Do not gate it behind a provider check.

**Existing sessions with only `transcript` (pre-v18) are shown under "Legacy transcript" in the Admin page.** Tier origin cannot be determined retroactively. Their `t1/t2/t3Transcript` fields are absent.

---

## Revert actions

There are two independent revert actions in the Transcript tab:

**Revert to Draft (T2):** Visible when `session.t2Transcript` exists (`hasT2Transcript` prop to `TranscriptPanel`). On click, `useTranscriptionFlow` resets `session.transcript` and `session.activeTranscriptTier` to the T2 values without touching `session.t3Transcript` — T3 remains frozen and available. Also clears `editedTranscript`.

**Revert edits:** Visible when `editedTranscript` is non-empty (`hasUserEdits` prop to `TranscriptPanel`). On click, `handleRevertEdits` in `Session.tsx` runs:
```
setEditedTranscript('')
patchSession({ editedTranscript: undefined })
```
This drops display back to whichever T1/T2/T3 tier was active before the edit or scrub, without modifying any tier field.

---

## Schema version

The four-tier field model was introduced in **AppData v18** (migration `migrateV17ToV18`). All four tier fields (`t1Transcript`, `t2Transcript`, `t3Transcript`, `editedTranscript`) are optional and default to absent. `TranscriptTier` (`'t1'` / `'t2'` / `'t3'` / `'edited'`) replaced the old `TranscriptSource` type. `activeTranscriptTier` replaced `transcriptSource`.

**AppData v19** (migration `migrateV18ToV19`) added `webSpeechEnabled: false` to `SessionWorkflowSettings`. This is the gate that demotes Web Speech API from the default T1 source to an opt-in. Existing users land on `false` (Whisper VAD segments as T1 default).

---

## Admin page (`/admin`)

A power-user diagnostic view of all sessions and their transcription tier coverage. Accessible via the Terminal icon in the sidebar user block.

**Stats row:** total session count + how many sessions have T1 / T2 / T3 / Edited data.

**Session list:** sorted newest-first; each row shows patient name, date, clip count, and T1/T2/T3/Edited presence badges. Expand a row to read the full text of each available tier. A nested `<details>` element shows per-clip word counts by tier.

Sessions with only a legacy `transcript` (pre-v18) show it under a "Legacy transcript" label since tier origin cannot be determined retroactively.
