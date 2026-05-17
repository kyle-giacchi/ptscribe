import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Mic, Cpu, Sparkles, FileText } from 'lucide-react';
import { Eyebrow, SurfaceCard } from '@/components/design';
import { useSessions } from '@/contexts/SessionsProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import type { Patient, Session } from '@/types';

// ─── Tier badge ─────────────────────────────────────────────────────────────

type TierLevel = 1 | 2 | 3;

const TIER_META: Record<TierLevel, { label: string; Icon: React.FC<{ size?: number; strokeWidth?: number }> ; color: string }> = {
  1: { label: 'Web Speech', Icon: Mic, color: '#6366f1' },
  2: { label: 'Local Whisper', Icon: Cpu, color: '#0ea5e9' },
  3: { label: 'Nova AI', Icon: Sparkles, color: '#10b981' },
};

function TierBadge({ tier, active }: { tier: TierLevel; active: boolean }) {
  const { label, Icon, color } = TIER_META[tier];
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        background: active ? `color-mix(in oklab, ${color} 12%, transparent)` : 'var(--color-pt-surface-mut)',
        color: active ? color : 'var(--color-pt-text-3)',
        border: `1px solid ${active ? `color-mix(in oklab, ${color} 30%, transparent)` : 'transparent'}`,
      }}
    >
      <Icon size={10} strokeWidth={2} />
      {label}
    </span>
  );
}

// ─── Transcript block ────────────────────────────────────────────────────────

