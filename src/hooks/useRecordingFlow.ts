import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import { useNotifications } from '@/contexts/NotificationsProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { audioRepository } from '@/services/AudioRepository';
import { mergeAudioBlobs } from '@/lib/audio/merge';
import { trimSilence } from '@/lib/audio/silenceTrim';
import { transcribeLocally, preloadLocalWhisper, LOCAL_WHISPER_DEFAULT_MODEL } from '@/services/ai/client/localWhisper';
import { newId } from '@/utils/ids';
import { MAX_AUDIO_BYTES } from '@/lib/audioLimits';
import type { UseRecorder } from '@/hooks/useRecorder';
import type { UseWebSpeechTranscript } from '@/hooks/useLiveTranscript';
import type { Session, SessionClip } from '@/types';


export interface UseRecordingFlowParams {
  session: Session | undefined;
  recorder: UseRecorder;
  webSpeech: UseWebSpeechTranscript;
  webSpeechEnabled: boolean;
  /**
   * When set, overrides `settings.ai.transcription.provider` for this session only.
   * `'webspeech'` forces Web Speech captions even if the user's default is Local Whisper;
   * `'none'` suppresses live transcription entirely (record-now, transcribe-later);
   * `null`/`undefined` falls back to `webSpeechEnabled` from settings.
   */
  transcriptionProviderOverride?: 'webspeech' | 'none' | null;
  sortedClips: SessionClip[];
  patchSession: (patch: Partial<Session>) => void;
  patchClips: (mapper: (clips: SessionClip[]) => SessionClip[]) => void;
  patchClip: (clipId: string, patch: Partial<SessionClip>) => void;
  setError: (msg: string | null) => void;
  setActiveTab: (tab: 'record' | 'review') => void;
  setTranscript: (next: string) => void;
  setMergedAudioBlob: (blob: Blob | null) => void;
  setSilencedMergedBlob: (blob: Blob | null) => void;
  setIsMerging: (v: boolean) => void;
}

export type UploadPhase = 'idle' | 'reading' | 'saving' | 'done' | 'error';
export interface UploadStatus { phase: UploadPhase; message: string; }

export interface UseRecordingFlowResult {
  // Recording state for UI
  backgroundWarningDismissed: boolean;
  setBackgroundWarningDismissed: (v: boolean) => void;
  // Active clip ref (exposed so the auto-record deep link hook can read it if needed)
  activeClipIdRef: MutableRefObject<string | null>;
  // Whisper live preview: one string per natural speech segment
  whisperBubbles: string[];
  // Inline upload status (replaces toast for the upload flow)
  uploadStatus: UploadStatus;
  // Handlers
  handleStartRecording: () => Promise<void>;
  handleFinishedRecording: () => Promise<void>;
  handlePauseResume: () => void;
  handleStopAndFinish: () => void;
  handleUploadAudio: (file: File) => Promise<string | null>;
  handleDeleteClip: (clipId: string) => Promise<void>;
  buildMergedAudioForReview: () => Promise<void>;
}

/**
 * Owns the recording lifecycle handlers + ancillary state for a session.
 * Wires the recorder/live hooks to clip + session mutations, and merges clips
 * for Review-tab playback when the user finishes recording.
 */


