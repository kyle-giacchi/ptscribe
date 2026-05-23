import { useRef, useState } from 'react';
import { ChevronDown, Copy, Loader2, RotateCw, Sparkles, SlidersHorizontal } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { TemplateDropdown } from './TemplateDropdown';
import { ModifierPopover } from './ModifierPopover';
import type { NoteTemplate, SessionModifiers } from '@/types';

interface NoteToolbarProps {
  template: NoteTemplate | undefined;
  templates: NoteTemplate[];
  hasDraftContent: boolean;
  canGenerate: boolean;
  canRegenerate: boolean;
  isGenerating: boolean;
  noteExists: boolean;
  modifiers: SessionModifiers;
  onTemplateChange: (id: string) => void;
  onManageTemplates: () => void;
  onGenerate: (mode: 'replace' | 'append') => void;
  onCopyNote: () => void;
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

export function NoteToolbar({
  template, templates,
  hasDraftContent, canGenerate, canRegenerate, isGenerating, noteExists,
  modifiers, onTemplateChange, onManageTemplates, onGenerate, onCopyNote, onModifiersChange,
}: NoteToolbarProps) {
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const modifierBtnRef = useRef<HTMLButtonElement>(null);

  const activeCount = countActiveModifiers(modifiers);
  const hasCustomActive = modifiers.customInstructions.some((c) => c.active);

  const generateDisabled = !canGenerate || isGenerating || (noteExists && !canRegenerate);
  const generateTitle = noteExists && !canRegenerate
    ? 'No changes to transcript or modifiers since last generation'
    : undefined;

  function handleRegenerate() {
    if (hasDraftContent) {
      setOverwriteOpen(true);
    } else {
      onGenerate('replace');
    }
  }

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
          display: 'inline-flex', alignItems: 'center',
          gap: 6, height: 34, padding: '0 10px', borderRadius: 7,
          border: `1px solid ${popoverOpen ? 'var(--color-pt-text-2)' : 'var(--color-pt-border)'}`,
          background: popoverOpen ? 'var(--color-pt-border)' : 'var(--color-pt-surface)',
          color: 'var(--color-pt-text)',
          fontSize: 12.5, fontWeight: 500,
          cursor: 'pointer',
        }}
        title="Prompt modifiers"
      >
        <SlidersHorizontal size={13} strokeWidth={2} />
        Modifier
        {activeCount > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            height: 18, padding: '0 6px', borderRadius: 999,
            border: '1px solid var(--color-pt-border)',
            background: 'var(--color-pt-bg, var(--color-pt-surface))',
            color: 'var(--color-pt-text-2)',
            fontSize: 10, fontWeight: 600,
          }}>
            {activeCount}
          </span>
        )}
        {hasCustomActive && (
          <Sparkles size={11} style={{ color: '#5e7e62', marginLeft: -2 }} />
        )}
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
      {noteExists && (
        <button
          type="button"
          onClick={onCopyNote}
          className="btn btn-ghost"
          style={{ height: 34, padding: '0 12px', fontSize: 12.5 }}
          title="Copy entire note"
        >
          <Copy size={13} strokeWidth={2} /> Copy note
        </button>
      )}

      <button
        type="button"
        className="btn btn-primary"
        style={{ height: 34, padding: '0 14px', fontSize: 12.5 }}
        disabled={generateDisabled}
        aria-busy={isGenerating}
        title={generateTitle}
        onClick={handleRegenerate}
      >
        {isGenerating ? (
          <><Loader2 size={13} className="animate-spin" /> Generating…</>
        ) : hasDraftContent ? (
          <><RotateCw size={13} strokeWidth={2} /> Regenerate</>
        ) : (
          <><Sparkles size={13} strokeWidth={2} /> Generate</>
        )}
      </button>

      <Modal
        open={overwriteOpen}
        onClose={() => setOverwriteOpen(false)}
        title="This note already has content"
        size="sm"
      >
        <p style={{ fontSize: 14, color: 'var(--color-pt-text-2)', lineHeight: 1.5 }}>
          You've already written into this note. Choose <strong>Append</strong> to add the newly
          generated text below what's there, or <strong>Replace</strong> to overwrite it. Replacing
          cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => setOverwriteOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={generateDisabled}
            onClick={() => {
              setOverwriteOpen(false);
              if (!generateDisabled) onGenerate('append');
            }}
          >
            <Sparkles size={13} strokeWidth={2} /> Append
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={generateDisabled}
            onClick={() => {
              setOverwriteOpen(false);
              if (!generateDisabled) onGenerate('replace');
            }}
          >
            <RotateCw size={13} strokeWidth={2} /> Replace
          </button>
        </div>
      </Modal>
    </div>
  );
}
