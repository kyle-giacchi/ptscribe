import { memo, useRef, useState } from 'react';
import { ChevronDown, Loader2, RotateCw, Sparkles, SlidersHorizontal } from 'lucide-react';
import { TemplateDropdown } from './TemplateDropdown';
import { ModifierPopover } from './ModifierPopover';
import { NoteExportMenu } from './NoteExportMenu';
import type { Note, NoteTemplate, Patient, SessionModifiers } from '@/types';

interface NoteToolbarProps {
  template: NoteTemplate | undefined;
  templates: NoteTemplate[];
  hasDraftContent: boolean;
  canGenerate: boolean;
  isGenerating: boolean;
  note: Note | undefined;
  patient: Patient;
  modifiers: SessionModifiers;
  onTemplateChange: (id: string) => void;
  onManageTemplates: () => void;
  /** Fires the workflow's generate intent — the machine raises the append/replace
   *  or feedback gate as needed. */
  onGenerate: () => void;
  onModifiersChange: (next: SessionModifiers) => void;
}

function countActiveModifiers(m: SessionModifiers): number {
  return (
    (m.voice ? 1 : 0) +
    (m.length ? 1 : 0) +
    (m.language ? 1 : 0) +
    m.clinicalDetail.length +
    m.codingBilling.length +
    m.beyondNote.length +
    m.customInstructions.filter((c) => c.active).length
  );
}

function NoteToolbarImpl({
  template,
  templates,
  hasDraftContent,
  canGenerate,
  isGenerating,
  note,
  patient,
  modifiers,
  onTemplateChange,
  onManageTemplates,
  onGenerate,
  onModifiersChange,
}: NoteToolbarProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const modifierBtnRef = useRef<HTMLButtonElement>(null);

  const activeCount = countActiveModifiers(modifiers);
  const hasCustomActive = modifiers.customInstructions.some((c) => c.active);

  const generateDisabled = !canGenerate || isGenerating;

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--color-pt-surface)',
        border: '1px solid var(--color-pt-border)',
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 18,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Left cluster */}
      <TemplateDropdown
        template={template}
        templates={templates}
        onChange={onTemplateChange}
        onManage={onManageTemplates}
      />

      <button
        ref={modifierBtnRef}
        type="button"
        onClick={() => setPopoverOpen((o) => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 34,
          padding: '0 10px',
          borderRadius: 7,
          border: `1px solid ${popoverOpen ? 'var(--color-pt-text-2)' : 'var(--color-pt-border)'}`,
          background: popoverOpen ? 'var(--color-pt-border)' : 'var(--color-pt-surface)',
          color: 'var(--color-pt-text)',
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          cursor: 'pointer',
        }}
        title="Prompt modifiers"
      >
        <SlidersHorizontal size={13} strokeWidth={2} />
        Modifier
        {activeCount > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 18,
              padding: '0 6px',
              borderRadius: 999,
              border: '1px solid var(--color-pt-border)',
              background: 'var(--color-pt-bg, var(--color-pt-surface))',
              color: 'var(--color-pt-text-2)',
              fontSize: 'var(--text-2xs)',
              fontWeight: 600,
            }}
          >
            {activeCount}
          </span>
        )}
        {hasCustomActive && <Sparkles size={11} style={{ color: '#5e7e62', marginLeft: -2 }} />}
        <ChevronDown size={12} style={{ color: 'var(--color-pt-text-2)' }} />
      </button>

      {popoverOpen && (
        <ModifierPopover
          modifiers={modifiers}
          anchorRef={modifierBtnRef}
          onClose={() => setPopoverOpen(false)}
          onApply={(next) => {
            onModifiersChange(next);
            setPopoverOpen(false);
          }}
        />
      )}

      <div style={{ flex: 1 }} />

      {/* Right cluster */}
      {note && template && <NoteExportMenu note={note} template={template} patient={patient} />}

      <button
        type="button"
        className="btn btn-primary"
        style={{ height: 34, padding: '0 14px', fontSize: 'var(--text-sm)' }}
        disabled={generateDisabled}
        aria-busy={isGenerating}
        onClick={() => onGenerate()}
      >
        {isGenerating ? (
          <>
            <Loader2 size={13} className="animate-spin" /> Generating…
          </>
        ) : hasDraftContent ? (
          <>
            <RotateCw size={13} strokeWidth={2} /> Regenerate
          </>
        ) : (
          <>
            <Sparkles size={13} strokeWidth={2} /> Generate
          </>
        )}
      </button>
    </div>
  );
}

export const NoteToolbar = memo(NoteToolbarImpl);