export function useRecordingFlow(params: UseRecordingFlowParams): UseRecordingFlowResult {
  const {
    session,
    recorder,
    webSpeech,
    webSpeechEnabled: settingsWebSpeechEnabled,
    transcriptionProviderOverride,
    sortedClips,
    patchSession,
    patchClips,
    patchClip,
    setError,
    setActiveTab,
    setTranscript,
    setMergedAudioBlob,
    setSilencedMergedBlob,
    setIsMerging,
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

  const { settings } = useSettings();

  const { addNotification } = useNotifications();
  const [backgroundWarningDismissed, setBackgroundWarningDismissed] = useState(false);
  const [whisperBubbles, setWhisperBubbles] = useState<string[]>([]);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ phase: 'idle', message: '' });
  // Sync ref so processWhisperChunk can persist t1Transcript without waiting for state.
  const whisperTextRef = useRef<string[]>([]);

  // Auto-clear terminal upload states after 3 s
  useEffect(() => {
    if (uploadStatus.phase !== 'done' && uploadStatus.phase !== 'error') return;
    const t = window.setTimeout(() => setUploadStatus({ phase: 'idle', message: '' }), 3000);
    return () => window.clearTimeout(t);
  }, [uploadStatus.phase]);

  // Warm up the Whisper worker + model as soon as the session mounts so the
  // first transcription result doesn't have to wait for a cold model download.
  useEffect(() => { preloadLocalWhisper(); }, []);


  // Always-current ref so the live-transcript callback reads the latest duration.
  const durationSecRef = useRef(0);
  durationSecRef.current = recorder.durationSec;
  // Re-arm the dismiss flag every time a new recording starts so the warning
  // resurfaces for the next session if it gets backgrounded again.
  useEffect(() => {
    if (recorder.status !== 'recording') return;
    const id = window.setTimeout(() => setBackgroundWarningDismissed(false), 0);
    return () => window.clearTimeout(id);
  }, [recorder.status]);

  // Tracks the clip currently being recorded, so stop() knows which clip to update.
  const activeClipIdRef = useRef<string | null>(null);

  // When Web Speech is enabled in settings, persist live captions to t1Transcript continuously.
  // This ensures a browser crash only loses the current in-progress segment.
  useEffect(() => {
    if (!webSpeechEnabled) return;
    const clipId = activeClipIdRef.current;
    if (!clipId || !webSpeech.accumulatedText.trim()) return;
    patchClip(clipId, { t1Transcript: webSpeech.accumulatedText.trim() });
    // patchClip uses functional updates and activeClipIdRef is a stable ref — safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSpeech.accumulatedText, webSpeechEnabled]);

  // ── Live Whisper chunk processing (leaky-bucket) ─────────────────────────
  // At most one Whisper job runs at a time; if a new chunk arrives while one
  // is in flight, it replaces the pending blob so we always process fresh audio.
  const whisperRunningRef = useRef(false);
  const whisperPendingRef = useRef<Blob | null>(null);
  const whisperChainPromiseRef = useRef<Promise<void>>(Promise.resolve());

  async function processWhisperChunk(): Promise<void> {
    const blob = whisperPendingRef.current;
    if (!blob) { whisperRunningRef.current = false; return; }
    whisperPendingRef.current = null;
    try {
      const result = await transcribeLocally(blob, LOCAL_WHISPER_DEFAULT_MODEL);
      const text = result.text.trim();
      if (text) {
        whisperTextRef.current = [...whisperTextRef.current, text];
        setWhisperBubbles(whisperTextRef.current);
        // Persist accumulated Whisper segments as T1 — fallback when Web Speech is off.
        const clipId = activeClipIdRef.current;
        if (clipId) patchClip(clipId, { t1Transcript: whisperTextRef.current.join(' ') });
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[useRecordingFlow] Whisper live-preview chunk failed:', err);
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

  // Prevents concurrent saves for the same clipId from corrupting each other mid-encryption.
  const isSavingRef = useRef<Set<string>>(new Set());

  // Used by the auto-stop finalization effect below to always call the latest
  // handleFinishedRecording without including it in the effect's dep array.
  const handleFinishedRecordingRef = useRef<() => Promise<void>>(async () => {});
  // Guards against calling finalization twice for the same auto-stop event.
  const autoStopFinalizedRef = useRef(false);

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
      // Pick up any final chunk the recorder emitted during the pause transition.
      if (whisperPendingRef.current && !whisperRunningRef.current) {
        whisperRunningRef.current = true;
        await (whisperChainPromiseRef.current = processWhisperChunk());
      }
      // Checkpoint: persist clip-level T1 and compile session-level T1 as a data safeguard.
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
        // Check storage availability before attempting to save.
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
              addNotification('warning', 'Device storage is low — this recording may not save completely.');
            }
          } catch {
            // Estimate unavailable — proceed with save.
          }
        }
        if (isSavingRef.current.has(clipId)) {
          if (import.meta.env.DEV) {
            console.warn(`[useRecordingFlow] Skipping duplicate save for clip ${clipId}`);
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
        // Chunk cleanup is best-effort — failure doesn't affect the saved clip.
        audioRepository.clearChunks(clipId).catch((e) => {
          if (import.meta.env.DEV) {
            console.warn('[useRecordingFlow] clearChunks failed:', e);
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

    // Compile session-level T1 immediately so the debug page shows it before "Generate Notes".
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

  // C3: Stop & finish now only stops the recording and switches to Review.
  // Transcription and note generation are explicit user-triggered steps.
  function handleStopAndFinish() {
    void handleFinishedRecording().then(() => setActiveTab('review'));
  }

  // ── Audio upload ─────────────────────────────────────────────────────────
  async function handleUploadAudio(file: File): Promise<string | null> {
    if (file.size > MAX_AUDIO_BYTES) {
      setUploadStatus({ phase: 'error', message: 'File too large — max 25 MB.' });
      return null;
    }
    if (file.type && !/^(audio|video)\//.test(file.type)) {
      setUploadStatus({ phase: 'error', message: 'Please upload an audio or video file.' });
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

    setUploadStatus({ phase: 'reading', message: 'Reading file…' });
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
          // Guard against malformed files where neither event fires.
          const t = window.setTimeout(() => settle(0), 3000);
          audio.onloadedmetadata = () => { clearTimeout(t); settle(isFinite(audio.duration) ? audio.duration : 0); };
          audio.onerror = () => { clearTimeout(t); settle(0); };
          audio.src = url;
        });
      } catch {
        /* duration stays 0 */
      }

      setUploadStatus({ phase: 'saving', message: 'Saving audio…' });
      if (navigator?.storage?.estimate) {
        try {
          const est = await navigator.storage.estimate();
          const available = (est.quota ?? 0) - (est.usage ?? 0);
          if (available > 0 && blob.size > available * 0.9) {
            patchClips((clips) => clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })));
            setUploadStatus({ phase: 'error', message: 'Not enough device storage to save this file.' });
            return null;
          }
          if (available > 0 && blob.size > available * 0.8) {
            addNotification('warning', 'Device storage is low — this file may not save completely.');
          }
        } catch { /* estimate unavailable — proceed */ }
      }
      if (isSavingRef.current.has(clipId)) {
        if (import.meta.env.DEV) {
          console.warn(`[useRecordingFlow] Skipping duplicate save for clip ${clipId}`);
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

      setUploadStatus({ phase: 'done', message: 'Audio added' });
      return clipId;
    } catch (e) {
      patchClips((clips) =>
        clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })),
      );
      setUploadStatus({ phase: 'error', message: `Upload failed: ${(e as Error).message}` });
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
    patchClips((clips) => clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })));
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
          addNotification('warning', `${dropped} clip${dropped === 1 ? '' : 's'} could not be loaded for playback.`);
        }
        if (blobs.length > 0) {
          // Raw merge for Full Audio display in AudioPreviewSection.
          setMergedAudioBlob(await mergeAudioBlobs(blobs));

          // Silence-remove each clip, then merge → Full Session Audio Clip.
          // This combined blob is what T2 (Whisper) and Nova both operate on.
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

    // Always compile pure T1 text for preservation before any higher tier overwrites it.
    const t1Texts = sortedClips
      .map((c) => c.t1Transcript?.trim())
      .filter((t): t is string => Boolean(t));

    // Best-available per-clip for the active transcript display (T2 > T1).
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

  // Keep ref current so the effect below always invokes the latest closure.
  handleFinishedRecordingRef.current = handleFinishedRecording;

  // When the hard cap or idle auto-stop fires, the MediaRecorder stops itself
  // internally — handleFinishedRecording is never called by user action, so the clip
  // stays 'pending' and audio is never persisted to IDB in the same session.
  // This effect detects that condition and finalizes the clip immediately so the
  // user doesn't need to reload to trigger useAudioRecovery.
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
    void handleFinishedRecordingRef.current();
  }, [recorder.hardCapStopped, recorder.idleAutoStopped, recorder.recorderInterrupted, recorder.micDisconnected, recorder.status]);

  return {
    backgroundWarningDismissed,
    setBackgroundWarningDismissed,
    activeClipIdRef,
    whisperBubbles,
    uploadStatus,
    handleStartRecording,
    handleFinishedRecording,
    handlePauseResume,
    handleStopAndFinish,
    handleUploadAudio,
    handleDeleteClip,
    buildMergedAudioForReview,
  };
}
