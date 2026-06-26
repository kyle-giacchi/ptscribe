import { createListSliceContext } from './createListSliceContext';
import type { NoteTemplate } from '@/types';

export interface TemplatesContextValue {
  templates: NoteTemplate[];
  addTemplate: (template: NoteTemplate) => void;
  updateTemplate: (id: string, patch: Partial<NoteTemplate>) => void;
  cloneTemplate: (id: string) => NoteTemplate | undefined;
  removeTemplate: (id: string) => void;
  getTemplate: (id: string) => NoteTemplate | undefined;
}

const { Provider, useSlice } = createListSliceContext<NoteTemplate, TemplatesContextValue>({
  label: 'Templates',
  select: (appData) => appData.templates,
  selectUpdater: (app) => app.updateTemplatesSlice,
  protectBuiltins: true,
  build: (m, templates) => ({
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
        id: crypto.randomUUID(),
        name: `${src.name} (copy)`,
        builtin: false,
        createdAt: now,
        updatedAt: now,
      };
      m.add(clone);
      return clone;
    },
  }),
});

export const TemplatesProvider = Provider;
export const useTemplates = useSlice;
