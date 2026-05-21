import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useNotes } from '@/contexts/NotesProvider';
import { useNotifications } from '@/contexts/NotificationsProvider';
import { audioRepository } from '@/services/AudioRepository';
import { mergeAudioBlobs } from '@/lib/audio/merge';
import { trimSilence } from '@/lib/audio/silenceTrim';
import {
  transcribeLocally,
  preloadLocalWhisper,
  LOCAL_WHISPER_DEFAULT_MODEL,
} from '@/services/ai/client/localWhisper';
import { MAX_AUDIO_BYTES } from '@/lib/audioLimits';
import { generateNote } from '@/services/ai/generate';
import { transcribe } from '@/services/ai/transcribe';
import { AiCallError, friendlyAiError } from '@/services/ai/errors';
import { speedUpAudio, type SpeedFactor } from '@/lib/audio/timeStretch';
import { newId } from '@/utils/ids';
import { useActionGuard } from './useActionGuard';
import { useBackgroundTranscription } from './useBackgroundTranscription';
import { sessionMachineReducer } from './sessionMachine/reducer';
import {
  initialSessionMachineState,
  type SessionMachineState,
  type UploadStatus,
} from './sessionMachine/types';
import type { UseRecorder } from './useRecorder';
import type { UseWebSpeechTranscript } from './useLiveTranscript';
import type {
  Note,
  NoteFormat,
  NoteSection,
  NoteTemplate,
  Patient,
  Session,
  SessionClip,
  Settings,
} from '@/types';

export interface UseSessionMachineParams {
  session: Session | undefined;
  patient: Patient | undefined;
  note: Note | undefined;
  template: NoteTemplate | undefined;
  settings: Settings;
  transcript: string;
  recorder: UseRecorder;
  webSpeech: UseWebSpeechTranscript;
  webSpeechEnabled: boolean;
  /**
   * When set, overrides `settings.ai.transcription.provider` for this session only.
   * `'webspeech'` forces Web Speech captions even if the user's default is Local Whisper;
   * `'none'` suppresses live transcription entirely (record-now, transcribe-later);
   * `null`/`undefined` falls back to `webSpeechEnabled`.
   */
  transcriptionProviderOverride?: 'webspeech' | 'none' | null;
  sortedClips: SessionClip[];
  patchSession: (patch: Partial<Session>) => void;
  patchClips: (mapper: (clips: SessionClip[]) => SessionClip[]) => void;
  patchClip: (clipId: string, patch: Partial<SessionClip>) => void;
  setTranscript: (next: string) => void;
  setEditedTranscript?: (next: string) => void;
  setError: (msg: string | null) => void;
  setBusy: (busy: 'transcribing' | 'generating' | null) => void;
  setActiveTab: (tab: 'record' | 'review') => void;
}

export interface SessionMachineGenerateApi {
  run: () => Promise<void>;
  finalize: () => void;
  unfinalize: () => void;
  sectionChange: (key: string, body: string) => void;
  replaceSections: (sections: NoteSection[]) => void;
  copyMarkdown: (markdown: string) => void;
  clearAiError: () => void;
  missingRequiredLabels: string[];
}

export interface SessionMachineTranscribeApi {
  run: (clipId?: string) => Promise<void>;
  revertToLocal: () => void;
  clearAiError: () => void;
  mergedAudioBlob: Blob | null;
  setMergedAudioBlob: (b: Blob | null) => void;
  silencedMergedBlob: Blob | null;
  setSilencedMergedBlob: (b: Blob | null) => void;
  isMerging: boolean;
  setIsMerging: (v: boolean) => void;
}

export interface SessionMachineActionGuardApi {
  checkActionGuard: ReturnType<typeof useActionGuard>['checkActionGuard'];
  recordAction: ReturnType<typeof useActionGuard>['recordAction'];
  transcribeUsed: number;
  generateUsed: number;
}

export interface SessionMachineCaptureApi {
  backgroundWarningDismissed: boolean;
  setBackgroundWarningDismissed: (v: boolean) => void;
  whisperBubbles: string[];
  uploadStatus: UploadStatus;
  handleStartRecording: () => Promise<void>;
  handleFinishedRecording: () => Promise<void>;
  handlePauseResume: () => void;
  handleStopAndFinish: () => void;
  handleUploadAudio: (file: File) => Promise<string | null>;
  handleDeleteClip: (clipId: string) => Promise<void>;
  buildMergedAudioForReview: () => Promise<void>;
}

