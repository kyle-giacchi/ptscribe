import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ClipboardList, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { NoteSectionEditor } from '@/components/notes/NoteSectionEditor';
import type { Note, NoteSection, NoteTemplate, Patient } from '@/types';

export interface NotePanelProps {
  patient: Patient;
  note: Note | undefined;
  template: NoteTemplate | undefined;
  /**
   * True when the note was generated from inputs (transcript / template /
   * modifiers) that have since changed. Surfaces a banner prompting the
   * clinician to regenerate. Suppressed once the note is finalized.
   */
  isStale?: boolean;
  onSectionChange: (key: string, body: string) => void;
}

function NotePanelImpl({ patient, note, template, isStale, onSectionChange }: NotePanelProps) {
  const navigate = useNavigate();
  const sections: NoteSection[] =
    note?.sections ??
    template?.sections.map((s) => ({ key: s.key, label: s.label, body: '' })) ??
    [];

  return (
    <div className="space-y-4">
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

      {/* Stale banner — note no longer matches the current transcript/template/modifiers */}
      {isStale && !note?.finalized && (
        <div
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--color-caution)',
            background: 'color-mix(in oklab, var(--color-caution) 8%, transparent)',
            color: 'var(--color-caution)',
          }}
        >
          <AlertTriangle size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
          Generated from an earlier version of the transcript — regenerate to sync, or finalize
          as-is.
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
            const isAssessment = s.key.toLowerCase() === 'assessment';
            const isPlanSection = s.key === 'plan';
            return (
              <div
                key={s.key}
                style={{
                  borderBottom: '1px dashed var(--color-pt-border)',
                  paddingBottom: 16,
                  marginBottom: 16,
                  paddingLeft: isAssessment ? 10 : 0,
                  borderLeft: isAssessment ? '3px solid var(--color-pt-accent-border)' : undefined,
                }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="text-[11px] font-semibold tracking-widest uppercase"
                    style={{
                      color: isAssessment ? 'var(--color-pt-accent-fg)' : 'var(--color-fg-muted)',
                      letterSpacing: '0.1em',
                    }}
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
                      style={{
                        color: 'var(--color-fg-subtle)',
                        fontSize: 11,
                        padding: '2px 6px',
                        gap: 3,
                      }}
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
    </div>
  );
}

export const NotePanel = memo(NotePanelImpl);
