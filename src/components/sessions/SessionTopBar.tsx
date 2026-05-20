import { Link } from 'react-router-dom';
import { ArrowLeft, AudioLines, CheckCircle2, LockOpen } from 'lucide-react';
import type { Patient, Session, Note } from '@/types';
import { AddClipButton } from './AddClipButton';

export interface SessionTopBarProps {
  patient: Patient;
  session: Session;
  note: Note | undefined;
  totalDurationSec: number;
  clipsCount: number;
  clipsOpen: boolean;
  onToggleClips: () => void;
  onRecord: () => void;
  onUpload: (file: File) => void;
  missingRequiredLabels: string[];
  pendingDeleteSession: boolean;
  onFinalize: () => void;
  onUnfinalize: () => void;
}

const SESSION_TYPE_LABEL: Record<string, string> = {
  evaluation: 'Evaluation',
  follow_up: 'F/U',
  progress: 'Progress',
  discharge: 'Discharge',
};

export function SessionTopBar({
  patient, session, note,
  totalDurationSec, clipsCount, clipsOpen,
  onToggleClips, onRecord, onUpload,
  missingRequiredLabels, pendingDeleteSession,
  onFinalize, onUnfinalize,
}: SessionTopBarProps) {
  const sessionDate = new Date(session.date);
  const dayLabel = sessionDate.toLocaleDateString(undefined, { weekday: 'short' });
  const timeLabel = sessionDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const durMin = Math.round(totalDurationSec / 60);
  const sessionTypeLabel = SESSION_TYPE_LABEL[session.type] ?? session.type;
  const headline = [`${patient.firstName} ${patient.lastName}`, sessionTypeLabel, patient.primaryDiagnosis ?? '']
    .filter(Boolean).join(' · ');

  return (
    <div
      className="flex items-center gap-3"
      style={{
        height: 56,
        padding: '0 22px',
        background: 'var(--color-pt-surface)',
        borderBottom: '1px solid var(--color-pt-border)',
      }}
    >
      {/* Left cluster */}
      <Link
        to={`/patients/${patient.id}`}
        aria-label="Back to patient chart"
        className="inline-flex items-center gap-1.5"
        style={{
          height: 30, padding: '0 10px', borderRadius: 7,
          border: '1px solid var(--color-pt-border)',
          background: 'var(--color-pt-surface)',
          color: 'var(--color-pt-text-2)',
          textDecoration: 'none', fontSize: 12,
          flexShrink: 0,
        }}
      >
        <ArrowLeft size={13} strokeWidth={2} /> Chart
      </Link>

      <div style={{ width: 1, height: 24, background: 'var(--color-pt-border)' }} aria-hidden />

      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          className="truncate"
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-pt-text)', lineHeight: 1.25 }}
        >
          {headline}
        </div>
        <div
          className="truncate flex items-center gap-2"
          style={{ fontSize: 11.5, color: 'var(--color-pt-text-2)', marginTop: 1 }}
        >
          <span>
            {dayLabel} · {timeLabel}
            {durMin > 0 && ` · ${durMin} min recorded`}
          </span>
          <StatusBadge status={session.status} finalized={session.status === 'finalized'} />
        </div>
      </div>

      {/* Right cluster */}
      {!pendingDeleteSession && (
        <div className="flex items-center" style={{ gap: 8, flexShrink: 0 }}>
          <AddClipButton onRecord={onRecord} onUpload={onUpload} />

          <button
            type="button"
            onClick={onToggleClips}
            aria-pressed={clipsOpen}
            className="inline-flex items-center"
            style={{
              gap: 6, height: 32, padding: '0 10px',
              borderRadius: 7,
              border: `1px solid ${clipsOpen ? 'var(--color-pt-accent-border)' : 'var(--color-pt-border)'}`,
              background: clipsOpen ? 'var(--color-pt-accent-soft)' : 'var(--color-pt-surface)',
              color: clipsOpen ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-2)',
              cursor: 'pointer', fontSize: 12,
            }}
          >
            <AudioLines size={13} strokeWidth={2} />
            <span>Audio clips</span>
            <span
              style={{
                minWidth: 18, padding: '0 5px', borderRadius: 999,
                background: clipsOpen ? 'var(--color-pt-accent)' : 'var(--color-pt-surface-mut)',
                color: clipsOpen ? '#fff' : 'var(--color-pt-text-2)',
                fontSize: 10.5, fontWeight: 700, lineHeight: '15px', textAlign: 'center',
              }}
            >
              {clipsCount}
            </span>
          </button>

          <div style={{ width: 1, height: 22, background: 'var(--color-pt-border)' }} aria-hidden />

          {note?.finalized ? (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ height: 32, padding: '0 12px', fontSize: 12.5 }}
              onClick={onUnfinalize}
            >
              <LockOpen size={13} strokeWidth={2} /> Unlock
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              style={{ height: 32, padding: '0 14px', fontSize: 12.5, fontWeight: 700 }}
              disabled={!note || missingRequiredLabels.length > 0}
              onClick={onFinalize}
              title={missingRequiredLabels.length > 0 ? `Required sections empty: ${missingRequiredLabels.join(', ')}` : undefined}
            >
              <CheckCircle2 size={13} strokeWidth={2} /> Sign &amp; export
            </button>
          )}
        </div>
      )}
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
        padding: '1px 7px', fontSize: 10, fontWeight: 700,
        background: isGreen ? 'color-mix(in oklab, var(--color-positive) 12%, transparent)' : 'rgba(26,32,48,0.07)',
        color: isGreen ? 'var(--color-positive)' : 'var(--color-pt-text-2)',
      }}
    >
      {label}
    </span>
  );
}
