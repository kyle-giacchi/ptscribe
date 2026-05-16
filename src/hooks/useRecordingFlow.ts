import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import { audioRepository } from '@/services/AudioRepository';
import { mergeAudioBlobs } from '@/lib/audio/merge';
import { transcribeLocally, preloadLocalWhisper, LOCAL_WHISPER_DEFAULT_MODEL } from '@/services/ai/client/localWhisper';
import { newId } from '@/utils/ids';
import { MAX_AUDIO_BYTES } from '@/lib/audioLimits';
import type { UseRecorder } from '@/hooks/useRecorder';
import type { UseLiveTranscript } from '@/hooks/useLiveTranscript';
import type { Session, SessionClip } from '@/types';

export interface UseRecordingFlowParams {
  session: Session | undefined;
  recorder: UseRecorder;
  live: UseLiveTranscript;
  sortedClips: SessionClip[];
  patchSession: (patch: Partial<Session>) => void;
  patchClips: (mapper: (clips: SessionClip[]) => SessionClip[]) => void;
  patchClip: (clipId: string, patch: Partial<SessionClip>) => void;
  setError: (msg: string | null) => void;
  setActiveTab: (tab: 'record' | 'review') => void;
  setTranscript: (next: string) => void;
  setMergedAudioBlob: (blob: Blob | null) => void;
  setIsMerging: (v: boolean) => void;
}

