import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Clipboard,
  Download,
  FileText,
  FileType,
  Loader2,
  Printer,
  Share2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { useClinician } from '@/contexts/ClinicianProvider';
import { renderNoteMarkdown, renderNotePlainText } from '@/lib/clinical/noteFormat';
import { downloadNotePDF, printNotePDF } from '@/lib/pdf/NotePDF';
import { downloadFile } from '@/utils/download';
import type { Note, NoteTemplate, Patient } from '@/types';

interface NoteExportMenuProps {
  note: Note;
  template: NoteTemplate;
  patient: Patient;
}

/**
 * Single "Export" dropdown in the note toolbar. Consolidates every output the
 * note supports — copy, print, and download in each format — into one menu so
 * the editor stays uncluttered. All work is client-side (no exfiltration).
 */
export function NoteExportMenu({ note, template, patient }: NoteExportMenuProps) {
  const { clinician } = useClinician();
  const [open, setOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canShare = typeof navigator.share === 'function';

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function fileBase(): string {
    const date = new Date(note.createdAt).toISOString().slice(0, 10);
    return `${patient.lastName}_${patient.firstName}_${date}`.replace(/\s+/g, '_');
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`Copied as ${label}`),
      () => toast.error('Copy failed'),
    );
  }

  async function withPdfBusy(action: () => Promise<void>) {
    setPdfBusy(true);
    // Yield so the spinner paints before the synchronous PDF layout work begins
    // (otherwise the button looks frozen, notably on iPad).
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    try {
      await action();
    } finally {
      setPdfBusy(false);
    }
  }

  async function handlePrint() {
    await withPdfBusy(async () => {
      const opened = await printNotePDF({ note, template, patient, clinician });
      if (!opened) toast.error('Print blocked — allow pop-ups for this site, then retry.');
    });
  }

  async function handlePdf() {
    await withPdfBusy(async () => {
      try {
        await downloadNotePDF({ note, template, patient, clinician }, `${fileBase()}.pdf`);
      } catch (e) {
        toast.error(`PDF export failed: ${(e as Error).message}`);
      }
    });
  }

  async function handleShare() {
    const text = renderNotePlainText(note, template, patient);
    const title = `PT Note — ${patient.firstName} ${patient.lastName}`;
    try {
      await navigator.share({ title, text });
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') toast.error('Share failed');
    }
  }

  function run(action: () => void | Promise<void>) {
    setOpen(false);
    void action();
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="btn btn-ghost"
        style={{ height: 34, padding: '0 12px', fontSize: 12.5 }}
        title="Copy, print, or download this note"
      >
        {pdfBusy ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Upload size={13} strokeWidth={2} />
        )}
        Export
        <ChevronDown
          size={12}
          strokeWidth={2}
          style={{
            color: 'var(--color-pt-text-2)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 180ms ease',
          }}
        />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 60,
            width: 232,
            borderRadius: 12,
            border: '1px solid var(--color-pt-border)',
            background: 'var(--color-pt-surface)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            overflow: 'hidden',
            padding: 4,
          }}
        >
          <MenuItem
            icon={Clipboard}
            onClick={() =>
              run(() => copyText(renderNotePlainText(note, template, patient), 'plain text'))
            }
          >
            Copy as text
          </MenuItem>
          <MenuItem
            icon={FileType}
            onClick={() =>
              run(() => copyText(renderNoteMarkdown(note, template, patient), 'Markdown'))
            }
          >
            Copy as Markdown
          </MenuItem>

          <Divider />

          <MenuItem icon={Printer} onClick={() => run(handlePrint)}>
            Print…
          </MenuItem>
          <MenuItem icon={Download} onClick={() => run(handlePdf)}>
            Download PDF
          </MenuItem>
          <MenuItem
            icon={FileType}
            onClick={() =>
              run(() =>
                downloadFile(
                  `${fileBase()}.md`,
                  renderNoteMarkdown(note, template, patient),
                  'text/markdown',
                ),
              )
            }
          >
            Download Markdown (.md)
          </MenuItem>
          <MenuItem
            icon={FileText}
            onClick={() =>
              run(() =>
                downloadFile(
                  `${fileBase()}.txt`,
                  renderNotePlainText(note, template, patient),
                  'text/plain',
                ),
              )
            }
          >
            Download text (.txt)
          </MenuItem>

          {canShare && (
            <>
              <Divider />
              <MenuItem icon={Share2} onClick={() => run(handleShare)}>
                Share…
              </MenuItem>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof FileText;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md"
      style={{
        padding: '8px 10px',
        fontSize: 13,
        color: 'var(--color-pt-text)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-pt-surface-alt)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Icon size={14} strokeWidth={2} style={{ color: 'var(--color-pt-text-2)', flexShrink: 0 }} />
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, margin: '4px 2px', background: 'var(--color-pt-border)' }} />;
}
