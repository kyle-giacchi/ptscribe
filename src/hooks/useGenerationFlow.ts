import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { audioRepository } from '@/services/AudioRepository';
import { generateNote } from '@/services/ai/generate';
import { newId } from '@/utils/ids';
import { isDemoMode, DEMO_PATIENT_ID } from '@/lib/demoMode';
import { useNotes } from '@/contexts/NotesProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import {
  useActionGuard,
  MAX_GENERATES_PER_SESSION,
} from '@/hooks/useActionGuard';
import type {
  Note,
  NoteFormat,
  NoteSection,
  Patient,
  Session,
  Settings,
  NoteTemplate,
} from '@/types';

export interface UseGenerationFlowParams {
  session: Session | undefined;
  patient: Patient | undefined;
  note: Note | undefined;
  template: NoteTemplate | undefined;
  settings: Settings;
  transcript: string;
  patchSession: (patch: Partial<Session>) => void;
  setError: (msg: string | null) => void;
  setBusy: (busy: 'transcribing' | 'generating' | null) => void;
  setTranscript: (next: string) => void;
  setActiveTab: (tab: 'record' | 'review') => void;
  setPendingDeleteSession: (v: boolean) => void;
  /** Action guard counter + record (shared across transcription + generation flows). */
  checkActionGuard: ReturnType<typeof useActionGuard>['checkActionGuard'];
  recordAction: ReturnType<typeof useActionGuard>['recordAction'];
}

export interface UseGenerationFlowResult {
  handleGenerate: () => Promise<void>;
  handleSectionChange: (key: string, body: string) => void;
  handleReplaceSections: (sections: NoteSection[]) => void;
  handleFinalize: () => void;
  handleUnfinalize: () => void;
  handleDeleteSession: () => Promise<void>;
  handleCopyNoteMarkdown: (markdown: string) => void;
  missingRequiredLabels: string[];
}

/**
 * Owns note creation/generation/finalize/delete handlers for a session.
 * `ensureNote` lazily creates the note row on first edit so empty sessions
 * never persist a placeholder note.
 */
export function useGenerationFlow(params: UseGenerationFlowParams): UseGenerationFlowResult {
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
    setTranscript,
    setActiveTab,
    setPendingDeleteSession,
    checkActionGuard,
    recordAction,
  } = params;

  const navigate = useNavigate();
  const { addNote, updateNote, finalizeNote, unfinalizeNote, removeNote } = useNotes();
  const { removeSession } = useSessions();

  const isGeneratingRef = useRef(false);

  function ensureNote(initialSections?: NoteSection[]): Note {
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
  }

  // ── Note generation / lifecycle ──────────────────────────────────────────
  async function handleGenerate() {
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
          transcriptSource: session!.transcriptSource,
          signal: controller.signal,
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
        patchSession({ status: 'ready' });
        toast.success('Draft note generated');
      } catch (e) {
        setError((e as Error).message);
        patchSession({ status: 'draft' });
      } finally {
        clearTimeout(abortTimer);
        setBusy(null);
      }
    } finally {
      isGeneratingRef.current = false;
    }
  }

  function handleReplaceSections(sections: NoteSection[]) {
    if (!note) return;
    updateNote(note.id, { sections, updatedAt: Date.now() });
  }

  function handleSectionChange(key: string, body: string) {
    const target = ensureNote();
    const next = target.sections.map((s) => (s.key === key ? { ...s, body } : s));
    // Audit trail: if this note was previously finalized (finalizedAt set, finalized now false),
    // record the first-edit timestamp and increment the edit count.
    const wasFinalized = !target.finalized && target.finalizedAt !== undefined;
    const auditPatch = wasFinalized
      ? {
          editedAfterFinalizedAt: target.editedAfterFinalizedAt ?? Date.now(),
          editedAfterFinalizedCount: (target.editedAfterFinalizedCount ?? 0) + 1,
        }
      : {};
    updateNote(target.id, { sections: next, ...auditPatch });
  }

  const missingRequiredLabels: string[] = (() => {
    if (!template || !note) return [];
    const bodyByKey = new Map(note.sections.map((s) => [s.key, s.body]));
    return template.sections
      .filter((s) => s.required && !(bodyByKey.get(s.key) ?? '').trim())
      .map((s) => s.label);
  })();

  function handleFinalize() {
    if (missingRequiredLabels.length > 0) {
      toast.error(`Required sections empty: ${missingRequiredLabels.join(', ')}`);
      return;
    }
    const target = ensureNote();
    finalizeNote(target.id);
    patchSession({ status: 'finalized' });
    toast.success('Note finalized');
  }

  function handleUnfinalize() {
    if (!note) return;
    unfinalizeNote(note.id);
    patchSession({ status: 'ready' });
  }

  async function handleDeleteSession() {
    if (isDemoMode() && session?.patientId === DEMO_PATIENT_ID) {
      const demoResults = await Promise.allSettled(
        (session?.clips ?? []).map((clip) => audioRepository.remove(clip.id)),
      );
      if (demoResults.some((r) => r.status === 'rejected')) {
        toast.warning('Some audio could not be removed from storage.');
      }
      if (note) removeNote(note.id);
      patchSession({ clips: [], status: 'draft', transcript: undefined, noteId: undefined });
      setTranscript('');
      setActiveTab('record');
      setPendingDeleteSession(false);
      return;
    }
    if (note) removeNote(note.id);
    const results = await Promise.allSettled(
      (session?.clips ?? []).map((clip) => audioRepository.remove(clip.id)),
    );
    if (results.some((r) => r.status === 'rejected')) {
      toast.warning('Some audio could not be removed from storage.');
    }
    removeSession(session!.id);
    navigate('/today', { replace: true });
  }

  // ── Copy full note ────────────────────────────────────────────────────────
  function handleCopyNoteMarkdown(markdown: string) {
    navigator.clipboard.writeText(markdown).then(
      () => toast.success('Note copied to clipboard'),
      () => toast.error('Copy failed'),
    );
  }

  return {
    handleGenerate,
    handleSectionChange,
    handleReplaceSections,
    handleFinalize,
    handleUnfinalize,
    handleDeleteSession,
    handleCopyNoteMarkdown,
    missingRequiredLabels,
  };
}

export { MAX_GENERATES_PER_SESSION };
