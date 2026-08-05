// The effective template catalog — local templates merged with org-shared
// ones (deduped, local wins), ranked builtin > org > user, plus the single
// org-default precedence rule (D1 policy wins over the local pin). Session,
// Templates, and NewSession all read this instead of re-deriving it.
import { useMemo } from 'react';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { useOrgConfig } from '@/contexts/OrgConfigProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import type { NoteFormat, NoteTemplate } from '@/types';

function rank(t: NoteTemplate, orgTemplateIds: Set<string>): number {
  return t.builtin ? 0 : orgTemplateIds.has(t.id) ? 1 : 2;
}

export function useTemplateCatalog() {
  const { templates } = useTemplates();
  const { sharedTemplates, policy } = useOrgConfig();
  const { settings } = useSettings();

  const orgTemplateIds = useMemo(
    () => new Set(sharedTemplates.map((t) => t.id)),
    [sharedTemplates],
  );

  const all = useMemo(() => {
    const localIds = new Set(templates.map((t) => t.id));
    const merged = [...templates, ...sharedTemplates.filter((t) => !localIds.has(t.id))];
    return merged.sort(
      (a, b) => rank(a, orgTemplateIds) - rank(b, orgTemplateIds) || a.name.localeCompare(b.name),
    );
  }, [templates, sharedTemplates, orgTemplateIds]);

  const byFormat = useMemo(() => {
    const buckets = new Map<NoteFormat, NoteTemplate[]>();
    for (const t of all) {
      const bucket = buckets.get(t.format);
      if (bucket) bucket.push(t);
      else buckets.set(t.format, [t]);
    }
    return buckets;
  }, [all]);

  const defaultTemplateId = policy.defaultTemplateId ?? settings.orgPolicy.activeTemplateId;

  return {
    all,
    orgTemplateIds,
    defaultTemplateId,
    forFormat: (format: NoteFormat) => byFormat.get(format) ?? [],
  };
}
