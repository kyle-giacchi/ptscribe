# Transcription

How audio becomes text in PTScribe: four independently stored tiers, one active transcript, one denormalized mirror.

## Three-tier model

Every session accumulates transcription data across up to four tiers. Higher tiers produce better text. `activeTranscriptTier` tracks which tier is active; `session.transcript` is always a denormalized copy of that tier's text.

| Tier | Name | Source | When it fires | Quality | Network |
|------|------|--------|---------------|---------|---------|
| **T1** | **Web Speech Captions** | Browser Web Speech API | Streaming **during** recording — written continuously to clip | ~65% — stumbles on medical terms and speaker changes | Browser's own cloud (Google/Apple) — not the PTScribe Worker |
| **T2** | **Local Whisper** | `whisper-tiny.en` ONNX in a Web Worker | **Automatically after** each clip reaches `status: 'ready'` | ~87% — handles medical vocabulary, fully offline | None |
| **T3** | **Nova AI** | Deepgram Nova-3 via Cloudflare Worker | **Explicit user action** ("Transcribe with AI") only | Best — speaker diarization, accent-robust | PTScribe Worker → Deepgram |
| **Edited** | **Manual Edit** | Clinician keyboard input | On user save in the Transcript tab | N/A — human-authored | None |

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
| `t1Transcript?` | T1 | `useRecordingFlow` continuous effect + stop flush | Persisted on every Web Speech segment during recording |
| `t2Transcript?` | T2 | `useBackgroundTranscription` auto-pass | Frozen after Whisper finishes; **never overwritten by T3** |
| `t3Transcript?` | T3 | `useTranscriptionFlow.handleCreateTranscript` | Written by explicit Nova pass |
| `editedTranscript?` | Edited | `useTranscriptionFlow.handleCommitEdit` | Manual edit committed from Transcript tab |
| `transcript?` | active | All write paths | Denormalized mirror of active tier; used by note generation |
| `activeTranscriptTier?` | provenance | All write paths | `'t1'` / `'t2'` / `'t3'` / `'edited'` |

### SessionClip (per recording take)

| Field | Tier | Written by | Notes |
|-------|------|-----------|-------|
| `t1Transcript?` | T1 | `useRecordingFlow` — continuous effect + stop flush | Written live; final flush on `handleFinishedRecording` |
| `t2Transcript?` | T2 | `useBackgroundTranscription` auto-pass | Frozen after Whisper run; never overwritten |
| `t3Transcript?` | T3 | `useTranscriptionFlow.runTranscribeLoop` | Written alongside `transcript`; does not overwrite `t2Transcript` |
| `transcript?` | active | All write paths | Active per-clip transcript; merged to produce `session.transcript` |
| `transcriptChunks?` | T2 | `useBackgroundTranscription` auto-pass | `{ startSec, text }[]` real audio timestamps |

---

## Write paths

### T1 — Web Speech (continuous during recording)

`useWebSpeechTranscript` runs the browser Web Speech API throughout recording. A `useEffect` in `useRecordingFlow` writes `accumulatedText` to `clip.t1Transcript` on every finalized speech segment — a browser crash only loses the current in-progress segment. A final flush runs on `handleFinishedRecording`.

```
per Web Speech segment (during recording):
  webSpeech.accumulatedText changes
    → patchClip(clipId, { t1Transcript: accumulatedText })   ← T1 persisted continuously

handleFinishedRecording():
  → patchClip(clipId, { t1Transcript: accumulatedText })     ← final flush
```

Note: The Whisper live preview (`whisperBubbles`) also runs during recording — it is display-only and never persisted. See [Whisper live preview](workflows.md#whisper-live-preview-during-recording).

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

---

## Key invariants

**T1 is written continuously, not just on stop.** `clip.t1Transcript` is updated on every finalized Web Speech segment during recording. A crash only loses the current in-progress segment. The Whisper live preview bubbles shown in the UI are separate — display-only, never persisted to any tier.

**T2 (Local Whisper) is never overwritten by T3 (Nova).** `session.t2Transcript` and `clip.t2Transcript` are written exclusively by `useBackgroundTranscription`. The T3 write path skips those fields entirely, making "revert to Local Whisper" reliable even after multiple Nova runs.

**`activeTranscriptTier` drives note generation behavior.** `generate.ts` uses `activeTranscriptTier === 't2' || 't3'` to decide whether to include speaker-context diarization sections in the AI prompt. T1 and edited tiers do not trigger diarization.

**The T2 background auto-pass fires for every clip regardless of provider setting.** It runs automatically after any clip reaches `ready`. Do not gate it behind a provider check.

**Existing sessions with only `transcript` (pre-v18) are shown under "Legacy transcript" in the Admin page.** Tier origin cannot be determined retroactively. Their `t1/t2/t3Transcript` fields are absent.

---

## Revert to local (T2)

The revert button in the Transcript tab is visible when `session.t2Transcript` exists (exposed as `hasT2Transcript` prop to `TranscriptPanel`). On click, `useTranscriptionFlow` resets `session.transcript` and `session.activeTranscriptTier` to the T2 values without touching `session.t3Transcript` — T3 remains frozen and available.

---

## Schema version

The four-tier field model was introduced in **AppData v18** (migration `migrateV17ToV18`). All four tier fields (`t1Transcript`, `t2Transcript`, `t3Transcript`, `editedTranscript`) are optional and default to absent. `TranscriptTier` (`'t1'` / `'t2'` / `'t3'` / `'edited'`) replaced the old `TranscriptSource` type. `activeTranscriptTier` replaced `transcriptSource`.

---

## Admin page (`/admin`)

A power-user diagnostic view of all sessions and their transcription tier coverage. Accessible via the Terminal icon in the sidebar user block.

**Stats row:** total session count + how many sessions have T1 / T2 / T3 / Edited data.

**Session list:** sorted newest-first; each row shows patient name, date, clip count, and T1/T2/T3/Edited presence badges. Expand a row to read the full text of each available tier. A nested `<details>` element shows per-clip word counts by tier.

Sessions with only a legacy `transcript` (pre-v18) show it under a "Legacy transcript" label since tier origin cannot be determined retroactively.
