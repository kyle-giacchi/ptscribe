import { useCallback, useMemo, useRef } from 'react';
import type { Dispatch } from 'react';
import { toast } from 'sonner';
import { useNotes } from '@/contexts/NotesProvider';
import { generateNote } from '@/services/ai/generate';
import { AiCallError, friendlyAiError } from '@/services/ai/errors';
import { appendAiError } from '@/lib/debug/aiErrorLog';
import { MAX_GENERATES_PER_SESSION, type useActionGuard } from './useActionGuard';
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
  dispatch: Dispatch<SessionMachineAction>;
  checkActionGuard: ReturnType<typeof useActionGuard>['checkActionGuard'];
  recordAction: ReturnType<typeof useActionGuard>['recordAction'];
}

export type GenerateMode = 'replace' | 'append';

export interface GeneratePhaseResult {
  run: (mode?: GenerateMode, feedback?: string) => Promise<void>;
  finalize: () => void;
  unfinalize: () => void;
  sectionChange: (key: string, body: string) => void;
  replaceSections: (sections: NoteSection[]) => void;
  copyMarkdown: (markdown: string) => void;
  clearAiError: () => void;
  missingRequiredLabels: string[];
}

/**
 * Merge freshly generated sections onto existing ones, keyed by section key.
 * Existing body text is preserved and the generated text is appended below it
 * (blank-line separated). Sections empty on one side fall back to the other.
 */
