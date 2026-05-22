import { useRef, useState } from 'react';
import { Copy, Loader2, RotateCw, Sparkles, SlidersHorizontal } from 'lucide-react';
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
  return (m.tone ? 1 : 0) + m.emphasis.length + (m.customInstruction?.trim() ? 1 : 0);
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
        className="inline-flex items-center"
        style={{
          gap: 8, height: 34, padding: '0 12px', borderRadius: 7,
          border: '1px solid var(--color-pt-border)',
          background: popoverOpen ? 'var(--color-pt-border)' : 'var(--color-pt-surface)',
          color: activeCount > 0 ? 'var(--color-pt-text)' : 'var(--color-pt-text-2)',
          fontSize: 12.5, fontWeight: 500,
          cursor: 'pointer',
        }}
        title="Prompt modifiers"
      >
        <SlidersHorizontal size={13} strokeWidth={2} />
        {activeCount > 0 ? `Modifier · ${activeCount}` : 'Modifier'}
      </button>

      {popoverOpen && (
        <ModifierPopover
          modifiers={modifiers}
          anchorRef={modifierBtnRef}
          onClose={() => setPopoverOpen(false)}
          onChange={onModifiersChange}
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
