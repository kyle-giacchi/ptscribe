import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Home, LockOpen } from 'lucide-react';
import type { Patient, Session, Note } from '@/types';
import { isDemoMode } from '@/lib/demoMode';
import { AddClipButton } from './AddClipButton';

interface SessionTopBarProps {
  patient: Patient;
  session: Session;
  note: Note | undefined;
  totalDurationSec: number;
  onRecord: () => void;
  onUpload: (file: File) => void;
  missingRequiredLabels: string[];
  onFinalize: () => void;
  onUnfinalize: () => void;
  /** Note actions (New recording, Sign & export) are contextual to
   *  the Review screen — they animate out on the fresh-start Record screen. */
  showNoteActions: boolean;
}

const SESSION_TYPE_LABEL: Record<string, string> = {
  evaluation: 'Evaluation',
  follow_up: 'F/U',
  progress: 'Progress',
  discharge: 'Discharge',
};

export function SessionTopBar({
  patient,
  session,
  note,
  totalDurationSec,
  onRecord,
  onUpload,
  missingRequiredLabels,
  onFinalize,
  onUnfinalize,
  showNoteActions,
}: SessionTopBarProps) {
  const sessionDate = new Date(session.date);
  const dayLabel = sessionDate.toLocaleDateString(undefined, { weekday: 'short' });
  const timeLabel = sessionDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const durMin = Math.round(totalDurationSec / 60);
  // Shares the one filled-action slot with NoteToolbar's Generate button.
  const hasNoteContent = !!note?.sections.some((s) => s.body.trim().length > 0);
  const sessionTypeLabel = SESSION_TYPE_LABEL[session.type] ?? session.type;
  const headline = [
    `${patient.firstName} ${patient.lastName}`,
    sessionTypeLabel,
    patient.primaryDiagnosis ?? '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="flex items-center gap-3"
      style={{
        position: 'relative',
        zIndex: 10,
        height: 56,
        padding: '0 22px',
        background: 'var(--color-pt-surface)',
        borderBottom: '1px solid var(--color-pt-border)',
      }}
    >
      {/* Left cluster — demo mode has no patient chart to return to (nav is
          locked to this session), so it exits to the marketing page instead. */}
      <Link
        to={isDemoMode() ? '/home' : `/patients/${patient.id}`}
        aria-label={isDemoMode() ? 'Go home' : 'Back to patient chart'}
        className="inline-flex items-center gap-1.5"
        style={{
          height: 30,
          padding: '0 10px',
          borderRadius: 7,
          border: '1px solid var(--color-pt-border)',
          background: 'var(--color-pt-surface)',
          color: 'var(--color-pt-text-2)',
          textDecoration: 'none',
          fontSize: 'var(--text-sm)',
          flexShrink: 0,
        }}
      >
        {isDemoMode() ? (
          <>
            <Home size={13} strokeWidth={2} /> Go home
          </>
        ) : (
          <>
            <ArrowLeft size={13} strokeWidth={2} /> Chart
          </>
        )}
      </Link>

      <div style={{ width: 1, height: 24, background: 'var(--color-pt-border)' }} aria-hidden />

      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          className="truncate"
          title={headline}
          style={{
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            color: 'var(--color-pt-text)',
            lineHeight: 1.25,
          }}
        >
          {headline}
        </div>
        <div
          className="flex items-center gap-2 truncate"
          style={{ fontSize: 'var(--text-xs)', color: 'var(--color-pt-text-2)', marginTop: 1 }}
        >
          <span>
            {dayLabel} · {timeLabel}
            {durMin > 0 && ` · ${durMin} min recorded`}
          </span>
          <StatusBadge status={session.status} finalized={session.status === 'finalized'} />
        </div>
      </div>

      {/* Right cluster — note actions animate out on the fresh-start Record screen */}
      <div
        className="flex items-center"
        style={{
          gap: 8,
          flexShrink: 0,
          opacity: showNoteActions ? 1 : 0,
          transform: showNoteActions ? 'translateX(0)' : 'translateX(8px)',
          pointerEvents: showNoteActions ? 'auto' : 'none',
          transition: 'opacity 220ms ease, transform 220ms ease',
        }}
        aria-hidden={!showNoteActions}
        inert={!showNoteActions}
      >
        <AddClipButton onRecord={onRecord} onUpload={onUpload} />

        <div style={{ width: 1, height: 22, background: 'var(--color-pt-border)' }} aria-hidden />

        {note?.finalized ? (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ height: 32, padding: '0 12px', fontSize: 'var(--text-sm)' }}
            onClick={onUnfinalize}
          >
            <LockOpen size={13} strokeWidth={2} /> Unlock
          </button>
        ) : (
          // Missing required sections keep the button focusable (aria-disabled, not
          // disabled): a native-disabled tooltip never reaches keyboard or touch
          // users, while a click runs finalize(), which names the empty sections.
          <button
            type="button"
            className={`btn ${hasNoteContent ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              height: 32,
              padding: '0 14px',
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              opacity: missingRequiredLabels.length > 0 ? 0.55 : 1,
            }}
            disabled={!note}
            aria-disabled={missingRequiredLabels.length > 0 || undefined}
            onClick={onFinalize}
            title={
              missingRequiredLabels.length > 0
                ? `Fill in the required sections before signing: ${missingRequiredLabels.join(', ')}`
                : undefined
            }
          >
            <CheckCircle2 size={13} strokeWidth={2} /> Sign &amp; export
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, finalized }: { status: string; finalized: boolean }) {
  const label = finalized ? 'final' : status === 'ready' ? 'ready' : 'draft';
  const isGreen = finalized || status === 'ready';
  return (
    <span
      className="inline-block rounded-full"
      style={{
        padding: '1px 7px',
        fontSize: 'var(--text-2xs)',
        fontWeight: 700,
        background: isGreen ? 'var(--color-pt-accent-soft)' : 'var(--color-pt-slate-soft)',
        color: isGreen ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-slate-fg)',
      }}
    >
      {label}
    </span>
  );
}
