# Transcription

How audio becomes text in PTScribe: three tiers, one active transcript, independent storage per tier.

## Three-tier model

Every session accumulates transcription data across up to three independently stored tiers. Higher tiers produce better text. The active transcript (`session.transcript`) always holds the highest tier that exists.

| Tier | Name | Source | When it fires | Quality | Network |
|------|------|--------|---------------|---------|---------|
| **T1** | **Live Browser Transcription** | Browser Speech Recognition API | Streaming, **during** recording | ~65% — stumbles on medical terms and speaker changes | Browser's own cloud (Google/Apple) — not the PTScribe Worker |
| **T2** | **Whisper Local Transcription** | `whisper-tiny.en` ONNX in a Web Worker | **Automatically after** each clip is saved (`status: 'ready'`) | ~87% — handles medical vocabulary, fully offline | None |
| **T3** | **Nova AI Transcription** | Deepgram Nova-3 via Cloudflare Worker | **Explicit user action** ("Transcribe with AI") only | Best — speaker diarization, accent-robust | PTScribe Worker → Deepgram |

**Priority rule applied at every write:**
```
session.transcript = session.aiTranscript ?? session.localTranscript ?? session.liveTranscript
```

---

## Data fields

### Session (merged, session-level)

| Field | Tier | Written by | Notes |
|-------|------|-----------|-------|
| `liveTranscript?` | T1 | Recorder / live capture | Merged from `clip.liveTranscript` as each clip ends |
| `localTranscript?` | T2 | `useTranscriptionFlow` auto-pass | Frozen after Whisper finishes; **never overwritten by Nova** |
| `aiTranscript?` | T3 | `useTranscriptionFlow` explicit action | Written by `handleCreateTranscript` (Nova pass) |
| `transcript?` | best | Both auto-pass and explicit | Always set to highest tier; used by note generation |
| `transcriptSource?` | provenance | Both | `'webspeech'` / `'whisper'` / `'nova'` / `'manual'` |

### SessionClip (per recording take)

| Field | Tier | Written by | Notes |
|-------|------|-----------|-------|
| `liveTranscript?` | T1 | Recorder during recording | Raw per-clip Web Speech output |
| `localTranscript?` | T2 | Background auto-pass | Frozen after Whisper run; source for `handleRevertToLocal` |
| `aiTranscript?` | T3 | `runTranscribeLoop` when `useNova = true` | Written alongside `transcript` — does not overwrite `localTranscript` |
| `transcript?` | best | Both | Active per-clip transcript; merged to produce `session.transcript` |
| `transcriptChunks?` | T2 | Background auto-pass | `{ startSec, text }[]` real timestamps; cleared when Nova runs |

---

## Write paths

### T2 background auto-pass (`useTranscriptionFlow:445`)

Fires for every clip that reaches `status: 'ready'` with no `localTranscript`. Runs regardless of the configured transcription provider (see [invariants.md — Local-first transcription](invariants.md#local-first-transcription)).

```
clip → audioRepository.load(clip.id)
     → transcribeLocalChunked()   // VAD + chunked Whisper
     → patchClip(clip.id, {
         status: 'transcribed',
         transcript: result.text,
         localTranscript: result.text,   // T2 frozen here
         transcriptChunks: result.chunks,
       })
     → mergeClipTranscripts(freshClips)
     → patchSession({
         transcript: merged,
         transcriptSource: 'whisper',
         localTranscript: merged,         // T2 session snapshot frozen here
       })
```

### T3 explicit Nova pass (`handleCreateTranscript`)

Only fires when the user explicitly triggers "Transcribe with AI." Runs `runTranscribeLoop` with `useNova = true`.

```
clip → audioRepository.load(clip.id)
     → optional: trimSilence() + speedUpAudio()
     → POST /api/transcribe (Cloudflare Worker → Nova-3)
     → patchClip(clip.id, {
         status: 'transcribed',
         transcript: result.text,
         aiTranscript: result.text,       // T3 frozen here
         transcriptChunks: undefined,     // Nova replaces chunk structure
       })
     → mergeClipTranscripts(updatedClips)
     → patchSession({
         transcript: merged,
         transcriptSource: 'nova',
         aiTranscript: merged,            // T3 session snapshot frozen here
         status: 'draft',
       })
     // localTranscript is NOT touched — T2 is preserved
```

---

## Key invariants

**T2 (Whisper Local) is never overwritten by T3 (Nova AI).** `session.localTranscript` and `clip.localTranscript` are only ever written by the Whisper auto-pass. The Nova write path skips those fields entirely. This makes "revert to Whisper Local" reliable even after multiple Nova runs.

**T1 (Live Browser) is never used as the active transcript source unless T2 and T3 are absent.** `session.liveTranscript` is always written, but `session.transcript` is only set to it via the priority rule when neither `localTranscript` nor `aiTranscript` exist.

**`transcriptSource: 'whisper'` = T2 (Whisper Local); `transcriptSource: 'nova'` = T3 (Nova AI).** Nova correctly stamps `'nova'` (not `'whisper'`) so the source is always accurate.

**The background auto-pass fires for every clip regardless of provider setting.** See [invariants.md — Local-first transcription](invariants.md#local-first-transcription). Do not gate it behind a provider check.

**Existing sessions have `localTranscript: undefined` and `aiTranscript: undefined`.** Added in schema v17 migration. Their `session.transcript` value was the best available at time of last write — it is preserved as-is and displayed under the "Legacy transcript" label in the Admin page.

---

## Revert to local

`handleRevertToLocal` (in `useTranscriptionFlow`) reads `session.localTranscript` directly when available, falling back to re-merging from `clip.localTranscript` per clip. The operation resets `session.transcript` and `session.transcriptSource` to the T2 (Whisper Local) values without touching `session.aiTranscript` (which remains frozen and can be re-applied later).

---

## Schema version

Tier fields were added in **AppData v17** (migration `migrateV16ToV17`). All three new fields (`Session.localTranscript`, `Session.aiTranscript`, `SessionClip.aiTranscript`) are optional and default to absent. `TranscriptSource` gained `'nova'` as a valid value in the same migration.

---

## Admin page (`/admin`)

A power-user diagnostic view of all sessions and their transcription tier coverage. Accessible via the Terminal icon in the sidebar user block.

**Stats row:** total session count + how many sessions have T1 / T2 / T3 data.

**Session list:** sorted newest-first; each row shows patient name, date, clip count, and T1/T2/T3 presence badges. Expand a row to read the full text of each available tier. A nested `<details>` element shows per-clip word counts by tier.

Sessions with only a legacy `transcript` (pre-v17) show it under a "Legacy transcript" label since the tier origin cannot be determined retroactively.
