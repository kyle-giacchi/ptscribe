import { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import {
  CHAPTERS,
  REPO,
  STYLES,
  GithubMark,
  IntroChapter,
  MarketChapter,
  type ChapterId,
} from './HowItWorksModal';
import {
  SecurityChapterV2,
  VoiceChapterV2,
  NotesChapterV2,
  FutureChapterV2,
} from './HowItWorksModal.v2chapters';

interface Props {
  open: boolean;
  onClose: () => void;
}

// ─── v2 exploration ───────────────────────────────────────────────────────────
// A "refined builder's journal" re-imagining of HowItWorksModal. It reuses the
// proven chapter content + base component CSS from the v1 file, and layers a
// re-designed shell on top: a progress-spine rail, hero chapter openers, an
// accent that threads through the whole chrome, staggered content reveals, and
// hover-lift on cards. All overrides are scoped under `.hiwv2-root` so v1 is
// untouched. Wired behind a temporary toggle on the Landing page.

// Per-chapter dominant accent — mirrors the v1 `#ch-* { --ch-accent }` map so
// the rail spine, header progress bar, and panel edge all speak the same hue.
const ACCENT: Record<ChapterId, string> = {
  'ch-intro': 'var(--sage-deep)',
  'ch-market': 'var(--ink)',
  'ch-security': 'var(--ink)',
  'ch-voice': 'var(--sage-deep)',
  'ch-notes': 'var(--record)',
  'ch-future': 'var(--amber)',
};

const STYLES_V2 = `
/* ── Panel chrome ─────────────────────────────────────────── */
.hiwv2-root.hiw__panel {
  grid-template-columns: 264px 1fr;
  position: relative;
}
/* Accent edge that retints as you move through the journal. */
.hiwv2-root.hiw__panel::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; z-index: 5;
  background: linear-gradient(90deg,
    var(--active-accent, var(--ink)),
    color-mix(in oklab, var(--active-accent, var(--ink)) 28%, transparent));
  transition: background 0.4s ease;
}

/* ── Header: add a reading-progress meter ─────────────────── */
.hiwv2__progress { display: flex; align-items: center; gap: 10px; }
.hiwv2__progress-label {
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--ink-3); white-space: nowrap;
}
.hiwv2__progress-track {
  width: 104px; height: 4px; border-radius: 3px;
  background: var(--paper-3); border: 1px solid var(--line-3); overflow: hidden;
}
.hiwv2__progress-fill {
  display: block; height: 100%; border-radius: 3px;
  background: var(--active-accent, var(--ink));
  transition: width 0.45s cubic-bezier(0.22, 1, 0.36, 1), background 0.4s ease;
}

/* ── Rail: a progress spine ───────────────────────────────── */
.hiwv2-root .hiwv2__rail {
  border-right: 1px solid var(--line-2);
  background: var(--paper-2);
  padding: 26px 16px 22px 24px;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 4px;
}
.hiwv2__rail-eyebrow {
  font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--ink-3); font-weight: 600; padding: 0 4px 10px;
}
.hiwv2__toc { position: relative; display: flex; flex-direction: column; gap: 6px; }
/* The spine line behind the nodes. */
.hiwv2__toc::before {
  content: ""; position: absolute; left: 13px; top: 22px; bottom: 22px;
  width: 2px; background: var(--line); border-radius: 2px;
}
.hiwv2__toc-item {
  display: grid; grid-template-columns: 28px auto 1fr; align-items: start; gap: 12px;
  padding: 13px 14px 13px 0; position: relative;
  background: none; border: 1px solid transparent; border-radius: 9px;
  text-align: left; cursor: pointer; font: inherit; color: var(--ink-2); width: 100%;
  transition: background 0.14s ease, color 0.14s ease, box-shadow 0.14s ease;
}
.hiwv2__toc-item:hover { background: var(--paper-3); color: var(--ink); }
.hiwv2__node { width: 28px; display: flex; justify-content: center; padding-top: 3px; }
.hiwv2__node::before {
  content: ""; width: 11px; height: 11px; border-radius: 50%;
  background: var(--paper); border: 2px solid var(--ink-4); position: relative; z-index: 1;
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.hiwv2__toc-item.is-done .hiwv2__node::before { background: var(--ink); border-color: var(--ink); }
.hiwv2__toc-item.is-active .hiwv2__node::before {
  background: var(--active-accent, var(--ink));
  border-color: var(--active-accent, var(--ink));
  transform: scale(1.18);
  box-shadow: 0 0 0 4px color-mix(in oklab, var(--active-accent, var(--ink)) 20%, transparent);
}
.hiwv2__toc-item.is-active {
  background: var(--paper); color: var(--ink);
  border-color: var(--line); box-shadow: var(--shadow-soft);
}
.hiwv2__toc-num {
  font-family: "JetBrains Mono", monospace; font-size: 11px; color: var(--ink-3);
  padding-top: 3px;
}
.hiwv2__toc-item.is-active .hiwv2__toc-num,
.hiwv2__toc-item.is-done .hiwv2__toc-num { color: var(--ink); }
.hiwv2__toc-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.hiwv2__toc-name { font-size: 13px; font-weight: 500; letter-spacing: -0.005em; }
.hiwv2__toc-desc { font-size: 11px; color: var(--ink-3); line-height: 1.35; }
.hiwv2__rail-foot {
  margin-top: auto; padding: 14px 6px 2px; border-top: 1px dashed var(--line-2);
  display: flex; flex-direction: column; gap: 6px;
  font-size: 11px; color: var(--ink-3);
}
.hiwv2__rail-foot a {
  color: var(--ink-2); text-decoration: none;
  font-family: "JetBrains Mono", monospace; font-size: 11px;
}
.hiwv2__rail-foot a:hover { color: var(--ink); }

/* ── Hero chapter openers ─────────────────────────────────── */
.hiwv2-root .ch { padding-top: 22px; }
.hiwv2-root .ch__head {
  position: relative; overflow: hidden;
  grid-template-columns: 88px 1fr; gap: 22px; align-items: start;
  margin: 4px 0 28px; padding: 26px 26px 24px;
  border: 1px solid color-mix(in oklab, var(--ch-accent) 26%, var(--line-2));
  border-radius: 16px;
  background:
    radial-gradient(130% 150% at 0% 0%, color-mix(in oklab, var(--ch-accent) 13%, transparent) 0%, transparent 58%),
    var(--paper-2);
}
/* A soft dotted motif in the far corner — texture, not a numeral. */
.hiwv2-root .ch__head::after {
  content: ""; position: absolute; right: -40px; top: -40px;
  width: 160px; height: 160px; border-radius: 50%; pointer-events: none;
  background-image: radial-gradient(circle, color-mix(in oklab, var(--ch-accent) 22%, transparent) 1px, transparent 1.4px);
  background-size: 12px 12px; opacity: 0.5;
  mask-image: radial-gradient(circle, #000 40%, transparent 72%);
  -webkit-mask-image: radial-gradient(circle, #000 40%, transparent 72%);
}
.hiwv2-root .ch__num {
  font-size: 22px; padding: 14px 0 13px; align-self: start;
  background: color-mix(in oklab, var(--ch-accent) 12%, var(--paper));
  border-color: color-mix(in oklab, var(--ch-accent) 42%, var(--line));
  color: var(--ch-accent);
}
.hiwv2-root .ch__num span { color: color-mix(in oklab, var(--ch-accent) 55%, var(--ink-3)); }
.hiwv2-root .ch__head-r { position: relative; z-index: 1; }
.hiwv2-root .ch__eyebrow { color: var(--ch-accent); }
.hiwv2-root .ch__eyebrow .dot {
  background: var(--ch-accent);
  box-shadow: 0 0 0 4px color-mix(in oklab, var(--ch-accent) 16%, transparent);
}
.hiwv2-root .ch__title { font-size: 29px; line-height: 1.13; margin: 8px 0 10px; }
.hiwv2-root .ch__lede { font-size: 16.5px; max-width: 70ch; }

/* Intro gets the same lift without the boxed header. */
.hiwv2-root .hiw__intro { padding-top: 30px; }
.hiwv2-root .hiw__intro-h1.intro-h1--loud { font-size: 44px; }
.hiwv2-root .hiw__intro-eyebrow.eyebrow--v3 { color: var(--sage-deep); }

/* Section dividers pick up the chapter accent. */
.hiwv2-root .ch__sec-tag::before { color: var(--ch-accent); opacity: 0.9; }

/* ── Card craft: hover lift + accent focus ────────────────── */
.hiwv2-root .stat,
.hiwv2-root .roadmap__card,
.hiwv2-root .spec,
.hiwv2-root .flow__strip > .node {
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.18s ease, border-color 0.18s ease;
}
.hiwv2-root .stat:hover,
.hiwv2-root .roadmap__card:hover,
.hiwv2-root .spec:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px -14px rgba(26, 32, 48, 0.42);
  border-color: color-mix(in oklab, var(--ch-accent) 34%, var(--line));
}
.hiwv2-root .flow__strip > .node:not(.node--ghost):hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 26px -14px rgba(26, 32, 48, 0.48);
}

/* ── Staggered content reveal ─────────────────────────────── */
.hiwv2-root .hiw__page { animation: none; }
@media (prefers-reduced-motion: no-preference) {
  .hiwv2-root .hiw__page > * { animation: hiwv2-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
  .hiwv2-root .hiw__page > *:nth-child(1) { animation-delay: 0.03s; }
  .hiwv2-root .hiw__page > *:nth-child(2) { animation-delay: 0.08s; }
  .hiwv2-root .hiw__page > *:nth-child(3) { animation-delay: 0.13s; }
  .hiwv2-root .hiw__page > *:nth-child(4) { animation-delay: 0.18s; }
  .hiwv2-root .hiw__page > *:nth-child(5) { animation-delay: 0.23s; }
  .hiwv2-root .hiw__page > *:nth-child(6) { animation-delay: 0.28s; }
  .hiwv2-root .hiw__page > *:nth-child(7) { animation-delay: 0.32s; }
  .hiwv2-root .hiw__page > *:nth-child(8) { animation-delay: 0.36s; }
  .hiwv2-root .hiw__page > *:nth-child(n + 9) { animation-delay: 0.4s; }
}
@keyframes hiwv2-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}

/* ── Responsive ───────────────────────────────────────────── */
@media (max-width: 980px) {
  .hiwv2-root.hiw__panel { grid-template-columns: 1fr; }
  .hiwv2-root .hiwv2__rail { display: none; }
  .hiwv2-root .ch__head { grid-template-columns: 1fr; gap: 14px; padding: 20px; }
  .hiwv2-root .ch__title { font-size: 24px; }
  .hiwv2-root .hiw__intro-h1.intro-h1--loud { font-size: 32px; }
}
`;

export function HowItWorksModalV2({ open, onClose }: Props) {
  const [active, setActive] = useState<ChapterId>('ch-intro');
  const scrollRef = useRef<HTMLElement>(null);

  // Inject the v1 base stylesheet (component CSS we reuse) + the v2 override.
  useEffect(() => {
    if (!document.getElementById('hiwv2-base-styles')) {
      const base = document.createElement('style');
      base.id = 'hiwv2-base-styles';
      base.textContent = STYLES;
      document.head.appendChild(base);
    }
    if (!document.getElementById('hiwv2-override-styles')) {
      const ov = document.createElement('style');
      ov.id = 'hiwv2-override-styles';
      ov.textContent = STYLES_V2;
      document.head.appendChild(ov);
    }
    return () => {
      document.getElementById('hiwv2-base-styles')?.remove();
      document.getElementById('hiwv2-override-styles')?.remove();
    };
  }, []);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Reset scroll on chapter change.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [active]);

  // Keyboard: ESC closes, ←/→ pages through the main rail chapters.
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;
      const idx = CHAPTERS.findIndex((c) => c.id === active);
      if (idx === -1) return; // sub-pages (ch-market) step via the pager, not arrows
      if (e.key === 'ArrowRight' && idx < CHAPTERS.length - 1) {
        e.preventDefault();
        setActive(CHAPTERS[idx + 1].id);
      } else if (e.key === 'ArrowLeft' && idx > 0) {
        e.preventDefault();
        setActive(CHAPTERS[idx - 1].id);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, active, onClose]);

  // Delegate clicks on [data-goto] anchors to setActive (same contract as v1).
  function handleMainClick(e: React.MouseEvent<HTMLElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-goto]');
    if (!el) return;
    const id = el.dataset.goto as ChapterId | undefined;
    if (!id || (id !== 'ch-market' && !CHAPTERS.some((c) => c.id === id))) return;
    e.preventDefault();
    setActive(id);
  }

  const isMarket = active === 'ch-market';
  const railIdx = isMarket ? 0 : CHAPTERS.findIndex((c) => c.id === active);
  const accent = ACCENT[active];
  const progressPct = isMarket ? 100 : ((railIdx + 1) / CHAPTERS.length) * 100;
  const currentTitle = isMarket
    ? 'The market data'
    : (CHAPTERS.find((c) => c.id === active)?.name ?? '');
  const progressLabel = isMarket
    ? 'Sidebar · market'
    : `Chapter ${CHAPTERS[railIdx]?.num ?? '00'} / ${CHAPTERS[CHAPTERS.length - 1].num}`;

  return (
    <AnimatePresence>
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="hiw-title"
        >
          <motion.div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(26, 32, 48, 0.45)',
              backdropFilter: 'blur(2px)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            className="hiw-root hiwv2-root hiw__panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: 'relative', ['--active-accent' as string]: accent }}
          >
            <header className="hiw__head">
              <div className="hiw__head-l">
                <span className="hiw__head-mark" aria-hidden="true">
                  P
                </span>
                <span className="hiw__head-name">PTScribe</span>
                <span className="hiw__head-divider" aria-hidden="true" />
                <span className="hiw__head-title">{currentTitle}</span>
              </div>
              <div className="hiw__head-r">
                <div className="hiwv2__progress" aria-hidden="true">
                  <span className="hiwv2__progress-label">{progressLabel}</span>
                  <span className="hiwv2__progress-track">
                    <span className="hiwv2__progress-fill" style={{ width: `${progressPct}%` }} />
                  </span>
                </div>
                <a
                  href={REPO}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hiw__edit-link"
                  aria-label="Open the repo on GitHub"
                >
                  <GithubMark size={11} />
                  kyle-giacchi/ptscribe
                </a>
                <button className="hiw__close" onClick={onClose} aria-label="Close how it works">
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            </header>

            <aside className="hiwv2__rail" aria-label="Chapters">
              <div className="hiwv2__rail-eyebrow">Builder's journal</div>
              <nav className="hiwv2__toc">
                {CHAPTERS.map((c, i) => {
                  const state = isMarket
                    ? i === 0
                      ? 'is-active'
                      : ''
                    : i < railIdx
                      ? 'is-done'
                      : i === railIdx
                        ? 'is-active'
                        : '';
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`hiwv2__toc-item ${state}`}
                      aria-current={active === c.id ? 'page' : undefined}
                      onClick={() => setActive(c.id)}
                    >
                      <span className="hiwv2__node" aria-hidden="true" />
                      <span className="hiwv2__toc-num">{c.num}</span>
                      <span className="hiwv2__toc-text">
                        <span className="hiwv2__toc-name">{c.name}</span>
                        <span className="hiwv2__toc-desc">{c.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </nav>

              <div className="hiwv2__rail-foot">
                <span>Want the gory details?</span>
                <a href={REPO} target="_blank" rel="noopener noreferrer">
                  ↗ The repo
                </a>
              </div>
            </aside>

            <main className="hiw__main" ref={scrollRef} onClick={handleMainClick}>
              {active === 'ch-intro' && <IntroChapter />}
              {active === 'ch-market' && <MarketChapter />}
              {active === 'ch-security' && <SecurityChapterV2 />}
              {active === 'ch-voice' && <VoiceChapterV2 />}
              {active === 'ch-notes' && <NotesChapterV2 />}
              {active === 'ch-future' && <FutureChapterV2 />}
            </main>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
