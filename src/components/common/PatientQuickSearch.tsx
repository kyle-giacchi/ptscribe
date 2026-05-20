import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { usePatients } from '@/contexts/PatientsProvider';

export function PatientQuickSearch() {
  const { patients } = usePatients();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const q = query.trim().toLowerCase();
  const results = q
    ? patients
        .filter((p) =>
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
          (p.primaryDiagnosis ?? '').toLowerCase().includes(q),
        )
        .slice(0, 8)
    : [];

  function pick(patientId: string) {
    setOpen(false);
    setQuery('');
    navigate(`/patients/${patientId}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[highlight].id);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative" style={{ minWidth: 240 }}>
      <Search
        size={13}
        strokeWidth={2}
        style={{
          position: 'absolute',
          left: 9,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--color-pt-text-3)',
          pointerEvents: 'none',
        }}
      />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search patients…"
        aria-label="Search patients"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="input"
        style={{ height: 34, paddingLeft: 28, paddingRight: 10, width: '100%', fontSize: 12.5 }}
      />
      {open && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50"
          style={{
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 6,
            background: 'var(--color-pt-surface)',
            border: '1px solid var(--color-pt-border)',
            borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            listStyle: 'none',
            margin: 0,
            padding: 4,
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {results.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(p.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background:
                    i === highlight ? 'var(--color-pt-accent-soft)' : 'transparent',
                  color: 'var(--color-pt-text)',
                  cursor: 'pointer',
                  fontSize: 12.5,
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {p.firstName} {p.lastName}
                </div>
                {p.primaryDiagnosis && (
                  <div style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}>
                    {p.primaryDiagnosis}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
