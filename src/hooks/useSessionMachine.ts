import { useCallback, useMemo, useReducer, useRef } from 'react';
import { toast } from 'sonner';
import { useNotes } from '@/contexts/NotesProvider';
import { generateNote } from '@/services/ai/generate';
import { AiCallError, friendlyAiError } from '@/services/ai/errors';
import { newId } from '@/utils/ids';
import { sessionMachineReducer } from './sessionMachine/reducer';
import {
  initialSessionMachineState,
  type SessionMachineState,
} from './sessionMachine/types';
import type { useActionGuard } from './useActionGuard';
import type {
  Note,
  NoteFormat,
  NoteSection,
  NoteTemplate,
  Patient,
  Session,
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
  setError: (msg: string | null) => void;
  setBusy: (busy: 'transcribing' | 'generating' | null) => void;
  checkActionGuard: ReturnType<typeof useActionGuard>['checkActionGuard'];
  recordAction: ReturnType<typeof useActionGuard>['recordAction'];
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

export interface SessionMachine {
  state: SessionMachineState;
  generate: SessionMachineGenerateApi;
}

/**
 * Session lifecycle machine. PR 2A scope: generation phase only.
 * PR 2B will absorb transcription; PR 2C the recording flow.
 *
 * State (phase + transient AI surface) lives in the reducer. Side effects
 * — the AI call, toasts, repository writes, abort timers, status patches
 * on the underlying `Session` — live in runners that dispatch into it.
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
    setError,
    setBusy,
    checkActionGuard,
    recordAction,
  } = params;

  const { addNote, updateNote, finalizeNote, unfinalizeNote } = useNotes();
  const [state, dispatch] = useReducer(sessionMachineReducer, initialSessionMachineState);

  const isGeneratingRef = useRef(false);

  // Lazy note creation — keeps empty sessions free of placeholder notes.
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

  const run = useCallback(async () => {
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
      // Audit trail: if this note was previously finalized then unfinalized,
      // record the first-edit timestamp and increment the edit count.
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

  const clearAiError = useCallback(() => {
    dispatch({ type: 'generate/clearAiError' });
  }, []);

  const generate = useMemo<SessionMachineGenerateApi>(
    () => ({
      run,
      finalize,
      unfinalize,
      sectionChange,
      replaceSections,
      copyMarkdown,
      clearAiError,
      missingRequiredLabels,
    }),
    [
      run,
      finalize,
      unfinalize,
      sectionChange,
      replaceSections,
      copyMarkdown,
      clearAiError,
      missingRequiredLabels,
    ],
  );

  return useMemo(() => ({ state, generate }), [state, generate]);
}
