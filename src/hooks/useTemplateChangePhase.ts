import { useCallback, useRef } from 'react';
import type { Dispatch } from 'react';
import type { SessionMachineAction } from './sessionMachine/types';
import type { Note, NoteSection, NoteTemplate, Session } from '@/types';

export interface UseTemplateChangePhaseParams {
  session: Session | undefined;
  note: Note | undefined;
  allTemplates: NoteTemplate[];
  patchSession: (patch: Partial<Session>) => void;
  replaceSections: (sections: NoteSection[]) => void;
  dispatch: Dispatch<SessionMachineAction>;
}

export interface TemplateChangePhaseResult {
  /** May open the template-change gate when the note has content. */
  changeTemplate: (templateId: string) => void;
  /** Applies the switch directly — called on mount-time init and on gate confirm. */
  applyTemplateChange: (templateId: string) => void;
}

/**
 * Template switching + per-template section cache (CONTEXT.md — content-loss
 * gate). Caches the leaving template's sections so switching back restores
 * them instead of resetting to blank.
 */
export function useTemplateChangePhase({
  session,
  note,
  allTemplates,
  patchSession,
  replaceSections,
  dispatch,
}: UseTemplateChangePhaseParams): TemplateChangePhaseResult {
  const sectionCacheRef = useRef(new Map<string, NoteSection[]>());

  const applyTemplateChange = useCallback(
    (newTemplateId: string) => {
      const newTpl = allTemplates.find((t) => t.id === newTemplateId);
      if (!newTpl) return;
      // Snapshot sections for the template we're leaving.
      const leavingTemplateId = session?.templateId;
      if (note?.sections && leavingTemplateId) {
        sectionCacheRef.current.set(leavingTemplateId, note.sections);
      }
      patchSession({ templateId: newTemplateId });
      // Restore cached sections for the incoming template, or reset to empty.
      const cached = sectionCacheRef.current.get(newTemplateId);
      const targetSections =
        cached ?? newTpl.sections.map((s) => ({ key: s.key, label: s.label, body: '' }));
      if (note) replaceSections(targetSections);
    },
    [allTemplates, note, session?.templateId, patchSession, replaceSections],
  );

  const changeTemplate = useCallback(
    (templateId: string) => {
      if (!session || templateId === session.templateId) return;
      const hasNoteContent = !!note?.sections.some((s) => s.body.trim().length > 0);
      if (hasNoteContent) {
        dispatch({
          type: 'gate/open',
          gate: { kind: 'template-change', targetTemplateId: templateId },
        });
        return;
      }
      applyTemplateChange(templateId);
    },
    [session, note, applyTemplateChange, dispatch],
  );

  return { changeTemplate, applyTemplateChange };
}
