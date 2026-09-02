// This hook deliberately keeps "always-current" refs (durationSecRef,
// recorderStatusRef, the *Ref latest-closure handles for the subscribe-once
// RecorderEvent handler) and writes the recorder's imperative chunk sink
// (`recorder.onChunk.current`) during render. react-hooks v7's compiler-flavour
// rules flag all of these; the patterns are load-bearing here and predate the
// rule. Modernising them is its own task.
/* eslint-disable react-hooks/refs, react-hooks/immutability */
import { useEffect, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import { toast } from 'sonner';
import { useNotifications } from '@/contexts/NotificationsProvider';
import { audioRepository } from '@/services/AudioRepository';
import { applyTierWrite } from '@/services/transcript/promoteTier';
import { runCaptureEnd } from '@/services/capture/runCaptureEnd';
import {
  transcribeLocally,
  whisperLoader,
  LOCAL_WHISPER_DEFAULT_MODEL,
} from '@/services/ai/client/localWhisper';
import { MAX_AUDIO_BYTES } from '@/lib/audioLimits';
import { resetLiveWhisperStats } from '@/lib/debug/liveWhisperStats';
import { createLiveTranscriber, type LiveTranscriber } from '@/services/transcript/liveTranscriber';
import { playAlertChime } from '@/components/sessions/recording/playAlertChime';
import type { AdvisoryAction } from './sessionMachine/recordingAdvisories';
import type { SessionMachineAction, UploadStatus } from './sessionMachine/types';
import type { UseRecorder } from './useRecorder';
import type { UseWebSpeechTranscript } from './useLiveTranscript';
import type { Session, SessionClip, Settings } from '@/types';

interface UseCapturePhaseParams {
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

/**
 * Mirrors the clip mutations a call already sent through `patchClips`, so
 * Capture-end can work from a clip list that is current *now*, rather than
 * deferring a frame and hoping React committed in between. Kept in a ref
 * (`stagedClipsRef`) and consumed internally by `endCapture` — callers no
 * longer thread it through. This is what removes the `setTimeout(…, 0)` hacks.
 */
type ClipsPatch = (clips: SessionClip[]) => SessionClip[];

interface CapturePhaseResult {
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
  /** Runs the Capture-end pipeline and applies its result. Never navigates. */
  endCapture: () => Promise<void>;
  silencedMergedBlob: Blob | null;
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
  const [silencedMergedBlob, setSilencedMergedBlob] = useState<Blob | null>(null);

  // Always-current ref so the live-transcript callback reads the latest duration.
  // Read from the recorder's live-duration store (updated every tick) rather than
  // the low-frequency `durationSec` state, which now only commits on pause/stop.
  const durationSecRef = useRef(0);
  durationSecRef.current = recorder.getDurationSec();

  // Always-current status so the (subscribe-once) event handler can guard on it.
  const recorderStatusRef = useRef(recorder.status);
  recorderStatusRef.current = recorder.status;

  // Tracks the clip currently being recorded, so stop() knows which clip to update.
  const activeClipIdRef = useRef<string | null>(null);

  // The T1 live-preview engine (leaky bucket, drain rule, drop counting) lives
  // in its own module now. `patchClip` does functional updates and
  // `activeClipIdRef` is always current, so freezing this closure is safe.
  const [live] = useState<LiveTranscriber>(() =>
    createLiveTranscriber({
      transcribe: (blob) => transcribeLocally(blob, LOCAL_WHISPER_DEFAULT_MODEL),
      onText: (segments) => {
        setWhisperBubbles(segments);
        const clipId = activeClipIdRef.current;
        if (clipId) patchClip(clipId, { t1Transcript: segments.join(' ') });
      },
    }),
  );

  // Prevents concurrent saves for the same clipId from corrupting each other mid-encryption.
  const isSavingRef = useRef<Set<string>>(new Set());

  // The clip-mutation replay from the last handleFinishedRecording, consumed
  // once by the endCapture that follows it. Reset to identity after each use so
  // a bare endCapture() (upload flow) never replays a stale record-stop patch.
  const stagedClipsRef = useRef<ClipsPatch>((c) => c);

  // Used by the auto-stop finalization effect to always call the latest closure.
  const handleFinishedRecordingRef = useRef<() => Promise<void>>(async () => {});
  const endCaptureRef = useRef<() => Promise<void>>(async () => {});

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

  // Re-arm the dismiss flag and clear last take's advisories every time a new
  // recording starts.
  useEffect(() => {
    if (recorder.status !== 'recording') return;
    dispatch({ type: 'capture/advisory', advisory: { type: 'reset' } });
    const id = window.setTimeout(() => {
      setBackgroundWarningDismissed(false);
      setBackgrounded(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [recorder.status, dispatch]);

  // When Web Speech is enabled, persist live captions to t1Transcript continuously.
  useEffect(() => {
    if (!webSpeechEnabled) return;
    const clipId = activeClipIdRef.current;
    if (!clipId || !webSpeech.accumulatedText.trim()) return;
    patchClip(clipId, { t1Transcript: webSpeech.accumulatedText.trim() });
    // patchClip uses functional updates and activeClipIdRef is a stable ref — safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSpeech.accumulatedText, webSpeechEnabled]);

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
    live.reset();
    resetLiveWhisperStats();
    // 'none' override means record-now-transcribe-later: skip the live Whisper
    // preview pipeline so no chunks are sent to the (possibly unavailable) worker.
    recorder.onChunk.current = transcriptionProviderOverride === 'none' ? null : live.push;

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
      const currentT1 = await live.flush();
      const clipId = activeClipIdRef.current;
      if (clipId && currentT1) {
        patchClip(clipId, { t1Transcript: currentT1 });
      }
      const prevT1Texts = sortedClips
        .filter((c) => c.id !== clipId)
        .map((c) => c.t1Transcript?.trim())
        .filter((t): t is string => Boolean(t));
      const allT1Texts = [...prevT1Texts, ...(currentT1 ? [currentT1] : [])];
      if (allT1Texts.length > 0) {
        patchSession({ t1Transcript: allT1Texts.join('\n\n') });
      }
    } else if (recorder.status === 'paused') {
      recorder.resume();
      recorder.onChunk.current = transcriptionProviderOverride === 'none' ? null : live.push;
      if (webSpeechEnabled && webSpeech.supported) webSpeech.start(() => durationSecRef.current);
    }
  }

  function handlePauseResume() {
    void handlePauseResumeAsync();
  }

  async function handleFinishedRecording(): Promise<void> {
    // Every clip mutation below goes through `stage`, which both persists it and
    // records it into `stagedClipsRef` so the Capture-end pass that follows can
    // work from a clip list that is current *now*, rather than deferring a frame
    // and hoping React committed in between.
    let staged: ClipsPatch = (c) => c;
    stagedClipsRef.current = staged;
    const stage = (fn: ClipsPatch) => {
      const prev = staged;
      staged = (c) => fn(prev(c));
      stagedClipsRef.current = staged;
      patchClips(fn);
    };
    // Mirrors patchClip exactly, updatedAt bump included.
    const stageClip = (id: string, patch: Partial<SessionClip>) =>
      stage((clips) =>
        clips.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)),
      );

    if (!session) return;
    const clipId = activeClipIdRef.current;

    // Stop accepting new chunks immediately, then drain any in-flight Whisper
    // work so the last spoken segment's transcription lands before we clear clipId.
    recorder.onChunk.current = null;
    const whisperT1 = await live.flush();

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
              stageClip(clipId, {
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
          stageClip(clipId, {
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
        stageClip(clipId, { status: 'ready', durationSec });
      } else {
        try {
          await audioRepository.remove(clipId);
        } catch {
          /* ignore */
        }
        stage((clips) => clips.filter((c) => c.id !== clipId).map((c, i) => ({ ...c, index: i })));
      }
    }

    const webSpeechT1 = webSpeechEnabled && clipId ? webSpeech.accumulatedText.trim() : '';
    const currentClipT1 = webSpeechT1 || whisperT1;

    if (webSpeechEnabled && clipId && webSpeechT1) {
      stageClip(clipId, { t1Transcript: webSpeechT1 });
    }
    webSpeech.reset();
    live.reset();

    const prevT1Texts = sortedClips
      .filter((c) => c.id !== clipId)
      .map((c) => c.t1Transcript?.trim())
      .filter((t): t is string => Boolean(t));
    const allT1Texts = [...prevT1Texts, ...(currentClipT1 ? [currentClipT1] : [])];
    patchSession({
      status: 'draft',
      ...(allT1Texts.length > 0 ? { t1Transcript: allT1Texts.join('\n\n') } : {}),
    });
    return;
  }

  function reset() {
    setSilencedMergedBlob(null);
  }

  function handleStopAndFinish() {
    // Navigation is the caller's (useSessionMachine.stopAndFinish already
    // dispatches view/setTab), so this only runs the pipeline.
    void handleFinishedRecording().then(() => endCaptureRef.current());
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

  // ── Capture end — run the pipeline, apply its result ─────────────────────
  // Replays the clip mutations handleFinishedRecording just made (held in
  // stagedClipsRef, since React may not have committed them yet), then resets
  // the ref so a bare endCapture() from the upload flow never replays a stale
  // record-stop patch.
  async function endCapture() {
    const clips = stagedClipsRef.current(sortedClips);
    stagedClipsRef.current = (c) => c;

    let result;
    try {
      result = await runCaptureEnd({
        clips,
        loadAudio: (clipId) => audioRepository.load(clipId),
        silenceDetection: settings.audio.silenceDetection,
      });
    } catch (e) {
      addNotification('error', `Could not combine clips for playback: ${(e as Error).message}`);
      return;
    }

    if (result.droppedClips > 0) {
      addNotification(
        'warning',
        `${result.droppedClips} clip${result.droppedClips === 1 ? '' : 's'} could not be loaded for playback.`,
      );
    }
    if (result.trimFailures > 0 && import.meta.env.DEV) {
      // Untrimmed audio still transcribes, so this is not user-facing — but a VAD
      // regression used to be invisible here, showing up only as a slow T2.
      console.warn(`[useCapturePhase] silence trim failed for ${result.trimFailures} clip(s)`);
    }
    // Setting the blob is what starts T2 (useBackgroundTranscription keys off it).
    if (result.silenced) setSilencedMergedBlob(result.silenced);

    if (result.baseline) {
      // applyTierWrite guards the baseline (won't clobber a higher tier that
      // already ran), freezes t1Transcript (the t1-only join, distinct from the
      // merged compiled baseline) and clears editedTranscript.
      const patch = applyTierWrite(session ?? {}, {
        tier: 't1',
        text: result.baseline,
        freeze: result.t1,
      });
      if (patch) {
        dispatch({ type: 'transcript/setBaseline', text: result.baseline });
        patchSession(patch);
      }
    }
  }

  // Keep refs current so the auto-stop effect always invokes the latest closure.
  handleFinishedRecordingRef.current = handleFinishedRecording;
  endCaptureRef.current = endCapture;

  // The single subscriber to the RecorderEvent stream. Every event is either
  // translated into a machine action (advisories the UI renders) or handled
  // here as a side effect (chime, toast, the auto-stop finalize below) — so a
  // new stop reason is a one-file change instead of a hook *and* a component.
  useEffect(() => {
    return recorder.subscribeEvents((e) => {
      const advise = (advisory: AdvisoryAction) => dispatch({ type: 'capture/advisory', advisory });
      switch (e.type) {
        case 'backgrounded':
          setBackgrounded(true);
          break;
        case 'silenceStart':
          if (recorderStatusRef.current === 'recording') playAlertChime();
          advise({ type: 'silenceStart' });
          break;
        case 'silenceEnd':
          advise({ type: 'silenceEnd' });
          break;
        case 'softWarn':
          advise({ type: 'softWarn' });
          break;
        case 'stopped':
          if (e.reason === 'hardCap') {
            toast.warning(
              `Hit recording length cap (${settings.recordingLimits.maxMinutes} min) — auto-stopped.`,
            );
          } else if (e.reason === 'idleAuto') {
            advise({ type: 'autoStopped' });
          } else if (e.reason === 'micDisconnected') {
            toast.warning('Microphone disconnected — recording stopped and audio saved.');
          }
          // When the hard cap or idle auto-stop fires, the MediaRecorder stops
          // itself internally — handleFinishedRecording is never called by user
          // action, so the clip would stay 'pending' and never reach IDB.
          if (e.reason !== 'manual') {
            void handleFinishedRecordingRef.current().then(async () => {
              await endCaptureRef.current();
              // Manual stop is navigated by useSessionMachine.stopAndFinish; an
              // auto-stop has no user action behind it, so it navigates here.
              dispatch({ type: 'view/setTab', tab: 'review' });
            });
          }
          break;
      }
    });
  }, [recorder.subscribeEvents, dispatch, settings.recordingLimits.maxMinutes]);

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
    endCapture,
    silencedMergedBlob,
    reset,
  };
}
