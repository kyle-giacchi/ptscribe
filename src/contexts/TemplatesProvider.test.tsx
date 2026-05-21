import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { AppDataProvider } from './AppDataProvider';
import { TemplatesProvider, useTemplates } from './TemplatesProvider';
import { defaultAppData } from '@/schemas';
import { newId } from '@/utils/ids';
import type { NoteTemplate } from '@/types';

type Api = ReturnType<typeof useTemplates>;

function makeCustomTemplate(overrides: Partial<NoteTemplate> = {}): NoteTemplate {
  const now = Date.now();
  return {
    id: newId(),
    name: 'My Custom Template',
    format: 'soap',
    sections: [{ key: 'subjective', label: 'Subjective' }],
    systemPrompt: 'Write a SOAP note.',
    builtin: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function Probe({ ref }: { ref: { current: Api | null } }) {
  const api = useTemplates();
  useEffect(() => {
    ref.current = api;
  });
  return null;
}

async function renderAndWait() {
  const ref: { current: Api | null } = { current: null };
  render(
    <AppDataProvider>
      <TemplatesProvider>
        <Probe ref={ref} />
      </TemplatesProvider>
    </AppDataProvider>,
  );
  await waitFor(() => expect(ref.current).not.toBeNull());
  return ref as { current: Api };
}

describe('TemplatesProvider', () => {
  it('initializes with the built-in templates from defaultAppData', async () => {
    const ref = await renderAndWait();
    const builtinCount = defaultAppData().templates.filter((t) => t.builtin).length;
    expect(ref.current.templates.filter((t) => t.builtin).length).toBe(builtinCount);
  });

  it('addTemplate: custom template appears in the list', async () => {
    const ref = await renderAndWait();
    const template = makeCustomTemplate({ name: 'My Discharge Note' });
    await act(async () => ref.current.addTemplate(template));
    await waitFor(() =>
      expect(ref.current.templates.find((t) => t.id === template.id)).toBeDefined(),
    );
    expect(ref.current.templates.find((t) => t.id === template.id)?.name).toBe('My Discharge Note');
  });

  it('updateTemplate: changed field persists on custom template', async () => {
    const ref = await renderAndWait();
    const template = makeCustomTemplate();
    await act(async () => ref.current.addTemplate(template));
    await waitFor(() =>
      expect(ref.current.templates.find((t) => t.id === template.id)).toBeDefined(),
    );
    await act(async () => ref.current.updateTemplate(template.id, { name: 'Renamed Template' }));
    await waitFor(() =>
      expect(ref.current.templates.find((t) => t.id === template.id)?.name).toBe(
        'Renamed Template',
      ),
    );
  });

  it('removeTemplate: custom template removed from list', async () => {
    const ref = await renderAndWait();
    const template = makeCustomTemplate();
    await act(async () => ref.current.addTemplate(template));
    await waitFor(() =>
      expect(ref.current.templates.find((t) => t.id === template.id)).toBeDefined(),
    );
    await act(async () => ref.current.removeTemplate(template.id));
    await waitFor(() =>
      expect(ref.current.templates.find((t) => t.id === template.id)).toBeUndefined(),
    );
  });

  it('updateTemplate on a builtin is a no-op — builtin remains unchanged', async () => {
    const ref = await renderAndWait();
    const builtin = ref.current.templates.find((t) => t.builtin)!;
    const originalName = builtin.name;
    await act(async () => ref.current.updateTemplate(builtin.id, { name: 'Hacked Name' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(ref.current.templates.find((t) => t.id === builtin.id)?.name).toBe(originalName);
  });

  it('removeTemplate on a builtin is a no-op — builtin stays in the list', async () => {
    const ref = await renderAndWait();
    const builtin = ref.current.templates.find((t) => t.builtin)!;
    const countBefore = ref.current.templates.filter((t) => t.builtin).length;
    await act(async () => ref.current.removeTemplate(builtin.id));
    await new Promise((r) => setTimeout(r, 50));
    expect(ref.current.templates.filter((t) => t.builtin).length).toBe(countBefore);
  });

  it('cloneTemplate: creates a non-builtin copy with "(copy)" suffix', async () => {
    const ref = await renderAndWait();
    const builtin = ref.current.templates.find((t) => t.builtin)!;
    let clone: NoteTemplate | undefined;
    await act(async () => {
      clone = ref.current.cloneTemplate(builtin.id);
    });
    await waitFor(() =>
      expect(ref.current.templates.find((t) => t.id === clone?.id)).toBeDefined(),
    );
    expect(clone?.builtin).toBe(false);
    expect(clone?.name).toContain('(copy)');
    expect(clone?.id).not.toBe(builtin.id);
  });

  it('cloneTemplate: returns undefined for an unknown id', async () => {
    const ref = await renderAndWait();
    let result: NoteTemplate | undefined;
    await act(async () => {
      result = ref.current.cloneTemplate('does-not-exist');
    });
    expect(result).toBeUndefined();
  });
});
