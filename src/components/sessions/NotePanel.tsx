import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ClipboardList, Copy, Download, FileText, Loader2, Share2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useClinician } from '@/contexts/ClinicianProvider';
import { NoteSectionEditor } from '@/components/notes/NoteSectionEditor';
import { renderNoteMarkdown, renderNotePlainText } from '@/lib/clinical/noteFormat';
import { downloadNotePDF } from '@/lib/pdf/NotePDF';
import { downloadFile } from '@/utils/download';
import { Modal } from '@/components/ui/Modal';
import { TemplateDropdown } from './TemplateDropdown';
import type { Note, NoteSection, NoteTemplate, Patient } from '@/types';

type Busy = null | 'transcribing' | 'generating';

export interface NotePanelProps {
  patient: Patient;
  note: Note | undefined;
  template: NoteTemplate | undefined;
  templates: NoteTemplate[];
  transcript: string;
  /** Sum of all clip durations in seconds. */
  totalDurationSec: number;
  busy: Busy;
  canGenerate: boolean;
  onSectionChange: (key: string, body: string) => void;
  onTemplateChange: (id: string) => void;
  onManageTemplates: () => void;
  onGenerate: () => void;
}

export function NotePanel({
  patient,
  note,
  template,
  templates,
  transcript: _transcript,
  totalDurationSec: _totalDurationSec,
  busy,
  canGenerate,
  onSectionChange,
  onTemplateChange,
  onManageTemplates,
  onGenerate,
}: NotePanelProps) {
  const navigate = useNavigate();
  const [overwriteConfirmOpen, setOverwriteConfirmOpen] = useState(false);
  const sections: NoteSection[] =
    note?.sections ??
    template?.sections.map((s) => ({ key: s.key, label: s.label, body: '' })) ??
    [];

  const isGenerating = busy === 'generating';
  const hasDraftContent = note?.sections.some((s) => s.body.trim().length > 0) ?? false;

  function handleGenerateClick() {
    if (hasDraftContent) {
      setOverwriteConfirmOpen(true);
    } else {
      onGenerate();
    }
  }

  return (
    <div className="space-y-4">
      {/* Heading + generate controls */}
      <div>
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-pt-text)' }}>
          Clinical note
        </h2>
        <div className="flex items-center gap-2">
          <TemplateDropdown
            template={template}
            templates={templates}
            onChange={onTemplateChange}
            onManage={onManageTemplates}
          />
          <button
            type="button"
            className="btn btn-primary"
            style={{ height: 32, padding: '0 12px', fontSize: 12.5, boxSizing: 'border-box' }}
            disabled={!canGenerate || isGenerating}
            onClick={handleGenerateClick}
          >
            {isGenerating ? (
              <><Loader2 size={13} className="animate-spin" /> Generating…</>
            ) : (
              <><Sparkles size={13} strokeWidth={2} /> {hasDraftContent ? 'Regenerate' : 'Generate'}</>
            )}
          </button>
        </div>
      </div>

      {/* Overwrite confirmation modal */}
      <Modal
        open={overwriteConfirmOpen}
        onClose={() => setOverwriteConfirmOpen(false)}
        title="Replace existing note?"
        size="sm"
      >
        <p style={{ fontSize: 14, color: 'var(--color-pt-text-2)', lineHeight: 1.5 }}>
          Regenerating will erase your current clinical note. This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={() => setOverwriteConfirmOpen(false)}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => { setOverwriteConfirmOpen(false); onGenerate(); }}
          >
            <Sparkles size={13} strokeWidth={2} /> Regenerate
          </button>
        </div>
      </Modal>

      {/* Finalized banner */}
      {note?.finalized && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--color-positive)',
            background: 'var(--color-surface-2)',
            color: 'var(--color-positive)',
          }}
        >
          Finalized {note.finalizedAt ? new Date(note.finalizedAt).toLocaleString() : ''} — unlock
          to edit.
        </div>
      )}

      {/* Audit trail banner */}
      {note?.finalized && note.editedAfterFinalizedAt && (
        <div
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--color-caution)',
            background: 'color-mix(in oklab, var(--color-caution) 8%, transparent)',
            color: 'var(--color-caution)',
          }}
        >
          <AlertTriangle size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
          Edited after finalization ({new Date(note.editedAfterFinalizedAt).toLocaleString()})
        </div>
      )}

      {/* Generating spinner */}
      {busy === 'generating' && (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-fg-muted)' }}>
          <Loader2 size={14} className="animate-spin" /> Generating note…
        </div>
      )}

      {/* Section list */}
      {sections.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-fg-subtle)' }}>
          Pick a template to see its sections.
        </p>
      ) : (
        <div>
          {sections.map((s) => {
            const isPlanSection = s.key === 'plan';
            return (
              <div
                key={s.key}
                style={{ borderBottom: '1px dashed var(--color-pt-border)', paddingBottom: 16, marginBottom: 16 }}
              >
                {/* Section header */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-[11px] font-semibold tracking-widest uppercase"
                    style={{ color: 'var(--color-fg-muted)', letterSpacing: '0.1em' }}
                  >
                    {s.label}
                  </span>
                  {isPlanSection && (
                    <button
                      type="button"
                      className="btn btn-ghost p-0.5"
                      title="Add exercise to patient plan"
                      style={{ color: 'var(--color-fg-subtle)' }}
                      onClick={() => navigate(`/patients/${patient.id}`)}
                    >
                      <ClipboardList size={11} strokeWidth={2} />
                    </button>
                  )}
                  {s.body.trim() && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ color: 'var(--color-fg-subtle)', fontSize: 11, padding: '2px 6px', gap: 3 }}
                      onClick={() =>
                        navigator.clipboard.writeText(s.body).then(
                          () => toast.success(`${s.label} copied`),
                          () => toast.error('Copy failed'),
                        )
                      }
                    >
                      <Copy size={10} strokeWidth={2} /> Copy
                    </button>
                  )}
                </div>

                {/* Section body editor */}
                <NoteSectionEditor
                  key={`${note?.id ?? 'template'}-${s.key}`}
                  value={s.body}
                  readOnly={!!note?.finalized}
                  onChange={(body) => onSectionChange(s.key, body)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Export row */}
      {note && template && <NoteExportRow note={note} template={template} patient={patient} />}
    </div>
  );
}

type CopyFormat = 'plain' | 'markdown';

function NoteExportRow({
  note,
  template,
  patient,
}: {
  note: Note;
  template: NoteTemplate;
  patient: Patient;
}) {
  const { clinician } = useClinician();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [copyFormat, setCopyFormat] = useState<CopyFormat>('plain');
  const canShare = typeof navigator.share === 'function';

  function fileBase(): string {
    const date = new Date(note.createdAt).toISOString().slice(0, 10);
    return `${patient.lastName}_${patient.firstName}_${date}`.replace(/\s+/g, '_');
  }

  async function handlePdf() {
    setPdfBusy(true);
    // Yield to the browser so the spinner re-render is painted before the
    // PDF renderer starts its synchronous layout work (which would otherwise
    // block the UI thread and make the button appear frozen on iPad).
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    try {
      await downloadNotePDF({ note, template, patient, clinician }, `${fileBase()}.pdf`);
    } catch (e) {
      toast.error(`PDF export failed: ${(e as Error).message}`);
    } finally {
      setPdfBusy(false);
    }
  }

  function handleCopy() {
    const text =
      copyFormat === 'markdown'
        ? renderNoteMarkdown(note, template, patient)
        : renderNotePlainText(note, template, patient);
    navigator.clipboard.writeText(text).then(
      () => toast.success(copyFormat === 'markdown' ? 'Copied as Markdown' : 'Copied as plain text'),
      () => toast.error('Copy failed'),
    );
  }

  async function handleShare() {
    const text = renderNotePlainText(note, template, patient);
    const title = `PT Note — ${patient.firstName} ${patient.lastName}`;
    if (canShare) {
      try {
        await navigator.share({ title, text });
      } catch (e) {
        // User cancelled share or share failed — only show error for non-abort
        if ((e as DOMException).name !== 'AbortError') {
          toast.error('Share failed');
        }
      }
    } else {
      navigator.clipboard.writeText(text).then(
        () => toast.success('Note copied to clipboard'),
        () => toast.error('Copy failed'),
      );
    }
  }

  return (
    <div
      className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t px-1 py-2"
      style={{
        borderColor: 'var(--color-pt-border)',
        background: 'var(--color-pt-surface)',
      }}
    >
      <button
        type="button"
        className="btn btn-primary text-xs"
        onClick={handleCopy}
        title={`Copy entire note as ${copyFormat === 'markdown' ? 'Markdown' : 'plain text'}`}
      >
        <Copy size={12} strokeWidth={2} /> Copy note
      </button>
      {canShare && (
        <button
          type="button"
          className="btn btn-secondary text-xs"
          onClick={handleShare}
          title="Share note via iOS/device share sheet"
        >
          <Share2 size={12} strokeWidth={2} /> Share
        </button>
      )}
      <div
        role="radiogroup"
        aria-label="Copy format"
        className="inline-flex overflow-hidden rounded-md border text-[11px]"
        style={{ borderColor: 'var(--color-pt-border)' }}
      >
        {(['plain', 'markdown'] as const).map((fmt) => {
          const active = copyFormat === fmt;
          return (
            <button
              key={fmt}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setCopyFormat(fmt)}
              className="px-2 py-1"
              style={{
                background: active ? 'var(--color-pt-accent-soft)' : 'transparent',
                color: active ? 'var(--color-pt-accent-fg)' : 'var(--color-fg-subtle)',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                border: 'none',
              }}
            >
              {fmt === 'plain' ? 'Plain' : 'Markdown'}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="btn btn-secondary text-xs"
        disabled={pdfBusy}
        onClick={handlePdf}
      >
        {pdfBusy ? (
          <>
            <Loader2 size={12} className="animate-spin" /> Building PDF…
          </>
        ) : (
          <>
            <Download size={12} strokeWidth={2} /> Export PDF
          </>
        )}
      </button>
      <button
        type="button"
        className="btn btn-ghost text-xs"
        onClick={() =>
          downloadFile(
            `${fileBase()}.md`,
            renderNoteMarkdown(note, template, patient),
            'text/markdown',
          )
        }
      >
        <Download size={12} strokeWidth={2} /> .md
      </button>
      <button
        type="button"
        className="btn btn-ghost text-xs"
        onClick={() =>
          downloadFile(
            `${fileBase()}.txt`,
            renderNotePlainText(note, template, patient),
            'text/plain',
          )
        }
      >
        <FileText size={12} strokeWidth={2} /> .txt
      </button>
    </div>
  );
}
