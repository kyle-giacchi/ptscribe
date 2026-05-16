// src/components/sessions/SessionTopBar.tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Copy, FileText, List, LockOpen,
  Mic, Pause, Play, Square, Sparkles, Loader2,
} from 'lucide-react';
import { TemplateDropdown } from './TemplateDropdown';
import { formatDuration } from '@/utils/format';
import type { Patient, Session, Note, NoteTemplate } from '@/types';

type Busy = null | 'transcribing' | 'generating';

export interface SessionTopBarProps {
  patient: Patient;
  session: Session;
  note: Note | undefined;
  template: NoteTemplate | undefined;
  templates: NoteTemplate[];
  recorderStatus: string;
  durationSec: number;
  activeTab: 'record' | 'review' | 'clips';
  clipsCount: number;
  hasNote: boolean;
  noteFinalized: boolean | undefined;
  busy: Busy;
  transcript: string;
  totalDurationSec: number;
  generateUsed: number;
  generateCap: number;
  generationReady: boolean;
  missingRequiredLabels: string[];
  pendingDeleteSession: boolean;
  onSetTab: (tab: 'record' | 'review' | 'clips') => void;
  onStartRecording: () => void;
  onStopAndFinish: () => void;
  onPauseResume: () => void;
  onTemplateChange: (id: string) => void;
  onManageTemplates: () => void;
  onGenerate: () => void;
  onCopyTranscript: () => void;
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
  patient, session, note, template, templates,
  recorderStatus, durationSec,
  activeTab, clipsCount, hasNote, noteFinalized,
  busy, transcript, totalDurationSec,
  generateUsed, generateCap, generationReady,
  missingRequiredLabels, pendingDeleteSession,
  onSetTab, onStartRecording, onStopAndFinish, onPauseResume,
  onTemplateChange, onManageTemplates,
  onGenerate, onCopyTranscript, onCopyNote, onFinalize, onUnfinalize,
}: SessionTopBarProps) {
  const sessionDate = new Date(session.date);
  const dayLabel = sessionDate.toLocaleDateString(undefined, { weekday: 'short' });
  const timeLabel = sessionDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const durMin = Math.round(totalDurationSec / 60);
  const durLabel = durMin > 0 ? `${durMin} min recorded` : null;
  const diagnosis = patient.primaryDiagnosis ?? '';
  const sessionTypeLabel = SESSION_TYPE_LABEL[session.type] ?? session.type;
  const subtitle = [sessionTypeLabel, diagnosis].filter(Boolean).join(' · ');

  const canGenerate = transcript.trim().length > 0 && generationReady && generateUsed < generateCap;
  const isGenerating = busy === 'generating';
  const hasDraftContent = !!note?.sections.some((s) => s.body.trim().length > 0);

  return (
    <div style={{ borderBottom: '1px solid var(--color-pt-border)', background: 'var(--color-pt-surface)' }}>

      {/* ── Row 1: patient breadcrumb ── */}
      <div className="flex items-start gap-3 px-5 pt-3">
        <Link
          to={`/patients/${patient.id}`}
          className="inline-flex items-center gap-1 shrink-0 text-xs font-medium mt-0.5"
          style={{ color: 'var(--color-pt-text-2)', textDecoration: 'none' }}
        >
          <ArrowLeft size={13} strokeWidth={2} />
          Back
        </Link>
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
      </div>

      {/* ── Row 2: tabs + recording control ── */}
      <div className="flex items-center gap-3 px-5 pt-2.5 pb-1.5">
        <div
          role="tablist"
          className="inline-flex items-center gap-0.5 p-1"
          style={{ background: 'var(--color-pt-surface-alt)', borderRadius: 10 }}
        >
          <TabPill label="Record" icon={<Mic size={12} strokeWidth={2} />} active={activeTab === 'record'} onClick={() => onSetTab('record')} />
          {clipsCount > 0 && (
            <TabPill
              label="Clips"
              icon={<List size={12} strokeWidth={2} />}
              active={activeTab === 'clips'}
              onClick={() => onSetTab('clips')}
              badge={String(clipsCount)}
            />
          )}
          <TabPill
            label="Review"
            icon={<FileText size={12} strokeWidth={2} />}
            active={activeTab === 'review'}
            onClick={() => onSetTab('review')}
            badge={hasNote ? (noteFinalized ? 'Final' : 'Draft') : undefined}
            badgeHighlight={!!noteFinalized}
          />
        </div>
        <div style={{ flex: 1 }} />
        <CompactRecordingControl
          status={recorderStatus}
          durationSec={durationSec}
          onStart={onStartRecording}
          onStopAndFinish={onStopAndFinish}
          onPauseResume={onPauseResume}
        />
      </div>

      {/* ── Row 3: Review-only action cluster ── */}
      {activeTab === 'review' && !pendingDeleteSession && (
        <div
          className="flex flex-wrap items-center gap-2 px-5 pt-2 pb-2.5"
          style={{ borderTop: '1px solid var(--color-pt-border)' }}
        >
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
            onClick={onGenerate}
            title={
              !generationReady
                ? 'Enable Anthropic generation in Settings'
                : generateUsed >= generateCap
                ? `Per-session limit reached (${generateUsed}/${generateCap})`
                : `${hasDraftContent ? 'Regenerate' : 'Generate'} note from transcript (${generateUsed}/${generateCap} used)`
            }
          >
            {isGenerating ? (
              <><Loader2 size={13} className="animate-spin" /> Generating…</>
            ) : (
              <><Sparkles size={13} strokeWidth={2} /> {hasDraftContent ? 'Regenerate' : 'Generate'}</>
            )}
          </button>
          <div style={{ flex: 1 }} />
          {transcript.trim() && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ height: 32, padding: '0 10px', fontSize: 12, boxSizing: 'border-box' }}
              onClick={onCopyTranscript}
            >
              <Copy size={13} strokeWidth={2} /> Copy Transcription
            </button>
          )}
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

function TabPill({
  label, icon, active, onClick, badge, badgeHighlight,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: string;
  badgeHighlight?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 transition-colors"
      style={{
        padding: '5px 11px',
        borderRadius: 8,
        fontSize: 12.5,
        fontWeight: 600,
        color: active ? 'var(--color-pt-text)' : 'var(--color-pt-text-2)',
        background: active ? 'var(--color-pt-surface)' : 'transparent',
        boxShadow: active ? '0 1px 2px rgba(26,32,48,0.06)' : 'none',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {icon}
      {label}
      {badge && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 999,
          background: badgeHighlight ? 'color-mix(in oklab, var(--color-pt-accent) 15%, transparent)' : 'rgba(26,32,48,0.08)',
          color: badgeHighlight ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-2)',
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function CompactRecordingControl({
  status, durationSec, onStart, onStopAndFinish, onPauseResume,
}: {
  status: string;
  durationSec: number;
  onStart: () => void;
  onStopAndFinish: () => void;
  onPauseResume: () => void;
}) {
  const isRecording = status === 'recording';
  const isPaused = status === 'paused';
  const active = isRecording || isPaused;

  if (!active) {
    return (
      <button type="button" onClick={onStart} aria-label="Start recording"
        className="inline-flex items-center gap-1.5 rounded-lg transition-opacity hover:opacity-90 active:scale-95"
        style={{ padding: '6px 14px', height: 32, fontSize: 12.5, fontWeight: 600, color: '#ffffff', background: 'var(--color-pt-accent)', border: 'none', cursor: 'pointer', touchAction: 'manipulation', boxSizing: 'border-box' }}>
        <Mic size={13} strokeWidth={2} /> Start
      </button>
    );
  }

  const accentColor = isPaused ? 'var(--color-pt-amber)' : 'var(--color-pt-red)';
  const borderColor = isPaused ? 'var(--color-pt-amber-border)' : 'var(--color-pt-red-border)';
  const bg = isPaused
    ? 'color-mix(in oklab, var(--color-pt-amber) 8%, var(--color-pt-surface))'
    : 'color-mix(in oklab, var(--color-pt-red) 6%, var(--color-pt-surface))';

  return (
    <div className="flex items-center gap-0.5"
      style={{ border: `1px solid ${borderColor}`, borderRadius: 8, background: bg, padding: '0 2px 0 10px', height: 32 }}>
      <span className="relative mr-1.5 flex h-2 w-2 shrink-0">
        {isRecording && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-65" style={{ background: accentColor }} />}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: accentColor }} />
      </span>
      <span className="font-mono tabular-nums" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-pt-text)', minWidth: 38 }}>
        {formatDuration(durationSec)}
      </span>
      <button type="button" onClick={onPauseResume} aria-label={isPaused ? 'Resume' : 'Pause'}
        className="flex items-center justify-center rounded" style={{ width: 28, height: 28, color: 'var(--color-pt-text-2)', border: 'none', background: 'transparent', cursor: 'pointer', touchAction: 'manipulation' }}>
        {isPaused ? <Play size={12} strokeWidth={2.5} /> : <Pause size={12} strokeWidth={2.5} />}
      </button>
      <button type="button" onClick={onStopAndFinish} aria-label="Stop recording"
        className="flex items-center justify-center rounded" style={{ width: 28, height: 28, color: 'var(--color-pt-text-2)', border: 'none', background: 'transparent', cursor: 'pointer', touchAction: 'manipulation' }}>
        <Square size={12} strokeWidth={2.5} />
      </button>
    </div>
  );
}

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
