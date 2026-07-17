import { useEffect, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import { toast } from 'sonner';
import { useNotifications } from '@/contexts/NotificationsProvider';
import { audioRepository } from '@/services/AudioRepository';
import { promoteTier } from '@/services/transcript/promoteTier';
import { mergeAudioBlobs } from '@/lib/audio/merge';
import { trimSilence } from '@/lib/audio/silenceTrim';
import {
  transcribeLocally,
  whisperLoader,
  LOCAL_WHISPER_DEFAULT_MODEL,
} from '@/services/ai/client/localWhisper';
import { MAX_AUDIO_BYTES } from '@/lib/audioLimits';
import type { SessionMachineAction, UploadStatus } from './sessionMachine/types';
import type { UseRecorder } from './useRecorder';
import type { UseWebSpeechTranscript } from './useLiveTranscript';
import type { Session, SessionClip, Settings } from '@/types';

export interface UseCapturePhaseParams {
  session: Session | undefined;
  recorder: UseRecorder;
  webSpeech: UseWebSpeechTranscript;
  webSpeechEnabled: boolean;
  transcriptionProviderOverride?: 'webspeech' | 'none' | null;
  sortedClips: SessionClip[];
  settings: Settings;
  patchSession: (patch: Partial<Session>) => void;
  patchClips: (mapper: (clips: SessionClip[]) => SessionClip[]) => void;
  patchClip: (clipId: string, patch: Partial<SessionClip>) => void;
  uploadStatus: UploadStatus;
  dispatch: Dispatch<SessionMachineAction>;
}

export interface CapturePhaseResult {
  backgroundWarningDismissed: boolean;
  setBackgroundWarningDismissed: (v: boolean) => void;
  backgrounded: boolean;
  whisperBubbles: string[];
  uploadStatus: UploadStatus;
  handleStartRecording: () => Promise<void>;
  handleFinishedRecording: () => Promise<void>;
  handlePauseResume: () => void;
  handleStopAndFinish: () => void;
  handleUploadAudio: (file: File) => Promise<string | null>;
  handleDeleteClip: (clipId: string) => Promise<void>;
  buildMergedAudioForReview: (opts?: { skipNav?: boolean }) => Promise<void>;
  mergedAudioBlob: Blob | null;
  silencedMergedBlob: Blob | null;
  isMerging: boolean;
  reset: () => void;
}

export function useCapturePhase({
  session,
  recorder,
  webSpeech,
  webSpeechEnabled,
  transcriptionProviderOverride,
  sortedClips,
  settings,
  patchSession,
  patchClips,
  patchClip,
  uploadStatus,
  dispatch,
}: UseCapturePhaseParams): CapturePhaseResult {
  const { addNotification } = useNotifications();

  const [backgroundWarningDismissed, setBackgroundWarningDismissed] = useState(false);
  const [backgrounded, setBackgrounded] = useState(false);
  const [whisperBubbles, setWhisperBubbles] = useState<string[]>([]);
  const [mergedAudioBlob, setMergedAudioBlob] = useState<Blob | null>(null);
  const [silencedMergedBlob, setSilencedMergedBlob] = useState<Blob | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  // Sync ref so processWhisperChunk can persist t1Transcript without waiting for state.
  const whisperTextRef = useRef<string[]>([]);

  // Always-current ref so the live-transcript callback reads the latest duration.
  // Read from the recorder's live-duration store (updated every tick) rather than
  // the low-frequency `durationSec` state, which now only commits on pause/stop.
  const durationSecRef = useRef(0);
  durationSecRef.current = recorder.getDurationSec();

  // Tracks the clip currently being recorded, so stop() knows which clip to update.
  const activeClipIdRef = useRef<string | null>(null);

  // Leaky-bucket: at most one Whisper job runs at a time.
  const whisperRunningRef = useRef(false);
  const whisperPendingRef = useRef<Blob | null>(null);
  const whisperChainPromiseRef = useRef<Promise<void>>(Promise.resolve());

  // Prevents concurrent saves for the same clipId from corrupting each other mid-encryption.
  const isSavingRef = useRef<Set<string>>(new Set());

  // Used by the auto-stop finalization effect to always call the latest closure.
  const handleFinishedRecordingRef = useRef<() => Promise<void>>(async () => {});
  const buildMergedAudioForReviewRef = useRef<() => Promise<void>>(async () => {});

  // Auto-clear terminal upload states after 3 s.
  useEffect(() => {
    if (uploadStatus.phase !== 'done' && uploadStatus.phase !== 'error') return;
    const t = window.setTimeout(
      () => dispatch({ type: 'capture/upload', status: { phase: 'idle', message: '' } }),
      3000,
    );
    return () => window.clearTimeout(t);
  }, [uploadStatus.phase, dispatch]);

  // Warm up the Whisper worker + model as soon as the session mounts. This is a
  // best-effort preload — swallow rejections (e.g. WhisperExhaustedError) so a
  // failed warm-up never surfaces as an unhandled rejection. The record/transcribe
  // flow surfaces model unavailability through its own UI (WhisperUnavailableDialog).
  useEffect(() => {
    void whisperLoader.ensureReady().catch(() => {});
  }, []);

  // Re-arm the dismiss flag every time a new recording starts.
  useEffect(() => {
    if (recorder.status !== 'recording') return;
    const id = window.setTimeout(() => {
      setBackgroundWarningDismissed(false);
      setBackgrounded(false);
    }, 0);
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
        console.error('[useCapturePhase] Whisper live-preview chunk failed:', err);
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
    dispatch({ type: 'error/set', message: null });
    if (!session) return;

    const clipId = crypto.randomUUID();
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
    recorder.onChunk.current = transcriptionProviderOverride === 'none' ? null : handleChunk;

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
      recorder.onChunk.current = transcriptionProviderOverride === 'none' ? null : handleChunk;
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
    // Read the live store snapshot — `stop()` has committed the final paused
    // value to it synchronously, and unlike `recorder.durationSec` state it is
    // not subject to the async render commit.
    const durationSec = recorder.getDurationSec();
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
            console.warn(`[useCapturePhase] Skipping duplicate save for clip ${clipId}`);
          }
          return;
        }
        isSavingRef.current.add(clipId);
        try {
          await audioRepository.save(clipId, finalBlob);
        } catch (e) {
          dispatch({
            type: 'error/set',
            message: `Could not save audio: ${(e as Error).message}`,
          });
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
            console.warn('[useCapturePhase] clearChunks failed:', e);
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

  function reset() {
    setMergedAudioBlob(null);
    setSilencedMergedBlob(null);
    setIsMerging(false);
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

    const clipId = crypto.randomUUID();
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
          console.warn(`[useCapturePhase] Skipping duplicate save for clip ${clipId}`);
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
    patchClips((clips) => clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })));
  }

  // ── Recording complete — merge clips + compile live transcripts ──────────
  async function buildMergedAudioForReview(opts?: { skipNav?: boolean }) {
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
      // promoteTier guards the baseline (won't clobber a higher tier that already
      // ran). The frozen t1Transcript is a t1-only join, distinct from the merged
      // compiled baseline, so the producer still writes it itself.
      const promo = promoteTier(session ?? {}, { tier: 't1', text: merged });
      if (promo) {
        dispatch({ type: 'transcript/setBaseline', text: merged });
        const patch: Partial<Session> = { ...promo };
        if (t1Texts.length > 0) patch.t1Transcript = t1Texts.join('\n\n');
        patchSession(patch);
      }
    }

    if (!opts?.skipNav) dispatch({ type: 'view/setTab', tab: 'review' });
  }

  // Keep refs current so the auto-stop effect always invokes the latest closure.
  handleFinishedRecordingRef.current = handleFinishedRecording;
  buildMergedAudioForReviewRef.current = buildMergedAudioForReview;

  // When the hard cap or idle auto-stop fires, the MediaRecorder stops itself
  // internally — handleFinishedRecording is never called by user action, so the
  // clip stays 'pending' and audio is never persisted to IDB.
  useEffect(() => {
    return recorder.subscribeEvents((e) => {
      if (e.type === 'backgrounded') setBackgrounded(true);
      if (e.type === 'stopped' && e.reason !== 'manual') {
        void handleFinishedRecordingRef.current().then(() => {
          setTimeout(() => void buildMergedAudioForReviewRef.current(), 0);
        });
      }
    });
  }, [recorder.subscribeEvents]);

  return {
    backgroundWarningDismissed,
    setBackgroundWarningDismissed,
    backgrounded,
    whisperBubbles,
    uploadStatus,
    handleStartRecording,
    handleFinishedRecording,
    handlePauseResume,
    handleStopAndFinish,
    handleUploadAudio,
    handleDeleteClip,
    buildMergedAudioForReview,
    mergedAudioBlob,
    silencedMergedBlob,
    isMerging,
    reset,
  };
}
