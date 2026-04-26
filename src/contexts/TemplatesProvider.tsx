import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import { makeListMutators } from './listSlice';
import { newId } from '@/utils/ids';
import type { NoteTemplate } from '@/types';

export interface TemplatesContextValue {
  templates: NoteTemplate[];
  addTemplate: (template: NoteTemplate) => void;
  updateTemplate: (id: string, patch: Partial<NoteTemplate>) => void;
  cloneTemplate: (id: string) => NoteTemplate | undefined;
  removeTemplate: (id: string) => void;
  getTemplate: (id: string) => NoteTemplate | undefined;
}

const TemplatesContext = createContext<TemplatesContextValue | null>(null);

export function TemplatesProvider({ children }: { children: ReactNode }) {
  const { appData, updateTemplatesSlice } = useAppData();
  const templates = appData.templates;
  const value = useMemo<TemplatesContextValue>(() => {
    const m = makeListMutators(templates, updateTemplatesSlice, { protectBuiltins: true });
    return {
      templates,
      addTemplate: m.add,
      updateTemplate: m.update,
      removeTemplate: m.remove,
      getTemplate: m.get,
      cloneTemplate: (id) => {
        const src = m.get(id);
        if (!src) return undefined;
        const now = Date.now();
        const clone: NoteTemplate = {
          ...src,
          id: newId(),
          name: `${src.name} (copy)`,
          builtin: false,
          createdAt: now,
          updatedAt: now,
        };
        m.add(clone);
        return clone;
      },
    };
  }, [templates, updateTemplatesSlice]);
  return <TemplatesContext.Provider value={value}>{children}</TemplatesContext.Provider>;
}

export function useTemplates(): TemplatesContextValue {
  const ctx = useContext(TemplatesContext);
  if (!ctx) throw new Error('useTemplates must be used within TemplatesProvider');
  return ctx;
}
