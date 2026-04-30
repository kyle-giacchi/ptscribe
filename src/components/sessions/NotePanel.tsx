import { useState, useEffect } from 'react';
import { Loader2, Copy, Download, FileText, Eye, Sparkles, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useClinician } from '@/contexts/ClinicianProvider';
import { Field, Select } from '@/components/ui/Field';
import { NoteSectionEditor } from '@/components/notes/NoteSectionEditor';
import { renderNoteMarkdown, renderNotePlainText } from '@/lib/clinical/noteFormat';
import { downloadNotePDF } from '@/lib/pdf/NotePDF';
import { downloadFile } from '@/utils/download';
import { ConfirmBanner } from './ConfirmBanner';
import type { Note, NoteSection, NoteTemplate, Patient } from '@/types';

type Busy = null | 'transcribing' | 'generating';

export interface NotePanelProps {
  patient: Patient;
  note: Note | undefined;
  template: NoteTemplate | undefined;
  templates: NoteTemplate[];
  transcript: string;
  busy: Busy;
  generateUsed: number;
  generateCap: number;
  generationProvider: string;
  generationModel: string;
  generationReady: boolean;
  onTemplateChange: (id: string) => void;
  onGenerate: () => void;
  onUnfinalize: () => void;
  onSectionChange: (key: string, body: string) => void;
}

function PromptModal({
  templateName,
  systemPrompt,
  onClose,
}: {
  templateName: string;
  systemPrompt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-lg flex-col rounded-xl shadow-xl"
        style={{
          background: 'var(--color-pt-surface)',
          border: '1px solid var(--color-pt-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--color-pt-border)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--color-fg)' }}>
            {templateName} — System Prompt
          </span>
          <button
            type="button"
            className="btn btn-ghost p-1.5"
            onClick={onClose}
            aria-label="Close"
          >
            <XCircle size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="overflow-auto p-4">
          <pre
            className="text-xs leading-relaxed whitespace-pre-wrap"
            style={{ color: 'var(--color-fg-muted)', fontFamily: 'var(--font-mono, monospace)' }}
          >
            {systemPrompt}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function NotePanel({
  patient,
  note,
  template,
  templates,
  transcript,
  busy,
  generateUsed,
  generateCap,
  generationProvider,
  generationModel,
  generationReady,
  onTemplateChange,
  onGenerate,
  onUnfinalize,
  onSectionChange,
}: NotePanelProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const sections: NoteSection[] =
    note?.sections ??
    template?.sections.map((s) => ({ key: s.key, label: s.label, body: '' })) ??
    [];

  const generationLabel =
    generationProvider === 'anthropic' ? modelLabel('anthropic', generationModel) : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Field label="" className="!space-y-0">
            <Select
              value={template?.id ?? ''}
              onChange={(e) => onTemplateChange(e.target.value)}
              className="text-xs"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          {template?.systemPrompt && (
            <button
              type="button"
              className="btn btn-ghost p-1.5"
              title="View generation prompt"
              onClick={() => setShowPrompt(true)}
            >
              <Eye size={14} strokeWidth={2} />
            </button>
          )}
        </div>
        <NoteActions
          note={note}
          busy={busy}
          canGenerate={transcript.trim().length > 0}
          generateUsed={generateUsed}
          generateCap={generateCap}
          generationLabel={generationLabel}
          generationReady={generationReady}
          onGenerate={onGenerate}
          onUnfinalize={onUnfinalize}
        />
      </div>

      {showPrompt && template && (
        <PromptModal
          templateName={template.name}
          systemPrompt={template.systemPrompt}
          onClose={() => setShowPrompt(false)}
        />
      )}

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

      <NoteEditor sections={sections} readOnly={!!note?.finalized} onChange={onSectionChange} />

      {note && template && <NoteExportRow note={note} template={template} patient={patient} />}
    </div>
  );
}

function NoteActions({
  note,
  busy,
  canGenerate,
  generateUsed,
  generateCap,
  generationLabel,
  generationReady,
  onGenerate,
  onUnfinalize,
}: {
  note: Note | undefined;
  busy: Busy;
  canGenerate: boolean;
  generateUsed: number;
  generateCap: number;
  generationLabel?: string;
  generationReady: boolean;
  onGenerate: () => void;
  onUnfinalize: () => void;
}) {
  const [pendingReplace, setPendingReplace] = useState(false);
  const hasDraftContent = !!note?.sections.some((s) => s.body.trim().length > 0);
  const generateBudgetSpent = generateUsed >= generateCap;
  const generateDisabled =
    busy === 'generating' || !canGenerate || generateBudgetSpent || !generationReady;

  const generateTitle = !generationReady
    ? 'Enable Anthropic generation in Settings to draft a note.'
    : generateBudgetSpent
      ? `Per-session limit reached (${generateUsed}/${generateCap}). Reload to reset.`
      : `Drafts a note from the transcript (${generateUsed}/${generateCap} used).`;

  function handleGenerateClick() {
    if (hasDraftContent) {
      setPendingReplace(true);
      return;
    }
    onGenerate();
  }

  if (pendingReplace) {
    return (
      <ConfirmBanner
        message="This will replace the existing note draft."
        confirmLabel="Yes, replace"
        onCancel={() => setPendingReplace(false)}
        onConfirm={() => {
          setPendingReplace(false);
          onGenerate();
        }}
      />
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={generateDisabled}
          onClick={handleGenerateClick}
          title={generateTitle}
        >
          {busy === 'generating' ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Sparkles size={14} strokeWidth={2} /> Generate from transcript
            </>
          )}
        </button>
        <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-fg-subtle)' }}>
          {generateUsed}/{generateCap}
        </span>
        {generationLabel && (
          <span
            className="text-[11px]"
            style={{ color: 'var(--color-fg-subtle)' }}
            title="Generation model"
          >
            {generationLabel} · Anthropic
          </span>
        )}
        {note?.finalized && (
          <button type="button" className="btn btn-ghost" onClick={onUnfinalize}>
            Unlock
          </button>
        )}
      </div>
      {!generationReady && (
        <p className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Enable Anthropic generation in Settings to draft notes.
        </p>
      )}
      {generationReady && generateBudgetSpent && (
        <p className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Session limit reached — reload the page to reset.
        </p>
      )}
    </div>
  );
}

