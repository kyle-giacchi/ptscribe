// src/components/sessions/SessionTopBar.tsx
import { isDemoMode } from '@/lib/demoMode';
import { ProfileButton } from '@/components/common/TopBar';
import {
  CheckCircle2, Copy, LockOpen,
} from 'lucide-react';
import type { Patient, Session, Note } from '@/types';

export interface SessionTopBarProps {
  patient: Patient;
  session: Session;
  note: Note | undefined;
  totalDurationSec: number;
  missingRequiredLabels: string[];
  pendingDeleteSession: boolean;
  onCopyNote: () => void;
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
  totalDurationSec,
  missingRequiredLabels, pendingDeleteSession,
  onCopyNote, onFinalize, onUnfinalize,
}: SessionTopBarProps) {
  const sessionDate = new Date(session.date);
  const dayLabel = sessionDate.toLocaleDateString(undefined, { weekday: 'short' });
  const timeLabel = sessionDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const durMin = Math.round(totalDurationSec / 60);
  const durLabel = durMin > 0 ? `${durMin} min recorded` : null;
  const diagnosis = patient.primaryDiagnosis ?? '';
  const sessionTypeLabel = SESSION_TYPE_LABEL[session.type] ?? session.type;
  const subtitle = [sessionTypeLabel, diagnosis].filter(Boolean).join(' · ');

  return (
    <div style={{ borderBottom: '1px solid var(--color-pt-border)', background: 'var(--color-pt-surface)' }}>

      {isDemoMode() && (
        <div
          style={{
            background: 'color-mix(in oklab, var(--color-caution) 12%, transparent)',
            borderBottom: '1px solid color-mix(in oklab, var(--color-caution) 25%, transparent)',
            padding: '5px 22px',
            fontSize: 11.5,
            color: 'var(--color-caution)',
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          Demo mode — data uses a shared passphrase embedded in the source code. Do not enter real
          patient information.
        </div>
      )}

      {/* ── Row 1: patient breadcrumb ── */}
      <div className="flex items-start gap-3 px-5 pt-3">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-pt-text)' }}>
            {patient.firstName} {patient.lastName}
            {subtitle && (
              <span style={{ color: 'var(--color-pt-text-2)', fontWeight: 400 }}>
                {' · '}{subtitle}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="text-[11px]" style={{ color: 'var(--color-pt-text-2)' }}>
              {dayLabel} · {timeLabel}
              {durLabel && ` · ${durLabel}`}
            </span>
            <StatusBadge status={session.status} finalized={session.status === 'finalized'} />
          </div>
        </div>
        <ProfileButton />
      </div>

      {/* ── Row 2: action cluster ── */}
      {!pendingDeleteSession && (
        <div
          className="flex flex-wrap items-center gap-2 px-5 pt-2 pb-2.5"
          style={{ borderTop: '1px solid var(--color-pt-border)' }}
        >
          {note && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ height: 32, padding: '0 10px', fontSize: 12, boxSizing: 'border-box' }}
              onClick={onCopyNote}
            >
              <Copy size={13} strokeWidth={2} /> Copy Notes
            </button>
          )}
          <div style={{ flex: 1 }} />
          {note?.finalized ? (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ height: 32, padding: '0 12px', fontSize: 12.5, boxSizing: 'border-box' }}
              onClick={onUnfinalize}
            >
              <LockOpen size={13} strokeWidth={2} /> Unlock
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              style={{ height: 32, padding: '0 14px', fontSize: 12.5, fontWeight: 700, boxSizing: 'border-box' }}
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

// ── Sub-components ──────────────────────────────────────────────

function StatusBadge({ status, finalized }: { status: string; finalized: boolean }) {
  const label = finalized ? 'final' : status === 'ready' ? 'ready' : 'draft';
  const isGreen = finalized || status === 'ready';
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{
        background: isGreen ? 'color-mix(in oklab, var(--color-positive) 12%, transparent)' : 'rgba(26,32,48,0.07)',
        color: isGreen ? 'var(--color-positive)' : 'var(--color-pt-text-2)',
      }}>
      {label}
    </span>
  );
}
