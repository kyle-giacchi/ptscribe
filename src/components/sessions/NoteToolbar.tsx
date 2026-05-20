import { useState } from 'react';
import { Copy, Loader2, RotateCw, Sparkles, SlidersHorizontal } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { TemplateDropdown } from './TemplateDropdown';
import type { NoteTemplate } from '@/types';

interface NoteToolbarProps {
  template: NoteTemplate | undefined;
  templates: NoteTemplate[];
  hasDraftContent: boolean;
  canGenerate: boolean;
  isGenerating: boolean;
  noteExists: boolean;
  onTemplateChange: (id: string) => void;
  onManageTemplates: () => void;
  onGenerate: () => void;
  onCopyNote: () => void;
}

export function NoteToolbar({
  template, templates,
  hasDraftContent, canGenerate, isGenerating, noteExists,
  onTemplateChange, onManageTemplates, onGenerate, onCopyNote,
}: NoteToolbarProps) {
  const [overwriteOpen, setOverwriteOpen] = useState(false);

  function handleRegenerate() {
    if (hasDraftContent) {
      setOverwriteOpen(true);
    } else {
      onGenerate();
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
        type="button"
        disabled
        aria-disabled="true"
        title="Prompt modifiers — coming soon"
        className="inline-flex items-center"
        style={{
          gap: 8, height: 34, padding: '0 12px', borderRadius: 7,
          border: '1px solid var(--color-pt-border)',
          background: 'var(--color-pt-surface)',
          color: 'var(--color-pt-text-2)',
          fontSize: 12.5, fontWeight: 500,
          opacity: 0.55, cursor: 'not-allowed',
        }}
      >
        <SlidersHorizontal size={13} strokeWidth={2} />
        Modifier
      </button>

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
        disabled={!canGenerate || isGenerating}
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
        title="Replace existing note?"
        size="sm"
      >
        <p style={{ fontSize: 14, color: 'var(--color-pt-text-2)', lineHeight: 1.5 }}>
          Regenerating will erase your current clinical note. This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={() => setOverwriteOpen(false)}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => { setOverwriteOpen(false); onGenerate(); }}
          >
            <RotateCw size={13} strokeWidth={2} /> Regenerate
          </button>
        </div>
      </Modal>
    </div>
  );
}