function NoteEditor({
  sections,
  readOnly,
  onChange,
}: {
  sections: NoteSection[];
  readOnly: boolean;
  onChange: (key: string, body: string) => void;
}) {
  if (sections.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-fg-subtle)' }}>
        Pick a template to see its sections.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {sections.map((s) => (
        <div key={s.key} className="space-y-1">
          <div className="flex items-center justify-between">
            <div
              className="text-xs font-medium tracking-wide uppercase"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              {s.label}
            </div>
            {s.body.trim() && (
              <button
                type="button"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors hover:bg-[var(--color-pt-surface-alt)]"
                style={{ color: 'var(--color-fg-subtle)' }}
                title={`Copy ${s.label}`}
                onClick={() =>
                  navigator.clipboard.writeText(s.body).then(
                    () => toast.success(`${s.label} copied`),
                    () => toast.error('Copy failed'),
                  )
                }
              >
                <Copy size={11} strokeWidth={2} />
              </button>
            )}
          </div>
          <NoteSectionEditor
            value={s.body}
            readOnly={readOnly}
            onChange={(body) => onChange(s.key, body)}
          />
        </div>
      ))}
    </div>
  );
}

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

  function fileBase(): string {
    const date = new Date(note.createdAt).toISOString().slice(0, 10);
    return `${patient.lastName}_${patient.firstName}_${date}`.replace(/\s+/g, '_');
  }

  async function handlePdf() {
    setPdfBusy(true);
    try {
      await downloadNotePDF({ note, template, patient, clinician }, `${fileBase()}.pdf`);
    } catch (e) {
      toast.error(`PDF export failed: ${(e as Error).message}`);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 pt-2">
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
        onClick={() => {
          const md = renderNoteMarkdown(note, template, patient);
          navigator.clipboard.writeText(md).then(
            () => toast.success('Copied to clipboard'),
            () => toast.error('Copy failed'),
          );
        }}
      >
        <Copy size={12} strokeWidth={2} /> Copy markdown
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

function modelLabel(_provider: string, model: string): string {
  const short = model.split('/').pop() ?? model;
  return short.replace(/^claude-/, '');
}
