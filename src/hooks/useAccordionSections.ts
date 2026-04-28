import { useEffect, useRef, useState } from 'react';

export function useAccordionSections(opts: {
  hasTranscript: boolean;
  hasNote: boolean;
  sessionStatus: string;
}) {
  const { hasTranscript, hasNote, sessionStatus } = opts;

  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const init = new Set<string>(['recording']);
    if (hasTranscript) init.add('transcription');
    if (hasNote) init.add('notes');
    return init;
  });

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetSections() {
    setOpenSections(new Set(['recording']));
  }

  const prevStatusRef = useRef(sessionStatus);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = sessionStatus;
    let next: string | null = null;
    if (prev === 'recording' && sessionStatus === 'draft') next = 'transcription';
    else if (prev === 'transcribing' && sessionStatus === 'draft') next = 'notes';
    else if (prev === 'generating' && sessionStatus === 'ready') next = 'notes';
    if (!next) return;
    const section = next;
    const id = window.setTimeout(() => {
      setOpenSections((s) => { const n = new Set(s); n.add(section); return n; });
    }, 0);
    return () => window.clearTimeout(id);
  }, [sessionStatus]);

  function openSection(id: string) {
    setOpenSections((prev) => { const n = new Set(prev); n.add(id); return n; });
  }

  return { openSections, toggleSection, resetSections, openSection };
}