function TranscriptBlock({ tier, text }: { tier: TierLevel; text: string }) {
  const { label, color } = TIER_META[tier];
  return (
    <div
      className="rounded-md p-3"
      style={{
        background: `color-mix(in oklab, ${color} 5%, transparent)`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {label}
      </div>
      <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-pt-text)', whiteSpace: 'pre-wrap', margin: 0 }}>
        {text}
      </p>
    </div>
  );
}

// ─── Per-session row ─────────────────────────────────────────────────────────

function wordCount(text: string | undefined): number {
  if (!text?.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

function SessionRow({ session, patient }: { session: Session; patient: Patient | undefined }) {
  const [open, setOpen] = useState(false);

  const hasT1 = Boolean(session.liveTranscript);
  const hasT2 = Boolean(session.localTranscript);
  const hasT3 = Boolean(session.aiTranscript);
  const hasAny = hasT1 || hasT2 || hasT3;

  const patientName = patient
    ? `${patient.firstName} ${patient.lastName}`.trim()
    : 'Unknown patient';

  const sessionDate = new Date(session.date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const activeSource = session.transcriptSource ?? (session.transcript ? 'whisper' : undefined);
  const activeTierLabel =
    activeSource === 'nova' ? 'Nova AI' :
    activeSource === 'whisper' ? 'Local Whisper' :
    activeSource === 'webspeech' ? 'Web Speech' :
    activeSource === 'manual' ? 'Manual' :
    session.transcript ? 'whisper' : '—';

  return (
    <div
      style={{
        borderBottom: '1px solid var(--color-pt-border)',
      }}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 text-left transition-colors hover:bg-[var(--color-pt-surface-mut)]"
        style={{ padding: '10px 14px' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ color: 'var(--color-pt-text-3)', flexShrink: 0 }}>
          {open
            ? <ChevronDown size={14} strokeWidth={2} />
            : <ChevronRight size={14} strokeWidth={2} />}
        </span>

        <span className="min-w-0 flex-1">
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-pt-text)' }}>
            {patientName}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)', marginLeft: 8 }}>
            {sessionDate} · {session.type.replace('_', ' ')} · {session.clips.length} clip{session.clips.length !== 1 ? 's' : ''}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          <TierBadge tier={1} active={hasT1} />
          <TierBadge tier={2} active={hasT2} />
          <TierBadge tier={3} active={hasT3} />
        </span>

        {hasAny && (
          <span
            style={{
              fontSize: 10.5,
              color: 'var(--color-pt-text-3)',
              flexShrink: 0,
              minWidth: 80,
              textAlign: 'right',
            }}
          >
            Active: {activeTierLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="flex flex-col gap-2" style={{ padding: '4px 14px 12px 14px' }}>
          {!hasAny && (
            <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
              No transcription data for this session.
            </p>
          )}
          {hasT1 && <TranscriptBlock tier={1} text={session.liveTranscript!} />}
          {hasT2 && <TranscriptBlock tier={2} text={session.localTranscript!} />}
          {hasT3 && <TranscriptBlock tier={3} text={session.aiTranscript!} />}
          {session.transcript && !hasT2 && !hasT3 && (
            <div className="flex items-start gap-2 rounded-md p-3" style={{ background: 'var(--color-pt-surface-mut)' }}>
              <FileText size={13} strokeWidth={1.75} style={{ color: 'var(--color-pt-text-3)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-pt-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Legacy transcript
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-pt-text)', whiteSpace: 'pre-wrap', margin: 0 }}>
                  {session.transcript}
                </p>
              </div>
            </div>
          )}

          {/* Per-clip detail */}
          {session.clips.length > 0 && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ fontSize: 11, color: 'var(--color-pt-text-3)', cursor: 'pointer', userSelect: 'none' }}>
                Clip detail ({session.clips.length})
              </summary>
              <div className="flex flex-col gap-1.5" style={{ marginTop: 8 }}>
                {session.clips.map((clip) => (
                  <div
                    key={clip.id}
                    className="rounded-md p-2.5"
                    style={{ background: 'var(--color-pt-surface-mut)', fontSize: 11 }}
                  >
                    <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-pt-text)' }}>
                        Clip {clip.index + 1}
                      </span>
                      <span style={{ color: 'var(--color-pt-text-3)' }}>
                        {Math.round(clip.durationSec)}s · {clip.status}
                      </span>
                      <span className="ml-auto flex gap-1">
                        {clip.liveTranscript && <TierBadge tier={1} active />}
                        {clip.localTranscript && <TierBadge tier={2} active />}
                        {clip.aiTranscript && <TierBadge tier={3} active />}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {clip.liveTranscript && (
                        <div style={{ color: '#6366f1' }}>
                          <span style={{ fontWeight: 600 }}>T1:</span> {wordCount(clip.liveTranscript)}w
                        </div>
                      )}
                      {clip.localTranscript && (
                        <div style={{ color: '#0ea5e9' }}>
                          <span style={{ fontWeight: 600 }}>T2:</span> {wordCount(clip.localTranscript)}w
                        </div>
                      )}
                      {clip.aiTranscript && (
                        <div style={{ color: '#10b981' }}>
                          <span style={{ fontWeight: 600 }}>T3:</span> {wordCount(clip.aiTranscript)}w
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function AdminPage() {
  const { sessions } = useSessions();
  const { patients } = usePatients();

  const patientMap = useMemo(
    () => new Map(patients.map((p) => [p.id, p])),
    [patients],
  );

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => b.date - a.date),
    [sessions],
  );

  const withT1 = sessions.filter((s) => s.liveTranscript).length;
  const withT2 = sessions.filter((s) => s.localTranscript).length;
  const withT3 = sessions.filter((s) => s.aiTranscript).length;

  return (
    <div className="flex flex-col gap-5" style={{ padding: '20px 16px', maxWidth: 900, margin: '0 auto' }}>

      {/* Stats */}
      <SurfaceCard>
        <Eyebrow>Transcription coverage</Eyebrow>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginTop: 12 }}>
          {(
            [
              { label: 'Total sessions', value: sessions.length, color: 'var(--color-pt-text)' },
              { label: 'Web Speech (T1)', value: withT1, color: '#6366f1' },
              { label: 'Local Whisper (T2)', value: withT2, color: '#0ea5e9' },
              { label: 'Nova AI (T3)', value: withT3, color: '#10b981' },
            ] as const
          ).map(({ label, value, color }) => (
            <div
              key={label}
              className="rounded-lg p-3"
              style={{ background: 'var(--color-pt-surface-mut)' }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--color-pt-text-3)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </SurfaceCard>

      {/* Session list */}
      <SurfaceCard style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 10px' }}>
          <Eyebrow>Sessions</Eyebrow>
        </div>
        {sorted.length === 0 ? (
          <p style={{ padding: '12px 14px', fontSize: 13, color: 'var(--color-pt-text-3)' }}>
            No sessions yet.
          </p>
        ) : (
          sorted.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              patient={patientMap.get(session.patientId)}
            />
          ))
        )}
      </SurfaceCard>
    </div>
  );
}
