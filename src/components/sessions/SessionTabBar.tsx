import { FileText, Mic, Settings } from 'lucide-react';

export interface SessionTabBarProps {
  activeTab: 'record' | 'review';
  setActiveTab: (tab: 'record' | 'review') => void;
  clipsCount: number;
  noteFinalized?: boolean;
  hasNote: boolean;
  onOpenDrawer: () => void;
}

/**
 * Top tab strip for the Session page: Record / Review pills + a small Debug
 * gear icon on the right. Pure presentation — all state lives in the parent.
 */
export function SessionTabBar({
  activeTab,
  setActiveTab,
  clipsCount,
  noteFinalized,
  hasNote,
  onOpenDrawer,
}: SessionTabBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 22px 0',
      }}
    >
      <div
        role="tablist"
        className="inline-flex items-center gap-0.5 p-1"
        style={{ background: '#eaeef4', borderRadius: 10 }}
      >
        {/* Record tab */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'record'}
          onClick={() => setActiveTab('record')}
          className="inline-flex items-center gap-1.5 transition-colors"
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 600,
            color: activeTab === 'record' ? 'var(--color-pt-text)' : 'var(--color-pt-text-2)',
            background: activeTab === 'record' ? 'var(--color-pt-surface)' : 'transparent',
            boxShadow: activeTab === 'record' ? '0 1px 2px rgba(26,32,48,0.06)' : 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Mic size={13} strokeWidth={2} />
          Record
          {clipsCount > 0 && (
            <span
              className="tabular-nums"
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 999,
                background:
                  activeTab === 'record'
                    ? 'color-mix(in oklab, var(--color-pt-accent) 15%, transparent)'
                    : 'rgba(26,32,48,0.08)',
                color:
                  activeTab === 'record' ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-2)',
              }}
            >
              {clipsCount}
            </span>
          )}
        </button>

        {/* Review tab */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'review'}
          onClick={() => setActiveTab('review')}
          className="inline-flex items-center gap-1.5 transition-colors"
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 600,
            color: activeTab === 'review' ? 'var(--color-pt-text)' : 'var(--color-pt-text-2)',
            background: activeTab === 'review' ? 'var(--color-pt-surface)' : 'transparent',
            boxShadow: activeTab === 'review' ? '0 1px 2px rgba(26,32,48,0.06)' : 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <FileText size={13} strokeWidth={2} />
          Review
          {hasNote && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 999,
                background: noteFinalized
                  ? 'color-mix(in oklab, var(--color-pt-accent) 15%, transparent)'
                  : 'rgba(26,32,48,0.08)',
                color: noteFinalized ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-2)',
              }}
            >
              {noteFinalized ? 'Final' : 'Draft'}
            </span>
          )}
        </button>
      </div>

      <div style={{ flex: 1 }} />
      <button
        type="button"
        onClick={onOpenDrawer}
        title="Debug tools"
        style={{
          all: 'unset',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          borderRadius: 8,
          cursor: 'pointer',
          color: 'var(--color-pt-text-2)',
          background: 'var(--color-pt-surface)',
          border: '1px solid var(--color-pt-border)',
        }}
      >
        <Settings size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
