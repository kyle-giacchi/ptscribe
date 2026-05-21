import { useCallback, useMemo, useRef } from 'react';
import type { Dispatch } from 'react';
import { toast } from 'sonner';
import { useNotes } from '@/contexts/NotesProvider';
import { generateNote } from '@/services/ai/generate';
import { AiCallError, friendlyAiError } from '@/services/ai/errors';
import { newId } from '@/utils/ids';
import type { useActionGuard } from './useActionGuard';
import type { SessionMachineAction } from './sessionMachine/types';
import type {
  Note,
  NoteFormat,
  NoteSection,
  NoteTemplate,
  Patient,
  Session,
  Settings,
} from '@/types';

export interface UseGeneratePhaseParams {
  session: Session | undefined;
  patient: Patient | undefined;
  note: Note | undefined;
  template: NoteTemplate | undefined;
  transcript: string;
  settings: Settings;
  patchSession: (patch: Partial<Session>) => void;
  setError: (msg: string | null) => void;
  setBusy: (busy: 'transcribing' | 'generating' | null) => void;
  dispatch: Dispatch<SessionMachineAction>;
  checkActionGuard: ReturnType<typeof useActionGuard>['checkActionGuard'];
  recordAction: ReturnType<typeof useActionGuard>['recordAction'];
}

export interface GeneratePhaseResult {
  run: () => Promise<void>;
  finalize: () => void;
  unfinalize: () => void;
  sectionChange: (key: string, body: string) => void;
  replaceSections: (sections: NoteSection[]) => void;
  copyMarkdown: (markdown: string) => void;
  clearAiError: () => void;
  missingRequiredLabels: string[];
}

/**
 * Owns the Generate → Finalize phase of the session lifecycle:
 * note generation, section edits, finalize/unfinalize.
 */
export function useGeneratePhase({
  session,
  patient,
  note,
  template,
  transcript,
  settings,
  patchSession,
  setError,
  setBusy,
  dispatch,
  checkActionGuard,
  recordAction,
}: UseGeneratePhaseParams): GeneratePhaseResult {
  const { addNote, updateNote, finalizeNote, unfinalizeNote } = useNotes();
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
    dispatch,
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

  const clearAiError = useCallback(() => {
    dispatch({ type: 'generate/clearAiError' });
  }, [dispatch]);

  return useMemo<GeneratePhaseResult>(
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
    [run, finalize, unfinalize, sectionChange, replaceSections, copyMarkdown, clearAiError, missingRequiredLabels],
  );
}
