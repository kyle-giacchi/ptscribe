import { useMemo, useState } from 'react';
import { TextInput } from '@/components/ui/Field';
import { BODY_REGIONS, CATEGORY_LABEL, REGION_LABEL } from '@/types';
import type { BodyRegion, Exercise } from '@/types';

interface Props {
  exercises: Exercise[];
  onPick: (exercise: Exercise) => void;
  onClose: () => void;
}

/**
 * Inline exercise picker: a search box, body-region chips, and a scrolling list.
 * Rendered as a disclosure inside PatientActivitiesCard so it costs zero height
 * until the clinician opens it.
 */
export function ExercisePicker({ exercises, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<BodyRegion | 'all'>('all');

  // Only offer chips for regions that actually have exercises.
  const regions = useMemo(() => {
    const present = new Set(exercises.map((e) => e.region));
    return BODY_REGIONS.filter((r) => present.has(r));
  }, [exercises]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises
      .filter((e) => region === 'all' || e.region === region)
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, region, query]);

  const chipStyle = (active: boolean) => ({
    fontSize: 11.5,
    padding: '3px 9px',
    borderRadius: 999,
    cursor: 'pointer',
    border: '1px solid var(--color-pt-border)',
    background: active ? 'var(--color-pt-accent-soft)' : 'transparent',
    color: active ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-2)',
  });

  return (
    <div
      style={{
        marginTop: 8,
        padding: 10,
        borderRadius: 8,
        border: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface-mut)',
        display: 'grid',
        gap: 8,
      }}
    >
      <TextInput
        autoFocus
        placeholder="Search exercises…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        <button type="button" style={chipStyle(region === 'all')} onClick={() => setRegion('all')}>
          All
        </button>
        {regions.map((r) => (
          <button
            key={r}
            type="button"
            style={chipStyle(region === r)}
            onClick={() => setRegion(r)}
          >
            {REGION_LABEL[r]}
          </button>
        ))}
      </div>

      <div style={{ maxHeight: 240, overflowY: 'auto', display: 'grid', gap: 2 }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--color-pt-text-3)', padding: '6px 2px' }}>
            No exercises match.
          </div>
        ) : (
          filtered.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-label={`Add ${e.name}`}
              onClick={() => onPick(e)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '5px 7px',
                borderRadius: 6,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--color-pt-text)' }}>{e.name}</span>
              <span style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}>
                {CATEGORY_LABEL[e.category]}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
