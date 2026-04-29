import { AnimatePresence, motion } from 'motion/react';
import { Check, Plus } from 'lucide-react';
import { Eyebrow, PtButton } from '@/components/design';
import { duration, ease } from '@/lib/motion';
import type { NoteTemplate, SessionType } from '@/types';

function TemplateOption({
  template,
  selected,
  onSelect,
}: {
  template: NoteTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 12px',
          borderRadius: 10,
          border: `1px solid ${selected ? 'var(--color-pt-accent)' : 'var(--color-pt-border)'}`,
          background: selected ? 'var(--color-pt-accent-soft)' : 'var(--color-pt-surface)',
          textAlign: 'left',
          fontSize: 13,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ display: 'flex', minWidth: 0, flex: 1, alignItems: 'center', gap: 8 }}>
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: `1px solid ${selected ? 'var(--color-pt-accent)' : 'var(--color-pt-border)'}`,
              background: selected ? 'var(--color-pt-accent)' : 'transparent',
              color: '#ffffff',
              flexShrink: 0,
            }}
          >
            {selected && <Check size={10} strokeWidth={3} />}
          </span>
          <span
            style={{
              fontWeight: 600,
              color: selected ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {template.name}
          </span>
        </span>
        <span
          style={{
            flexShrink: 0,
            fontSize: 11.5,
            color: selected ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-3)',
          }}
        >
          {template.builtin ? 'Built-in' : 'Custom'} · {template.sections.length} sections
        </span>
      </button>
    </li>
  );
}

function CompactTemplate({
  template,
  hasMore,
  onChange,
}: {
  template: NoteTemplate | undefined;
  hasMore: boolean;
  onChange: () => void;
}) {
  if (!template) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface-mut)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-pt-text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {template.name}
          </span>
          <span
            style={{
              flexShrink: 0,
              padding: '2px 7px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: 'var(--color-pt-accent-soft)',
              color: 'var(--color-pt-accent-fg)',
            }}
          >
            {template.builtin ? 'Built-in' : 'Custom'}
          </span>
        </div>
        <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>
          {template.sections.length} sections
        </div>
      </div>
      {hasMore && (
        <PtButton variant="ghost" onClick={onChange} style={{ padding: '6px 10px', fontSize: 12 }}>
          Change
        </PtButton>
      )}
    </div>
  );
}

export function TemplateSection({
  sessionType,
  visitTemplates,
  effectiveTemplateId,
  showAllTemplates,
  onPickTemplate,
  onShowAll,
  onCreate,
}: {
  sessionType: SessionType;
  visitTemplates: NoteTemplate[];
  effectiveTemplateId: string;
  showAllTemplates: boolean;
  onPickTemplate: (id: string) => void;
  onShowAll: () => void;
  onCreate: () => void;
}) {
  const isEmpty = visitTemplates.length === 0;
  const showCompact = !isEmpty && (visitTemplates.length === 1 || !showAllTemplates);
  const compactTemplate =
    visitTemplates.find((t) => t.id === effectiveTemplateId) ?? visitTemplates[0];
  return (
    <div style={{ borderTop: '1px solid var(--color-pt-border)', paddingTop: 16 }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={sessionType}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: duration.base, ease: ease.enter }}
          style={{ display: 'grid', gap: 10 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow>Template</Eyebrow>
            <button
              type="button"
              onClick={onCreate}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 11.5,
                color: 'var(--color-pt-accent-fg)',
                cursor: 'pointer',
                padding: 0,
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Plus size={11} strokeWidth={2} />
              New custom template
            </button>
          </div>

          {isEmpty && (
            <div
              style={{
                border: '1px dashed var(--color-pt-border)',
                borderRadius: 10,
                padding: 12,
                fontSize: 12,
                color: 'var(--color-pt-text-3)',
              }}
            >
              No templates for this visit type. Create one, or start without a template.
            </div>
          )}

          {showCompact && (
            <CompactTemplate
              template={compactTemplate}
              hasMore={visitTemplates.length > 1}
              onChange={onShowAll}
            />
          )}

          {!isEmpty && !showCompact && (
            <ul style={{ display: 'grid', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
              {visitTemplates.map((t) => (
                <TemplateOption
                  key={t.id}
                  template={t}
                  selected={t.id === effectiveTemplateId}
                  onSelect={() => onPickTemplate(t.id)}
                />
              ))}
            </ul>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