export interface SessionMachine {
  state: SessionMachineState;
  generate: SessionMachineGenerateApi;
  transcribe: SessionMachineTranscribeApi;
  capture: SessionMachineCaptureApi;
  actionGuard: SessionMachineActionGuardApi;
}

/**
 * Session lifecycle machine.
 *   PR 2A: generation phase (note draft → finalize)
 *   PR 2B: transcription phase (cloud Nova + auto local Whisper + revert)
 *   PR 2C: recording phase (clips, merged-blob production)
 *
 * Phase + transient AI surface live in the reducer (pure, no React).
 * Async side effects — provider calls, toasts, repository writes, abort
 * timers, status patches on the underlying `Session` — live in runners
 * that dispatch into it. Slot-style state (Blob refs, isMerging flag)
 * stays as useState because it isn't a lifecycle transition.
 *
 */
export function useSessionMachine(params: UseSessionMachineParams): SessionMachine {
  const {
    session,
    patient,
    note,
    template,
    settings,
    transcript,
    recorder,
    webSpeech,
    webSpeechEnabled: settingsWebSpeechEnabled,
    transcriptionProviderOverride,
    sortedClips,
    patchSession,
    patchClips,
    patchClip,
    setTranscript,
    setEditedTranscript,
    setError,
    setBusy,
    setActiveTab,
  } = params;

  // Resolve the effective Web Speech state for this recording session. The
  // override is in-memory only — it never mutates persisted settings, so the
  // user's default provider stays unchanged after the session ends.
  const webSpeechEnabled =
    transcriptionProviderOverride === 'webspeech'
      ? true
      : transcriptionProviderOverride === 'none'
        ? false
        : settingsWebSpeechEnabled;

  const { addNote, updateNote, finalizeNote, unfinalizeNote } = useNotes();
  const { addNotification } = useNotifications();
  const [state, dispatch] = useReducer(sessionMachineReducer, initialSessionMachineState);

  // ── Slot state (not lifecycle) ──────────────────────────────────────────
  const [mergedAudioBlob, setMergedAudioBlob] = useState<Blob | null>(null);
  const [silencedMergedBlob, setSilencedMergedBlob] = useState<Blob | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  const { checkActionGuard, recordAction, transcribeUsed, generateUsed } = useActionGuard();

  // Background local-Whisper pass — auto-fires when silencedMergedBlob is
  // produced by the recording flow.
  useBackgroundTranscription({ session, patchSession, setTranscript, silencedMergedBlob });

  // ── Capture slice (recording lifecycle) ─────────────────────────────────
  const [backgroundWarningDismissed, setBackgroundWarningDismissed] = useState(false);
  const [whisperBubbles, setWhisperBubbles] = useState<string[]>([]);
  const uploadStatus = state.capture.uploadStatus;

  // Sync ref so processWhisperChunk can persist t1Transcript without waiting for state.
  const whisperTextRef = useRef<string[]>([]);

  // Always-current ref so the live-transcript callback reads the latest duration.
  const durationSecRef = useRef(0);
  durationSecRef.current = recorder.durationSec;

  // Tracks the clip currently being recorded, so stop() knows which clip to update.
  const activeClipIdRef = useRef<string | null>(null);

  // Leaky-bucket: at most one Whisper job runs at a time.
  const whisperRunningRef = useRef(false);
  const whisperPendingRef = useRef<Blob | null>(null);
  const whisperChainPromiseRef = useRef<Promise<void>>(Promise.resolve());

  // Prevents concurrent saves for the same clipId from corrupting each other mid-encryption.
  const isSavingRef = useRef<Set<string>>(new Set());

  // Used by the auto-stop finalization effect below to always call the latest
  // handleFinishedRecording without including it in the effect's dep array.
  const handleFinishedRecordingRef = useRef<() => Promise<void>>(async () => {});
  // Same pattern for buildMergedAudioForReview so handleStopAndFinish can defer
  // the merge until after React commits the patchClip({status:'ready'}) update.
  const buildMergedAudioForReviewRef = useRef<() => Promise<void>>(async () => {});
  // Guards against calling finalization twice for the same auto-stop event.
  const autoStopFinalizedRef = useRef(false);

  // Auto-clear terminal upload states after 3 s.
  useEffect(() => {
    if (uploadStatus.phase !== 'done' && uploadStatus.phase !== 'error') return;
    const t = window.setTimeout(
      () => dispatch({ type: 'capture/upload', status: { phase: 'idle', message: '' } }),
      3000,
    );
    return () => window.clearTimeout(t);
  }, [uploadStatus.phase]);

  // Warm up the Whisper worker + model as soon as the session mounts.
  useEffect(() => {
    preloadLocalWhisper();
  }, []);

  // Re-arm the dismiss flag every time a new recording starts.
  useEffect(() => {
    if (recorder.status !== 'recording') return;
    const id = window.setTimeout(() => setBackgroundWarningDismissed(false), 0);
    return () => window.clearTimeout(id);
  }, [recorder.status]);

  // When Web Speech is enabled, persist live captions to t1Transcript continuously.
  useEffect(() => {
    if (!webSpeechEnabled) return;
    const clipId = activeClipIdRef.current;
    if (!clipId || !webSpeech.accumulatedText.trim()) return;
    patchClip(clipId, { t1Transcript: webSpeech.accumulatedText.trim() });
    // patchClip uses functional updates and activeClipIdRef is a stable ref — safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSpeech.accumulatedText, webSpeechEnabled]);

  // ── Live Whisper chunk processing (leaky-bucket) ─────────────────────────
  async function processWhisperChunk(): Promise<void> {
    const blob = whisperPendingRef.current;
    if (!blob) {
      whisperRunningRef.current = false;
      return;
    }
    whisperPendingRef.current = null;
    try {
      const result = await transcribeLocally(blob, LOCAL_WHISPER_DEFAULT_MODEL);
      const text = result.text.trim();
      if (text) {
        whisperTextRef.current = [...whisperTextRef.current, text];
        setWhisperBubbles(whisperTextRef.current);
        const clipId = activeClipIdRef.current;
        if (clipId) patchClip(clipId, { t1Transcript: whisperTextRef.current.join(' ') });
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[useSessionMachine] Whisper live-preview chunk failed:', err);
      }
    }
    if (whisperPendingRef.current) {
      return processWhisperChunk();
    } else {
      whisperRunningRef.current = false;
    }
  }

  function handleChunk(blob: Blob) {
    whisperPendingRef.current = blob;
    if (whisperRunningRef.current) return;
    whisperRunningRef.current = true;
    whisperChainPromiseRef.current = processWhisperChunk();
  }

  // ── Recording controls ───────────────────────────────────────────────────
  async function handleStartRecording() {
    setError(null);
    if (!session) return;

    const clipId = newId();
    const now = Date.now();
    activeClipIdRef.current = clipId;
    patchClips((clips) => [
      ...clips,
      {
        id: clipId,
        index: clips.length,
        durationSec: 0,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    patchSession({ status: 'recording' });

    setWhisperBubbles([]);
    whisperTextRef.current = [];
    whisperPendingRef.current = null;
    // 'none' override means record-now-transcribe-later: skip the live Whisper
    // preview pipeline so no chunks are sent to the (possibly unavailable) worker.
    recorder.onChunk.current =
      transcriptionProviderOverride === 'none' ? null : handleChunk;

    const ok = await recorder.start(clipId);
    if (!ok) {
      activeClipIdRef.current = null;
      patchClips((clips) => clips.filter((c) => c.id !== clipId));
      patchSession({ status: 'draft' });
      toast.error(
        'Could not access microphone. Check that microphone permission is granted in your browser settings.',
      );
      return;
    }

    if (webSpeechEnabled && webSpeech.supported) {
      webSpeech.reset();
      webSpeech.start(() => durationSecRef.current);
    }
  }

  async function handlePauseResumeAsync() {
    if (recorder.status === 'recording') {
      recorder.pause();
      if (webSpeechEnabled) webSpeech.stop();
      // Drain any in-flight Whisper work so the result appears as a bubble before pausing.
      await whisperChainPromiseRef.current;
      if (whisperPendingRef.current && !whisperRunningRef.current) {
        whisperRunningRef.current = true;
        await (whisperChainPromiseRef.current = processWhisperChunk());
      }
      const clipId = activeClipIdRef.current;
      if (clipId && whisperTextRef.current.length > 0) {
        patchClip(clipId, { t1Transcript: whisperTextRef.current.join(' ') });
      }
      const prevT1Texts = sortedClips
        .filter((c) => c.id !== clipId)
        .map((c) => c.t1Transcript?.trim())
        .filter((t): t is string => Boolean(t));
      const currentT1 = whisperTextRef.current.join(' ').trim();
      const allT1Texts = [...prevT1Texts, ...(currentT1 ? [currentT1] : [])];
      if (allT1Texts.length > 0) {
        patchSession({ t1Transcript: allT1Texts.join('\n\n') });
      }
    } else if (recorder.status === 'paused') {
      recorder.resume();
      // Re-wire with the freshest handleChunk closure so post-resume Whisper
      // segments capture the latest patchClip and whisperTextRef state.
      recorder.onChunk.current =
        transcriptionProviderOverride === 'none' ? null : handleChunk;
      if (webSpeechEnabled && webSpeech.supported) webSpeech.start(() => durationSecRef.current);
    }
  }

  function handlePauseResume() {
    void handlePauseResumeAsync();
  }

  async function handleFinishedRecording() {
    if (!session) return;
    const clipId = activeClipIdRef.current;

    // Stop accepting new chunks immediately, then drain any in-flight Whisper
    // work so the last spoken segment's transcription lands before we clear clipId.
    recorder.onChunk.current = null;
    if (whisperRunningRef.current) {
      await whisperChainPromiseRef.current;
    }
    if (whisperPendingRef.current && !whisperRunningRef.current) {
      whisperRunningRef.current = true;
      await (whisperChainPromiseRef.current = processWhisperChunk());
    }
    whisperPendingRef.current = null;

    activeClipIdRef.current = null;

    const finalBlob = await recorder.stop();
    const durationSec = recorder.durationSec;
    webSpeech.stop();

    if (clipId) {
      if (finalBlob) {
        if (navigator?.storage?.estimate) {
          try {
            const est = await navigator.storage.estimate();
            const available = (est.quota ?? 0) - (est.usage ?? 0);
            if (available > 0 && finalBlob.size > available * 0.9) {
              patchClip(clipId, {
                status: 'failed',
                errorMessage: 'Not enough device storage to save this recording.',
              });
              return;
            }
            if (available > 0 && finalBlob.size > available * 0.8) {
              addNotification(
                'warning',
                'Device storage is low — this recording may not save completely.',
              );
            }
          } catch {
            /* Estimate unavailable — proceed with save. */
          }
        }
        if (isSavingRef.current.has(clipId)) {
          if (import.meta.env.DEV) {
            console.warn(`[useSessionMachine] Skipping duplicate save for clip ${clipId}`);
          }
          return;
        }
        isSavingRef.current.add(clipId);
        try {
          await audioRepository.save(clipId, finalBlob);
        } catch (e) {
          setError(`Could not save audio: ${(e as Error).message}`);
          patchClip(clipId, {
            status: 'failed',
            errorMessage: (e as Error).message,
          });
          return;
        } finally {
          isSavingRef.current.delete(clipId);
        }
        audioRepository.clearChunks(clipId).catch((e) => {
          if (import.meta.env.DEV) {
            console.warn('[useSessionMachine] clearChunks failed:', e);
          }
        });
        patchClip(clipId, { status: 'ready', durationSec });
      } else {
        try {
          await audioRepository.remove(clipId);
        } catch {
          /* ignore */
        }
        patchClips((clips) =>
          clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })),
        );
      }
    }

    const webSpeechT1 = webSpeechEnabled && clipId ? webSpeech.accumulatedText.trim() : '';
    const whisperT1 = whisperTextRef.current.join(' ').trim();
    const currentClipT1 = webSpeechT1 || whisperT1;

    if (webSpeechEnabled && clipId && webSpeechT1) {
      patchClip(clipId, { t1Transcript: webSpeechT1 });
    }
    webSpeech.reset();
    whisperTextRef.current = [];

    const prevT1Texts = sortedClips
      .filter((c) => c.id !== clipId)
      .map((c) => c.t1Transcript?.trim())
      .filter((t): t is string => Boolean(t));
    const allT1Texts = [...prevT1Texts, ...(currentClipT1 ? [currentClipT1] : [])];
    patchSession({
      status: 'draft',
      ...(allT1Texts.length > 0 ? { t1Transcript: allT1Texts.join('\n\n') } : {}),
    });
  }

  function handleStopAndFinish() {
    // buildMergedAudioForReview produces silencedMergedBlob (which triggers T2)
    // and sets activeTab to 'review' itself. Defer via setTimeout(0) so React
    // commits the patchClip({status:'ready'}) update inside handleFinishedRecording
    // before the merge reads sortedClips — otherwise the just-recorded clip is
    // still 'pending' in the captured closure and gets filtered out.
    void handleFinishedRecording().then(() => {
      setTimeout(() => void buildMergedAudioForReviewRef.current(), 0);
    });
  }

  // ── Audio upload ─────────────────────────────────────────────────────────
  async function handleUploadAudio(file: File): Promise<string | null> {
    if (file.size > MAX_AUDIO_BYTES) {
      dispatch({
        type: 'capture/upload',
        status: { phase: 'error', message: 'File too large — max 25 MB.' },
      });
      return null;
    }
    if (file.type && !/^(audio|video)\//.test(file.type)) {
      dispatch({
        type: 'capture/upload',
        status: { phase: 'error', message: 'Please upload an audio or video file.' },
      });
      return null;
    }

    const clipId = newId();
    const now = Date.now();
    patchClips((clips) => [
      ...clips,
      {
        id: clipId,
        index: clips.length,
        durationSec: 0,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    dispatch({
      type: 'capture/upload',
      status: { phase: 'reading', message: 'Reading file…' },
    });
    try {
      const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/mpeg' });

      let durationSec = 0;
      try {
        const url = URL.createObjectURL(blob);
        durationSec = await new Promise<number>((resolve) => {
          const audio = new Audio();
          let settled = false;
          const settle = (v: number) => {
            if (settled) return;
            settled = true;
            URL.revokeObjectURL(url);
            resolve(v);
          };
          const t = window.setTimeout(() => settle(0), 3000);
          audio.onloadedmetadata = () => {
            clearTimeout(t);
            settle(isFinite(audio.duration) ? audio.duration : 0);
          };
          audio.onerror = () => {
            clearTimeout(t);
            settle(0);
          };
          audio.src = url;
        });
      } catch {
        /* duration stays 0 */
      }

      dispatch({
        type: 'capture/upload',
        status: { phase: 'saving', message: 'Saving audio…' },
      });
      if (navigator?.storage?.estimate) {
        try {
          const est = await navigator.storage.estimate();
          const available = (est.quota ?? 0) - (est.usage ?? 0);
          if (available > 0 && blob.size > available * 0.9) {
            patchClips((clips) =>
              clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })),
            );
            dispatch({
              type: 'capture/upload',
              status: { phase: 'error', message: 'Not enough device storage to save this file.' },
            });
            return null;
          }
          if (available > 0 && blob.size > available * 0.8) {
            addNotification(
              'warning',
              'Device storage is low — this file may not save completely.',
            );
          }
        } catch {
          /* estimate unavailable — proceed */
        }
      }
      if (isSavingRef.current.has(clipId)) {
        if (import.meta.env.DEV) {
          console.warn(`[useSessionMachine] Skipping duplicate save for clip ${clipId}`);
        }
        return null;
      }
      isSavingRef.current.add(clipId);
      try {
        await audioRepository.save(clipId, blob);
      } finally {
        isSavingRef.current.delete(clipId);
      }
      patchClip(clipId, { status: 'ready', durationSec });

      dispatch({
        type: 'capture/upload',
        status: { phase: 'done', message: 'Audio added' },
      });
      return clipId;
    } catch (e) {
      patchClips((clips) =>
        clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })),
      );
      dispatch({
        type: 'capture/upload',
        status: { phase: 'error', message: `Upload failed: ${(e as Error).message}` },
      });
      return null;
    }
  }

  // ── Clip management ──────────────────────────────────────────────────────
  async function handleDeleteClip(clipId: string) {
    try {
      await audioRepository.remove(clipId);
    } catch {
      toast.error('Could not delete audio — try again');
      return;
    }
    patchClips((clips) =>
      clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })),
    );
  }

  // ── Recording complete — merge clips + compile live transcripts ──────────
  async function buildMergedAudioForReview() {
    const readyClips = sortedClips.filter(
      (c) => c.status === 'ready' || c.status === 'transcribed',
    );
    if (readyClips.length > 0) {
      setIsMerging(true);
      try {
        const loaded = await Promise.all(readyClips.map((c) => audioRepository.load(c.id)));
        const blobs = loaded.filter((b): b is Blob => b !== null);
        const dropped = readyClips.length - blobs.length;
        if (dropped > 0) {
          addNotification(
            'warning',
            `${dropped} clip${dropped === 1 ? '' : 's'} could not be loaded for playback.`,
          );
        }
        if (blobs.length > 0) {
          setMergedAudioBlob(await mergeAudioBlobs(blobs));

          const sd = settings.audio.silenceDetection;
          const silencedBlobs = await Promise.all(
            blobs.map((blob) =>
              sd.enabled
                ? trimSilence(blob, { sensitivity: sd.sensitivity, padMs: sd.padMs })
                    .then((r) => r.trimmed)
                    .catch(() => blob)
                : Promise.resolve(blob),
            ),
          );
          setSilencedMergedBlob(await mergeAudioBlobs(silencedBlobs));
        }
      } catch (e) {
        addNotification('error', `Could not combine clips for playback: ${(e as Error).message}`);
      } finally {
        setIsMerging(false);
      }
    }

    const t1Texts = sortedClips
      .map((c) => c.t1Transcript?.trim())
      .filter((t): t is string => Boolean(t));

    const compiledTexts = sortedClips
      .map((c) => (c.transcript || c.t2Transcript || c.t1Transcript)?.trim())
      .filter((t): t is string => Boolean(t));
    if (compiledTexts.length > 0) {
      const merged = compiledTexts.join('\n\n');
      setTranscript(merged);
      const patch: Partial<Session> = { transcript: merged, activeTranscriptTier: 't1' };
      if (t1Texts.length > 0) patch.t1Transcript = t1Texts.join('\n\n');
      patchSession(patch);
    }

    setActiveTab('review');
  }

  // Keep ref current so the auto-stop effect always invokes the latest closure.
  handleFinishedRecordingRef.current = handleFinishedRecording;
  buildMergedAudioForReviewRef.current = buildMergedAudioForReview;

  // When the hard cap or idle auto-stop fires, the MediaRecorder stops itself
  // internally — handleFinishedRecording is never called by user action, so the clip
  // stays 'pending' and audio is never persisted to IDB in the same session.
  useEffect(() => {
    const autoStopped =
      recorder.hardCapStopped ||
      recorder.idleAutoStopped ||
      recorder.recorderInterrupted ||
      recorder.micDisconnected;
    if (!autoStopped) {
      autoStopFinalizedRef.current = false;
      return;
    }
    if (autoStopFinalizedRef.current) return;
    if (recorder.status !== 'stopped') return;
    autoStopFinalizedRef.current = true;
    void handleFinishedRecordingRef.current().then(() => {
      setTimeout(() => void buildMergedAudioForReviewRef.current(), 0);
    });
  }, [
    recorder.hardCapStopped,
    recorder.idleAutoStopped,
    recorder.recorderInterrupted,
    recorder.micDisconnected,
    recorder.status,
  ]);

  // ── Generate runner ─────────────────────────────────────────────────────
  const isGeneratingRef = useRef(false);

  const ensureNote = useCallback(
    (initialSections?: NoteSection[]): Note => {
      if (note) return note;
      const now = Date.now();
      const sections =
        initialSections ??
        template?.sections.map((s) => ({ key: s.key, label: s.label, body: '' })) ??
        [];
      const created: Note = {
        id: newId(),
        sessionId: session!.id,
        patientId: patient!.id,
        format: (template?.format ?? 'custom') as NoteFormat,
        templateId: template?.id,
        sections,
        finalized: false,
        createdAt: now,
        updatedAt: now,
      };
      addNote(created);
      patchSession({ noteId: created.id });
      return created;
    },
    [note, template, session, patient, addNote, patchSession],
  );

  const runGenerate = useCallback(async () => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    try {
      if (!template) return;
      if (!transcript.trim()) {
        toast.error('Add a transcript first.');
        return;
      }
      if (settings.ai.generation.provider !== 'anthropic') {
        toast.error('Enable Anthropic generation in Settings to draft a note.');
        return;
      }

      const guard = checkActionGuard('generate');
      if (!guard.allowed) {
        toast.error(guard.reason);
        return;
      }

      setError(null);
      dispatch({ type: 'generate/start' });
      setBusy('generating');
      patchSession({ status: 'generating' });

      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 180_000);
      try {
        const result = await generateNote({
          provider: settings.ai.generation.provider,
          model: settings.ai.generation.model,
          template,
          transcript,
          patient: patient!,
          sessionType: session!.type,
          modifiers: session!.modifiers,
          activeTranscriptTier: session!.activeTranscriptTier,
          signal: controller.signal,
          onRetry: (info) =>
            dispatch({
              type: 'generate/retry',
              status: { provider: 'anthropic', attempt: info.attempt, max: info.max },
            }),
        });

        const modifierSnapshot = session!.modifiers;
        const transcriptSnapshot = transcript;
        if (note) {
          updateNote(note.id, {
            sections: result.sections,
            templateId: template.id,
            format: template.format,
            modifiers: modifierSnapshot,
            generatedFromTranscript: transcriptSnapshot,
          });
        } else {
          const created = ensureNote(result.sections);
          updateNote(created.id, {
            modifiers: modifierSnapshot,
            generatedFromTranscript: transcriptSnapshot,
          });
        }
        recordAction('generate');
        dispatch({ type: 'generate/success', rawText: result.rawText, prompts: result.debugPrompts });
        patchSession({ status: 'ready' });

        const hasContent = result.sections.some((s) => s.body.trim().length > 0);
        if (hasContent) {
          toast.success('Draft note generated');
        } else {
          toast.warning(
            'Note generated, but all sections are empty — try using a more detailed transcript.',
          );
        }
      } catch (e) {
        if (e instanceof AiCallError) {
          dispatch({ type: 'generate/error', aiError: e });
          toast.error(friendlyAiError(e).title);
        } else {
          dispatch({ type: 'generate/error', aiError: null });
          setError((e as Error).message);
        }
        patchSession({ status: 'draft' });
      } finally {
        clearTimeout(abortTimer);
        setBusy(null);
      }
    } finally {
      isGeneratingRef.current = false;
    }
  }, [
    template,
    transcript,
    settings,
    session,
    patient,
    note,
    patchSession,
    setError,
    setBusy,
    checkActionGuard,
    recordAction,
    ensureNote,
    updateNote,
  ]);

  const sectionChange = useCallback(
    (key: string, body: string) => {
      const target = ensureNote();
      const next = target.sections.map((s) => (s.key === key ? { ...s, body } : s));
      const wasFinalized = !target.finalized && target.finalizedAt !== undefined;
      const auditPatch = wasFinalized
        ? {
            editedAfterFinalizedAt: target.editedAfterFinalizedAt ?? Date.now(),
            editedAfterFinalizedCount: (target.editedAfterFinalizedCount ?? 0) + 1,
          }
        : {};
      updateNote(target.id, { sections: next, ...auditPatch });
    },
    [ensureNote, updateNote],
  );

  const replaceSections = useCallback(
    (sections: NoteSection[]) => {
      if (!note) return;
      updateNote(note.id, { sections, updatedAt: Date.now() });
    },
    [note, updateNote],
  );

  const missingRequiredLabels = useMemo<string[]>(() => {
    if (!template || !note) return [];
    const bodyByKey = new Map(note.sections.map((s) => [s.key, s.body]));
    return template.sections
      .filter((s) => s.required && !(bodyByKey.get(s.key) ?? '').trim())
      .map((s) => s.label);
  }, [template, note]);

  const finalize = useCallback(() => {
    if (missingRequiredLabels.length > 0) {
      toast.error(`Required sections empty: ${missingRequiredLabels.join(', ')}`);
      return;
    }
    const target = ensureNote();
    finalizeNote(target.id);
    patchSession({ status: 'finalized' });
    toast.success('Note finalized');
  }, [missingRequiredLabels, ensureNote, finalizeNote, patchSession]);

  const unfinalize = useCallback(() => {
    if (!note) return;
    unfinalizeNote(note.id);
    patchSession({ status: 'ready' });
  }, [note, unfinalizeNote, patchSession]);

  const copyMarkdown = useCallback((markdown: string) => {
    navigator.clipboard.writeText(markdown).then(
      () => toast.success('Note copied to clipboard'),
      () => toast.error('Copy failed'),
    );
  }, []);

  const clearGenerateAiError = useCallback(() => {
    dispatch({ type: 'generate/clearAiError' });
  }, []);

  // ── Transcribe runner ───────────────────────────────────────────────────
  const runTranscribe = useCallback(
    async (_clipId?: string) => {
      if (!session) return;
      if (!silencedMergedBlob) {
        toast.error('No audio to transcribe yet. Record or upload audio first.');
        return;
      }

      const guard = checkActionGuard('transcribe');
      if (!guard.allowed) {
        toast.error(guard.reason);
        return;
      }

      dispatch({ type: 'transcribe/start' });
      setBusy('transcribing');
      patchSession({ status: 'transcribing' });

      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 180_000);
      try {
        // Apply speed-up to the combined silenced blob if the setting is
        // enabled. Speed-up is generated on demand — never pre-computed.
        let blobToSend: Blob = silencedMergedBlob;
        let speedReport: { savedSec: number; originalSec: number } | undefined;

        const su = settings.audio.speedUp;
        if (su.enabled) {
          try {
            const speedResult = await speedUpAudio(blobToSend, su.speed as SpeedFactor);
            blobToSend = speedResult.result;
            speedReport = {
              savedSec: speedResult.report.savedSec,
              originalSec: speedResult.report.originalSec,
            };
          } catch {
            /* speed-up failure must never block transcription */
          }
        }

        const result = await transcribe({
          blob: blobToSend,
          provider: 'cloudflare',
          model: '@cf/deepgram/nova-3',
          signal: controller.signal,
          onRetry: (info) =>
            dispatch({
              type: 'transcribe/retry',
              status: { provider: 'nova', attempt: info.attempt, max: info.max },
            }),
        });

        const text = result.text?.trim() ?? '';
        if (text) {
          setTranscript(text);
          setEditedTranscript?.('');
          // t3Transcript frozen here — t2 preserved untouched
          patchSession({
            transcript: text,
            t3Transcript: text,
            activeTranscriptTier: 't3',
            status: 'draft',
            editedTranscript: undefined,
          });
          recordAction('transcribe');
          dispatch({
            type: 'transcribe/success',
            stats: {
              droppedSec: 0,
              originalSec: 0,
              speedSavedSec: speedReport?.savedSec ?? 0,
              speedOriginalSec: speedReport?.originalSec ?? 0,
            },
          });
          toast.success('Transcription complete.');
        } else {
          patchSession({ status: 'draft' });
          dispatch({ type: 'transcribe/empty' });
          toast.error('Transcription returned no text. Try again or check your audio.');
        }
      } catch (e) {
        patchSession({ status: 'draft' });
        if ((e as Error).name === 'AbortError') {
          // user-initiated cancel; silent
          dispatch({ type: 'transcribe/abort' });
        } else if (e instanceof AiCallError) {
          dispatch({ type: 'transcribe/error', aiError: e });
          toast.error(friendlyAiError(e).title);
        } else {
          dispatch({ type: 'transcribe/error', aiError: null });
          toast.error(`Transcription failed: ${(e as Error).message}`);
        }
      } finally {
        clearTimeout(abortTimer);
        setBusy(null);
      }
    },
    [
      session,
      silencedMergedBlob,
      settings,
      checkActionGuard,
      recordAction,
      patchSession,
      setBusy,
      setTranscript,
      setEditedTranscript,
    ],
  );

  const revertToLocal = useCallback(() => {
    const t2 = session?.t2Transcript;
    const t1 = session?.t1Transcript;
    const text = t2 || t1;
    if (text?.trim()) {
      setTranscript(text);
      setEditedTranscript?.('');
      patchSession({
        transcript: text,
        activeTranscriptTier: t2 ? 't2' : 't1',
        editedTranscript: undefined,
      });
      toast.success('Reverted to local transcription.');
    } else {
      toast.error('No local transcription to revert to.');
    }
  }, [session, setTranscript, setEditedTranscript, patchSession]);

  const clearTranscribeAiError = useCallback(() => {
    dispatch({ type: 'transcribe/clearAiError' });
  }, []);

  // ── Public API ──────────────────────────────────────────────────────────
  const generate = useMemo<SessionMachineGenerateApi>(
    () => ({
      run: runGenerate,
      finalize,
      unfinalize,
      sectionChange,
      replaceSections,
      copyMarkdown,
      clearAiError: clearGenerateAiError,
      missingRequiredLabels,
    }),
    [
      runGenerate,
      finalize,
      unfinalize,
      sectionChange,
      replaceSections,
      copyMarkdown,
      clearGenerateAiError,
      missingRequiredLabels,
    ],
  );

  const transcribeApi = useMemo<SessionMachineTranscribeApi>(
    () => ({
      run: runTranscribe,
      revertToLocal,
      clearAiError: clearTranscribeAiError,
      mergedAudioBlob,
      setMergedAudioBlob,
      silencedMergedBlob,
      setSilencedMergedBlob,
      isMerging,
      setIsMerging,
    }),
    [
      runTranscribe,
      revertToLocal,
      clearTranscribeAiError,
      mergedAudioBlob,
      silencedMergedBlob,
      isMerging,
    ],
  );

  const actionGuard = useMemo<SessionMachineActionGuardApi>(
    () => ({ checkActionGuard, recordAction, transcribeUsed, generateUsed }),
    [checkActionGuard, recordAction, transcribeUsed, generateUsed],
  );

  const capture = useMemo<SessionMachineCaptureApi>(
    () => ({
      backgroundWarningDismissed,
      setBackgroundWarningDismissed,
      whisperBubbles,
      uploadStatus,
      handleStartRecording,
      handleFinishedRecording,
      handlePauseResume,
      handleStopAndFinish,
      handleUploadAudio,
      handleDeleteClip,
      buildMergedAudioForReview,
    }),
    // Handlers are stable closures over refs/state so we intentionally
    // depend only on the values that change and trigger UI updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backgroundWarningDismissed, whisperBubbles, uploadStatus],
  );

  return useMemo(
    () => ({ state, generate, transcribe: transcribeApi, capture, actionGuard }),
    [state, generate, transcribeApi, capture, actionGuard],
  );
}
