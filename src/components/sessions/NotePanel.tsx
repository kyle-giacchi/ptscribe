import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Copy, Download, FileText, Eye, Sparkles, XCircle, ChevronDown, AlertTriangle, Share2, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { useClinician } from '@/contexts/ClinicianProvider';
import { Field, Select } from '@/components/ui/Field';
import { NoteSectionEditor } from '@/components/notes/NoteSectionEditor';
import { renderNoteMarkdown, renderNotePlainText } from '@/lib/clinical/noteFormat';
import { downloadNotePDF } from '@/lib/pdf/NotePDF';
import { downloadFile } from '@/utils/download';
import { ConfirmBanner } from './ConfirmBanner';
import { assessTranscriptQuality } from '@/utils/transcriptQuality';
import type { Note, NoteSection, NoteTemplate, Patient } from '@/types';

type Busy = null | 'transcribing' | 'generating';

export interface NotePanelProps {
  patient: Patient;
  note: Note | undefined;
  template: NoteTemplate | undefined;
  templates: NoteTemplate[];
  transcript: string;
  /** Sum of all clip durations in seconds — used for transcript quality heuristic. */
  totalDurationSec: number;
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
            autoFocus
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
  totalDurationSec,
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
  const navigate = useNavigate();
  const [showPrompt, setShowPrompt] = useState(false);
  const sections: NoteSection[] =
    note?.sections ??
    template?.sections.map((s) => ({ key: s.key, label: s.label, body: '' })) ??
    [];

  const generationLabel =
    generationProvider === 'anthropic' ? modelLabel('anthropic', generationModel) : undefined;

  const transcriptQuality = assessTranscriptQuality(transcript, totalDurationSec);

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
          transcriptQuality={transcriptQuality}
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

      <NoteEditor sections={sections} readOnly={!!note?.finalized} onViewPlan={() => navigate(`/patients/${patient.id}`)} onChange={onSectionChange} />

      {note && template && <NoteExportRow note={note} template={template} patient={patient} />}
    </div>
  );
}

function NoteActions({
  note,
  busy,
  canGenerate,
  transcriptQuality,
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
  transcriptQuality: 'ok' | 'low' | 'unknown';
  generateUsed: number;
  generateCap: number;
  generationLabel?: string;
  generationReady: boolean;
  onGenerate: () => void;
  onUnfinalize: () => void;
}) {
  const [pendingReplace, setPendingReplace] = useState(false);
  const [qualityNoticeDismissed, setQualityNoticeDismissed] = useState(false);
  const hasDraftContent = !!note?.sections.some((s) => s.body.trim().length > 0);
  const generateBudgetSpent = generateUsed >= generateCap;
  const generateDisabled =
    busy === 'generating' || !canGenerate || generateBudgetSpent || !generationReady;

  const generateTitle = !generationReady
    ? 'Enable Anthropic generation in Settings to draft a note.'
    : generateBudgetSpent
      ? `Per-session limit reached (${generateUsed}/${generateCap}). Reload to reset.`
      : `Drafts a note from the transcript (${generateUsed}/${generateCap} used).`;

  const showQualityWarning =
    transcriptQuality === 'low' && canGenerate && !qualityNoticeDismissed;

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
      {showQualityWarning && (
        <div
          className="flex items-start gap-1.5 rounded-md px-2.5 py-2 text-[11px] leading-snug"
          style={{
            background: 'color-mix(in oklab, var(--color-caution) 10%, transparent)',
            border: '1px solid color-mix(in oklab, var(--color-caution) 35%, transparent)',
            color: 'var(--color-caution-fg, var(--color-fg-muted))',
          }}
        >
          <AlertTriangle
            size={12}
            strokeWidth={2}
            style={{ color: 'var(--color-caution)', flexShrink: 0, marginTop: 1 }}
          />
          <span style={{ flex: 1 }}>
            Transcript appears short or fragmented — review the note carefully after generation.
          </span>
          <button
            type="button"
            aria-label="Dismiss quality warning"
            onClick={() => setQualityNoticeDismissed(true)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0 0 0 4px',
              color: 'var(--color-fg-subtle)',
              flexShrink: 0,
              lineHeight: 0,
            }}
          >
            <XCircle size={12} strokeWidth={2} />
          </button>
        </div>
      )}
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
  onViewPlan,
  onChange,
}: {
  sections: NoteSection[];
  readOnly: boolean;
  onViewPlan?: () => void;
  onChange: (key: string, body: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (sections.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-fg-subtle)' }}>
        Pick a template to see its sections.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {sections.map((s) => {
        const open = !collapsed.has(s.key);
        const isPlanSection = s.key === 'plan';
        return (
          <div
            key={s.key}
            className="overflow-hidden rounded-lg border"
            style={{ borderColor: 'var(--color-pt-border)' }}
          >
            <div
              className="flex items-center"
              style={{ background: 'var(--color-pt-surface-alt)' }}
            >
              <button
                type="button"
                className="flex flex-1 items-center justify-between gap-2 px-3 py-2 text-left"
                onClick={() => toggle(s.key)}
              >
                <span
                  className="text-xs font-semibold tracking-wide uppercase"
                  style={{ color: 'var(--color-fg-muted)' }}
                >
                  {s.label}
                </span>
                <ChevronDown
                  size={13}
                  strokeWidth={2}
                  style={{
                    color: 'var(--color-fg-subtle)',
                    flexShrink: 0,
                    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 200ms ease-out',
                  }}
                />
              </button>
              {isPlanSection && (
                <button
                  type="button"
                  className="flex items-center rounded px-2 py-2 transition-colors hover:bg-[var(--color-pt-surface-alt)]"
                  style={{ color: 'var(--color-fg-subtle)', flexShrink: 0 }}
                  title="Add exercise to patient plan"
                  onClick={() => onViewPlan?.()}
                >
                  <ClipboardList size={11} strokeWidth={2} />
                </button>
              )}
              {s.body.trim() && (
                <button
                  type="button"
                  className="flex items-center rounded px-2 py-2 transition-colors hover:bg-[var(--color-pt-surface-alt)]"
                  style={{ color: 'var(--color-fg-subtle)', flexShrink: 0 }}
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
            <div
              style={{
                display: 'grid',
                gridTemplateRows: open ? '1fr' : '0fr',
                transition: 'grid-template-rows 200ms ease-out',
              }}
            >
              <div style={{ overflow: 'hidden' }}>
                <div className="p-3">
                  <NoteSectionEditor
                    value={s.body}
                    readOnly={readOnly}
                    onChange={(body) => onChange(s.key, body)}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
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

function modelLabel(_provider: string, model: string): string {
  const short = model.split('/').pop() ?? model;
  return short.replace(/^claude-/, '');
}
