import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useNotes } from '@/contexts/NotesProvider';
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
} from './sessionMachine/types';
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
  patchSession: (patch: Partial<Session>) => void;
  // Used by the transcribe slice — recording flow (still external in PR 2B)
  // produces the merged blobs by calling our setters and dropping into
  // patchClips/patchClip; PR 2C absorbs that producer side.
  patchClips: (mapper: (clips: SessionClip[]) => SessionClip[]) => void;
  patchClip: (clipId: string, patch: Partial<SessionClip>) => void;
  setTranscript: (next: string) => void;
  setEditedTranscript?: (next: string) => void;
  setError: (msg: string | null) => void;
  setBusy: (busy: 'transcribing' | 'generating' | null) => void;
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

export interface SessionMachine {
  state: SessionMachineState;
  generate: SessionMachineGenerateApi;
  transcribe: SessionMachineTranscribeApi;
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
 * IMPORTANT: this hook calls `useBackgroundTranscription` internally, so
 * it MUST be invoked before `useRecordingFlow` in the consumer — the
 * background pass depends on hook-ordering for its registered effects.
 */
export function useSessionMachine(params: UseSessionMachineParams): SessionMachine {
  const {
    session,
    patient,
    note,
    template,
    settings,
    transcript,
    patchSession,
    setTranscript,
    setEditedTranscript,
    setError,
    setBusy,
  } = params;

  const { addNote, updateNote, finalizeNote, unfinalizeNote } = useNotes();
  const [state, dispatch] = useReducer(sessionMachineReducer, initialSessionMachineState);

  // ── Slot state (not lifecycle) ──────────────────────────────────────────
  const [mergedAudioBlob, setMergedAudioBlob] = useState<Blob | null>(null);
  const [silencedMergedBlob, setSilencedMergedBlob] = useState<Blob | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  const { checkActionGuard, recordAction, transcribeUsed, generateUsed } = useActionGuard();

  // Background local-Whisper pass — auto-fires when silencedMergedBlob is
  // produced by the recording flow.
  useBackgroundTranscription({ session, patchSession, setTranscript, silencedMergedBlob });

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
          toneStyle: settings.orgPolicy.toneStyle,
          activeTranscriptTier: session!.activeTranscriptTier,
          signal: controller.signal,
          onRetry: (info) =>
            dispatch({
              type: 'generate/retry',
              status: { provider: 'anthropic', attempt: info.attempt, max: info.max },
            }),
        });

        if (note) {
          updateNote(note.id, {
            sections: result.sections,
            templateId: template.id,
            format: template.format,
          });
        } else {
          ensureNote(result.sections);
        }
        recordAction('generate');
        dispatch({ type: 'generate/success', rawText: result.rawText });
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

  return useMemo(
    () => ({ state, generate, transcribe: transcribeApi, actionGuard }),
    [state, generate, transcribeApi, actionGuard],
  );
}