function appendSections(existing: NoteSection[], generated: NoteSection[]): NoteSection[] {
  const priorByKey = new Map(existing.map((s) => [s.key, s.body]));
  return generated.map((s) => {
    const prior = (priorByKey.get(s.key) ?? '').trim();
    const next = s.body.trim();
    if (prior && next) return { ...s, body: `${priorByKey.get(s.key)}\n\n${s.body}` };
    if (prior) return { ...s, body: priorByKey.get(s.key)! };
    return s;
  });
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
  dispatch,
  checkActionGuard,
  recordAction,
}: UseGeneratePhaseParams): GeneratePhaseResult {
  const { addNote, updateNote, finalizeNote, unfinalizeNote } = useNotes();
  const isGeneratingRef = useRef(false);

  const ensureNote = useCallback(
    (initialSections?: NoteSection[], extraFields?: Partial<Note>): Note => {
      if (note) return note;
      const now = Date.now();
      const sections =
        initialSections ??
        template?.sections.map((s) => ({ key: s.key, label: s.label, body: '' })) ??
        [];
      const created: Note = {
        id: crypto.randomUUID(),
        sessionId: session!.id,
        patientId: patient!.id,
        format: (template?.format ?? 'custom') as NoteFormat,
        templateId: template?.id,
        sections,
        finalized: false,
        createdAt: now,
        updatedAt: now,
        ...extraFields,
      };
      // Single write only: `addNote` and a follow-up `updateNote` would both
      // close over the same stale `notes` snapshot, so the second write would
      // clobber the first and drop this note entirely. Bake every field in here.
      addNote(created);
      patchSession({ noteId: created.id });
      return created;
    },
    [note, template, session, patient, addNote, patchSession],
  );

  const run = useCallback(
    async (mode: GenerateMode = 'replace', feedback?: string) => {
      if (isGeneratingRef.current) return;
      isGeneratingRef.current = true;
      try {
        if (!template) return;
        if (!transcript.trim()) {
          toast.error('Add a transcript first.');
          return;
        }
        if (settings.ai.generation.provider === 'none') {
          toast.error('Pick a generation provider in Settings to draft a note.');
          return;
        }
        const genProvider = settings.ai.generation.provider;

        // Lifetime cap is session-backed (persisted) so it survives reload, Revert,
        // and Unlock — mirrors the cloud-transcribe cap in useTranscriptSource.
        // Absent count reads as 0. checkActionGuard below enforces only the cooldown.
        const spentGen = session?.generateCount ?? 0;
        if (spentGen >= MAX_GENERATES_PER_SESSION) {
          toast.error(`Note generation limit reached (${MAX_GENERATES_PER_SESSION} per session).`);
          return;
        }

        const guard = checkActionGuard('generate');
        if (!guard.allowed) {
          toast.error(guard.reason);
          return;
        }

        dispatch({ type: 'error/set', message: null });
        // generate/start flips generate.phase to 'generating' — the machine's
        // busy selector derives from it; there is no separate busy setter.
        dispatch({ type: 'generate/start' });
        patchSession({ status: 'generating' });

        const controller = new AbortController();
        const abortTimer = setTimeout(() => controller.abort(), 180_000);
        try {
          const result = await generateNote({
            provider: genProvider,
            model: settings.ai.generation.model,
            template,
            transcript,
            patient: patient!,
            sessionType: session!.type,
            modifiers: session!.modifiers,
            activeTranscriptTier: session!.activeTranscriptTier,
            regenerationDraft: note,
            regenerationFeedback: feedback,
            signal: controller.signal,
            onRetry: (info) =>
              dispatch({
                type: 'generate/retry',
                status: { provider: genProvider, attempt: info.attempt, max: info.max },
              }),
          });

          const modifierSnapshot = session!.modifiers;
          const transcriptSnapshot = transcript;
          if (note) {
            const nextSections =
              mode === 'append' ? appendSections(note.sections, result.sections) : result.sections;
            updateNote(note.id, {
              sections: nextSections,
              templateId: template.id,
              format: template.format,
              modifiers: modifierSnapshot,
              generatedFromTranscript: transcriptSnapshot,
            });
          } else {
            ensureNote(result.sections, {
              modifiers: modifierSnapshot,
              generatedFromTranscript: transcriptSnapshot,
            });
          }
          recordAction('generate');
          dispatch({
            type: 'generate/success',
            rawText: result.rawText,
            prompts: result.debugPrompts,
            keyReport: result.keyReport,
          });
          const hasContent = result.sections.some((s) => s.body.trim().length > 0);
          const { matched, returned } = result.keyReport;
          // A successful HTTP call can still produce a blank note. Record those
          // content failures to the per-session error log, folded into the SAME
          // status patch (a second patchSession would clobber it — see
          // appendAiError docs / the makeListMutators double-write footgun).
          let errorPatch: Partial<Session> = {};
          if (hasContent) {
            toast.success('Draft note generated');
          } else if (returned.length > 0 && matched.length === 0) {
            // The model replied with a JSON object, but none of its keys match
            // the template's section keys — so every section fell back to "".
            // This is a template/response mismatch, not an empty transcript.
            toast.error(
              `Note couldn't be filled: the AI returned sections (${returned.join(', ')}) that don't match this template (${result.keyReport.expected.join(', ')}). See Debug → Section mapping.`,
            );
            errorPatch = {
              aiErrors: appendAiError(session!.aiErrors, {
                call: 'generate',
                provider: 'anthropic',
                kind: 'key_mismatch',
                detail: `Returned [${returned.join(', ')}] vs expected [${result.keyReport.expected.join(', ')}]`,
                rawSnippet: result.rawText ?? undefined,
                keyReport: result.keyReport,
              }),
            };
          } else {
            toast.warning(
              'Note generated, but all sections are empty — try using a more detailed transcript.',
            );
            errorPatch = {
              aiErrors: appendAiError(session!.aiErrors, {
                call: 'generate',
                provider: 'anthropic',
                kind: 'blank',
                detail: 'All sections empty after generation.',
                rawSnippet: result.rawText ?? undefined,
                keyReport: result.keyReport,
              }),
            };
          }
          // Fold the persisted generate-cap increment into the SAME success patch as
          // status + any errorPatch. A separate patchSession here would clobber those
          // fields (makeListMutators double-write footgun). A successful HTTP call
          // counts against the cap regardless of whether the note came back blank.
          patchSession({ status: 'ready', generateCount: spentGen + 1, ...errorPatch });
        } catch (e) {
          let errorPatch: Partial<Session> = {};
          if (e instanceof AiCallError) {
            dispatch({ type: 'generate/error', aiError: e });
            toast.error(friendlyAiError(e).title);
            errorPatch = {
              aiErrors: appendAiError(session?.aiErrors, {
                call: 'generate',
                provider: e.provider,
                kind: e.kind,
                status: e.status,
                attempts: e.attemptsMade,
                detail: e.message,
                rawSnippet: e.rawDetail,
              }),
            };
          } else {
            dispatch({ type: 'generate/error', aiError: null });
            dispatch({ type: 'error/set', message: (e as Error).message });
            errorPatch = {
              aiErrors: appendAiError(session?.aiErrors, {
                call: 'generate',
                kind: 'parse',
                detail: (e as Error).message,
              }),
            };
          }
          patchSession({ status: 'draft', ...errorPatch });
        } finally {
          clearTimeout(abortTimer);
        }
      } finally {
        isGeneratingRef.current = false;
      }
    },
    [
      template,
      transcript,
      settings,
      session,
      patient,
      note,
      patchSession,
      checkActionGuard,
      recordAction,
      ensureNote,
      updateNote,
      dispatch,
    ],
  );

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
    // finalizedAt anchors finalize-gated audio retention (CONTEXT.md §Audio retention).
    patchSession({ status: 'finalized', finalizedAt: Date.now() });
    toast.success('Note finalized');
  }, [missingRequiredLabels, ensureNote, finalizeNote, patchSession]);

  const unfinalize = useCallback(() => {
    if (!note) return;
    unfinalizeNote(note.id);
    // Re-opening clears the finalize anchor so retention does not purge a session
    // that is active again. Re-finalizing re-stamps finalizedAt.
    patchSession({ status: 'ready', finalizedAt: undefined });
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
}