export interface UseRecordingFlowResult {
  // Recording state for UI
  backgroundWarningDismissed: boolean;
  setBackgroundWarningDismissed: (v: boolean) => void;
  // Active clip ref (exposed so the auto-record deep link hook can read it if needed)
  activeClipIdRef: MutableRefObject<string | null>;
  // Growing Whisper transcript captured from audio chunks during recording
  whisperLiveText: string;
  // Handlers
  handleStartRecording: () => Promise<void>;
  handleStopRecording: () => Promise<void>;
  handlePauseResume: () => void;
  handleStopAndFinish: () => void;
  handleUploadAudio: (file: File) => Promise<void>;
  handleDeleteClip: (clipId: string) => Promise<void>;
  handleRecordingComplete: () => Promise<void>;
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
    live,
    sortedClips,
    patchSession,
    patchClips,
    patchClip,
    setError,
    setActiveTab,
    setTranscript,
    setMergedAudioBlob,
    setIsMerging,
  } = params;

  const [backgroundWarningDismissed, setBackgroundWarningDismissed] = useState(false);
  const [whisperLiveText, setWhisperLiveText] = useState('');

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

  // ── Live Whisper chunk processing (leaky-bucket) ─────────────────────────
  // At most one Whisper job runs at a time; if a new chunk arrives while one
  // is in flight, it replaces the pending blob so we always process fresh audio.
  const whisperRunningRef = useRef(false);
  const whisperPendingRef = useRef<Blob | null>(null);

  async function processWhisperChunk() {
    const blob = whisperPendingRef.current;
    if (!blob) { whisperRunningRef.current = false; return; }
    whisperPendingRef.current = null;
    try {
      const result = await transcribeLocally(blob, LOCAL_WHISPER_DEFAULT_MODEL);
      if (result.text.trim()) setWhisperLiveText(result.text);
    } catch (err) {
      console.error('[Whisper live preview]', err);
    }
    if (whisperPendingRef.current) {
      void processWhisperChunk();
    } else {
      whisperRunningRef.current = false;
    }
  }

  function handleChunk(blob: Blob) {
    whisperPendingRef.current = blob;
    if (whisperRunningRef.current) return;
    whisperRunningRef.current = true;
    void processWhisperChunk();
  }

  // Prevents concurrent saves for the same clipId from corrupting each other mid-encryption.
  const isSavingRef = useRef<Set<string>>(new Set());

  // Used by the auto-stop finalization effect below to always call the latest
  // handleStopRecording without including it in the effect's dep array.
  const handleStopRecordingRef = useRef<() => Promise<void>>(async () => {});
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

    setWhisperLiveText('');
    whisperPendingRef.current = null;
    recorder.onChunk.current = handleChunk;

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

    if (live.supported) {
      live.reset();
      live.start(() => durationSecRef.current);
    }
  }

  function handlePauseResume() {
    if (recorder.status === 'recording') {
      recorder.pause();
      live.stop();
    } else if (recorder.status === 'paused') {
      recorder.resume();
      if (live.supported) live.start(() => durationSecRef.current);
    }
  }

  async function handleStopRecording() {
    if (!session) return;
    const clipId = activeClipIdRef.current;
    activeClipIdRef.current = null;

    recorder.onChunk.current = null;
    whisperPendingRef.current = null;

    const finalBlob = await recorder.stop();
    const durationSec = recorder.durationSec;
    live.stop();

    if (clipId) {
      if (finalBlob) {
        // Check storage availability before attempting to save.
        if (navigator?.storage?.estimate) {
          try {
            const est = await navigator.storage.estimate();
            const available = (est.quota ?? 0) - (est.usage ?? 0);
            if (available > 0 && finalBlob.size > available * 0.9) {
              // Hard stop — saving would consume more than 90% of remaining space.
              toast.error('Not enough device storage to save this recording.');
              patchClip(clipId, {
                status: 'failed',
                errorMessage: 'Not enough device storage to save this recording.',
              });
              return;
            }
            if (available > 0 && finalBlob.size > available * 0.8) {
              toast.warning('Device storage is low — this recording may not save completely.');
            }
          } catch {
            // Estimate unavailable — proceed with save.
          }
        }
        if (isSavingRef.current.has(clipId)) {
          console.warn(`[useRecordingFlow] Skipping duplicate save for clip ${clipId}`);
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
          console.warn('[useRecordingFlow] clearChunks failed:', e);
          toast.warning('Storage cleanup failed — some space may not be recovered.');
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

    if (clipId && live.finalText.trim()) {
      patchClip(clipId, { liveTranscript: live.finalText.trim() });
    }
    live.reset();
    patchSession({ status: 'draft' });
  }

  // C3: Stop & finish now only stops the recording and switches to Review.
  // Transcription and note generation are explicit user-triggered steps.
  function handleStopAndFinish() {
    void handleStopRecording().then(() => setActiveTab('review'));
  }

  // ── Audio upload ─────────────────────────────────────────────────────────
  async function handleUploadAudio(file: File) {
    if (file.size > MAX_AUDIO_BYTES) {
      toast.error('File too large — Whisper accepts up to 25 MB.');
      return;
    }
    if (file.type && !/^(audio|video)\//.test(file.type)) {
      toast.error('Please upload an audio file (MP3, M4A, WAV, OGG, WebM, etc.).');
      return;
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

    const tid = toast.loading('Uploading file…', { duration: Infinity });
    try {
      const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/mpeg' });

      let durationSec = 0;
      try {
        const url = URL.createObjectURL(blob);
        let metaHandled = false;
        durationSec = await new Promise<number>((resolve) => {
          const audio = new Audio();
          audio.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            if (!metaHandled) { metaHandled = true; resolve(isFinite(audio.duration) ? audio.duration : 0); }
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            if (!metaHandled) { metaHandled = true; resolve(0); }
          };
          audio.src = url;
        });
      } catch {
        /* duration stays 0 */
      }

      if (isSavingRef.current.has(clipId)) {
        console.warn(`[useRecordingFlow] Skipping duplicate save for clip ${clipId}`);
        return;
      }
      isSavingRef.current.add(clipId);
      try {
        await audioRepository.save(clipId, blob);
      } finally {
        isSavingRef.current.delete(clipId);
      }
      patchClip(clipId, { status: 'ready', durationSec });

      toast.success(`Added "${file.name}"`, { id: tid });
    } catch (e) {
      patchClips((clips) =>
        clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })),
      );
      toast.error(`Upload failed: ${(e as Error).message}`, { id: tid });
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
  async function handleRecordingComplete() {
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
          toast.info(`${dropped} clip${dropped === 1 ? '' : 's'} could not be loaded for playback.`);
        }
        if (blobs.length > 0) setMergedAudioBlob(await mergeAudioBlobs(blobs));
      } catch (e) {
        toast.error(`Could not combine clips: ${(e as Error).message}`);
      } finally {
        setIsMerging(false);
      }
    }

    // Compile from best available per-clip transcript — uses local Whisper result where
    // available, falls back to WebSpeech liveTranscript where not (e.g. Whisper failed).
    const compiledTexts = sortedClips
      .map((c) => (c.transcript || c.localTranscript || c.liveTranscript)?.trim())
      .filter((t): t is string => Boolean(t));
    if (compiledTexts.length > 0) {
      const merged = compiledTexts.join('\n\n');
      setTranscript(merged);
      patchSession({ transcript: merged, liveTranscript: merged, transcriptSource: 'webspeech' });
    }

    setActiveTab('review');
  }

  // Keep ref current so the effect below always invokes the latest closure.
  handleStopRecordingRef.current = handleStopRecording;

  // When the hard cap or idle auto-stop fires, the MediaRecorder stops itself
  // internally — handleStopRecording is never called by user action, so the clip
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
    void handleStopRecordingRef.current();
    // handleStopRecordingRef is a stable ref — intentionally excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.hardCapStopped, recorder.idleAutoStopped, recorder.recorderInterrupted, recorder.micDisconnected, recorder.status]);

  return {
    backgroundWarningDismissed,
    setBackgroundWarningDismissed,
    activeClipIdRef,
    whisperLiveText,
    handleStartRecording,
    handleStopRecording,
    handlePauseResume,
    handleStopAndFinish,
    handleUploadAudio,
    handleDeleteClip,
    handleRecordingComplete,
  };
}
