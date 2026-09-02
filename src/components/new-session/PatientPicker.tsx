import { Link } from 'react-router-dom';
import { Search, UserPlus } from 'lucide-react';
import { Avatar, Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { PatientRow } from '@/components/new-session/PatientRow';
import type { Patient } from '@/types';

function displayName(p: Patient) {
  return p.lastName ? `${p.lastName}, ${p.firstName}` : p.firstName;
}

export function PatientPicker({
  results,
  suggested,
  query,
  onQuery,
  onSelect,
  onNewPatient,
}: {
  /** Patients matching `query` — the full active list when the query is empty. */
  results: Patient[];
  /** Today's scheduled patients (falls back to most-recently-seen). */
  suggested: Patient[];
  query: string;
  onQuery: (q: string) => void;
  onSelect: (id: string) => void;
  onNewPatient: () => void;
}) {
  const searching = query.trim().length > 0;

  return (
    <div style={{ display: 'grid', gap: 22, justifyItems: 'center', paddingTop: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            lineHeight: 1.2,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--color-pt-text)',
          }}
        >
          Who are you seeing today?
        </h1>
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 'var(--text-base)',
            color: 'var(--color-pt-text-3)',
          }}
        >
          Search existing patients or add a new one to begin.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, width: '100%', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-pt-text-3)',
              pointerEvents: 'none',
            }}
          />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search by name, MRN, or DOB…"
            aria-label="Search patients"
            autoFocus
            style={{
              width: '100%',
              padding: '14px 14px 14px 40px',
              borderRadius: 10,
              border: '1px solid var(--color-pt-border)',
              fontSize: 'var(--text-md)',
              color: 'var(--color-pt-text)',
              background: 'var(--color-pt-surface)',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              minHeight: 48,
            }}
          />
        </div>
        <PtButton
          variant="primary"
          onClick={onNewPatient}
          iconLeft={<UserPlus size={15} strokeWidth={2} />}
        >
          New Patient
        </PtButton>
      </div>

      {searching ? (
        <SurfaceCard padding={0} style={{ width: '100%' }}>
          {results.length > 0 ? (
            <ul role="listbox" aria-label="Matching patients" style={{ margin: 0, padding: 0 }}>
              {results.map((p) => (
                <PatientRow
                  key={p.id}
                  patient={p}
                  selected={false}
                  onSelect={() => onSelect(p.id)}
                />
              ))}
            </ul>
          ) : (
            <div style={{ padding: '18px 16px', display: 'grid', gap: 10, justifyItems: 'start' }}>
              <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-pt-text-3)' }}>
                No patient matches “{query.trim()}”.
              </span>
              <PtButton
                variant="accent-soft"
                onClick={onNewPatient}
                iconLeft={<UserPlus size={14} strokeWidth={2} />}
              >
                Add as a new patient
              </PtButton>
            </div>
          )}
        </SurfaceCard>
      ) : (
        suggested.length > 0 && (
          <div style={{ width: '100%' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <Eyebrow>Suggested patients</Eyebrow>
              <Link
                to="/patients"
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-pt-accent-fg)',
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                View all
              </Link>
            </div>
            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              }}
            >
              {suggested.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelect(p.id)}
                  style={{
                    display: 'grid',
                    gap: 10,
                    textAlign: 'left',
                    padding: 14,
                    borderRadius: 12,
                    border: '1px solid var(--color-pt-border)',
                    background: 'var(--color-pt-surface)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    minHeight: 100,
                    minWidth: 0,
                    alignContent: 'start',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar name={`${p.firstName} ${p.lastName}`} color={p.color} size={28} />
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 500,
                        color: 'var(--color-pt-text-3)',
                        fontFamily: 'monospace',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {p.mrn ?? p.id.slice(0, 8)}
                    </span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 'var(--text-base)',
                        fontWeight: 600,
                        color: 'var(--color-pt-text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {displayName(p)}
                    </div>
                    {p.primaryDiagnosis && (
                      <div
                        style={{
                          fontSize: 'var(--text-sm)',
                          color: 'var(--color-pt-text-3)',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.primaryDiagnosis}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
