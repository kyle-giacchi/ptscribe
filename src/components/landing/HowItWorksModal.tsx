import { useEffect, useState, useRef, type ReactNode, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export type ChapterId =
  | 'ch-intro'
  | 'ch-market'
  | 'ch-security'
  | 'ch-voice'
  | 'ch-notes'
  | 'ch-future';

export const CHAPTERS: { id: ChapterId; num: string; name: string; desc: string }[] = [
  { id: 'ch-intro', num: '00', name: 'Why I built this', desc: '$1,800/yr per clinician. Really?' },
  {
    id: 'ch-security',
    num: '01',
    name: 'Secure, local-first',
    desc: 'Your data stays on your device.',
  },
  { id: 'ch-voice', num: '02', name: 'Voice & cost', desc: "What's possible on a laptop." },
  {
    id: 'ch-notes',
    num: '03',
    name: 'Notes & the AI bound',
    desc: 'The one place I send to the cloud.',
  },
  { id: 'ch-future', num: '04', name: 'Down the road', desc: 'A clinic in a box.' },
];

export const REPO = 'https://github.com/kyle-giacchi/ptscribe';

// ─── Inline SVG glyphs for ch-security flow nodes ─────────────────────────────

export function VaultIcon() {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="5.5" width="25" height="21" rx="2" />
      <circle cx="13" cy="16" r="4.5" />
      <circle cx="13" cy="16" r="1.2" fill="currentColor" stroke="none" />
      <path d="M13 11.5v-1.2M13 21.7v-1.2M17.5 16h1.2M7.5 16h1.2" />
      <path d="M21.5 12v8M24.5 12v8" />
    </svg>
  );
}

export function StorageIcon() {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="6" width="26" height="20" rx="2" />
      <path d="M3 12h26" />
      <circle cx="6.5" cy="9" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9.3" cy="9" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12.1" cy="9" r="0.9" fill="currentColor" stroke="none" />
      <ellipse cx="16" cy="17.5" rx="6" ry="1.6" />
      <path d="M10 17.5v3.6c0 .9 2.7 1.6 6 1.6s6-.7 6-1.6v-3.6" />
    </svg>
  );
}

export function CloudIcon() {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.5 23.5a5.2 5.2 0 01-.6-10.4 7.3 7.3 0 0114.2-1 4.7 4.7 0 011 9.3l-.4.1H9.5z" />
    </svg>
  );
}

export function GithubMark({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38v-1.34c-2.23.48-2.7-1.08-2.7-1.08-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.22.83 1.22.83.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.66 7.66 0 014 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.74.54 1.49v2.21c0 .21.15.46.55.38A8 8 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

// ─── Small reusable primitives ────────────────────────────────────────────────

export function SectionHead({ tag, title }: { tag: string; title: string }) {
  return (
    <h3 className="ch__sec-head">
      <span className="ch__sec-tag">{tag}</span>
      <span className="ch__sec-title">{title}</span>
      <i className="ch__sec-rule" />
    </h3>
  );
}

export function ChapterHeader({
  num,
  eyebrow,
  eyebrowVariant,
  title,
  lede,
}: {
  num: string;
  eyebrow: string;
  eyebrowVariant?: 'sec' | 'trans' | 'note' | 'amber';
  title: string;
  lede: ReactNode;
}) {
  const eyebrowClass = eyebrowVariant
    ? `ch__eyebrow ch__eyebrow--${eyebrowVariant}`
    : 'ch__eyebrow';
  const dotStyle: CSSProperties | undefined =
    eyebrowVariant === 'amber' ? { background: 'var(--amber)' } : undefined;
  return (
    <header className="ch__head">
      <div className="ch__num">
        CH<span>chapter</span>
        {num}
      </div>
      <div className="ch__head-r">
        <span className={eyebrowClass}>
          <span className="dot" style={dotStyle} />
          {eyebrow}
        </span>
        <h2 className="ch__title">{title}</h2>
        <p className="ch__lede">{lede}</p>
      </div>
    </header>
  );
}

export function Pager({
  prev,
  next,
  hint,
}: {
  prev?: { id: ChapterId; label: string };
  next?: { id: ChapterId; label: string };
  hint?: string;
  onGoto?: (id: ChapterId) => void;
}) {
  // The actual onGoto is wired by the parent via data-goto delegation.
  return (
    <nav className="hiw__pager" aria-label="Chapter navigation">
      {hint && <span className="hiw__pager-hint mono">{hint}</span>}
      {prev && (
        <a className="hiw__pager-link hiw__pager-prev" href={`#${prev.id}`} data-goto={prev.id}>
          <span className="hiw__pager-dir mono">← Previous</span>
          <span className="hiw__pager-label">{prev.label}</span>
        </a>
      )}
      {next && (
        <a className="hiw__pager-link hiw__pager-next" href={`#${next.id}`} data-goto={next.id}>
          <span className="hiw__pager-dir mono">Next →</span>
          <span className="hiw__pager-label">{next.label}</span>
        </a>
      )}
    </nav>
  );
}

export function Disclose({
  tag,
  title,
  children,
}: {
  tag: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="disclose">
      <summary className="disclose__sum">
        <span className="ch__sec-head ch__sec-head--inline">
          <span className="ch__sec-tag">{tag}</span>
          <span className="ch__sec-title">{title}</span>
          <i className="ch__sec-rule" />
        </span>
        <span className="disclose__hint mono">
          <span className="disclose__hint-open">Show technical detail</span>
          <span className="disclose__hint-close">Hide</span>
          <span className="disclose__chev" aria-hidden="true">
            ›
          </span>
        </span>
      </summary>
      <div className="disclose__body">{children}</div>
    </details>
  );
}

// ─── Chapter content ──────────────────────────────────────────────────────────

export function IntroChapter() {
  return (
    <section id="ch-intro" className="hiw__intro hiw__page is-active" data-page="ch-intro">
      <span className="eyebrow mono hiw__intro-eyebrow eyebrow--v3">
        Why I built this · the pricing problem
      </span>
      <h1 className="hiw__intro-h1 intro-h1--loud" id="hiw-title">
        I honestly couldn't believe what these tools cost.
      </h1>
      <div className="hiw__intro-body">
        <p className="hiw__intro-sub">
          The leading SaaS clinical scribes run about{' '}
          <strong>
            <span className="intro-h1__amt">$1,800 a year per clinician</span>
          </strong>
          .
        </p>

        <p className="hiw__intro-sub">
          The average PT earns about <strong>$100k a year</strong> (BLS, 2024), roughly{' '}
          <strong>$74k</strong> is what they actually take home after taxes.
        </p>

        <p className="hiw__intro-sub hiw__intro-punch">
          That&rsquo;s about <strong>2.5 weeks of their paychecks</strong>!{' '}
          <strong>2.5% of their hard-earned money</strong>!
        </p>

        <p className="hiw__intro-sub">
          I get it&hellip; AI costs money, and these software companies need to pay people to host
          servers, secure them, get compliance audits, pay UI developers to center a div, and staff
          multiple business units to ensure their software-masked-as-a-business keeps running.
        </p>

        <p className="hiw__intro-sub">So it begs the questions&hellip;</p>

        <div className="hiw__intro-qs">
          <p className="hiw__intro-q">
            Do we really need another payer (the clinician) and another provider (the SaaS company)
            wedged into the healthcare stack?
          </p>
          <p className="hiw__intro-q">
            Can a solo product builder create a product that meets feature parity with some of the
            leaders in the industry?
          </p>
        </div>
      </div>

      <div className="market-strip__h">
        <span>Annual cost · per clinician</span>
      </div>
      <div className="price-compare">
        <div className="price-card price-card--saas">
          <span className="price-card__kicker">Leading SaaS scribes</span>
          <span className="price-card__name">Subscription · per clinician</span>
          <span className="price-card__v">
            $1,800<span className="unit">/yr</span>
          </span>
        </div>
        <span className="price-compare__vs" aria-hidden="true">
          vs.
        </span>
        <div className="price-card price-card--ours">
          <span className="price-card__kicker">PTScribe</span>
          <span className="price-card__name">Your own provider spend · per clinician</span>
          <span className="price-card__v">
            <span className="approx">~</span>$5<span className="unit">/yr</span>
          </span>
        </div>
      </div>

      <p className="hiw__intro-explore">
        If you want to learn more, jump straight to{' '}
        <a className="hiw__intro-explore-link" href="#ch-market" data-goto="ch-market">
          <em>the market data</em>
        </a>{' '}
        <span className="hiw__intro-explore-sep">›</span>{' '}
        <a className="hiw__intro-explore-link" href="#ch-security" data-goto="ch-security">
          <em>how I handled security</em>
        </a>{' '}
        <span className="hiw__intro-explore-sep">›</span>{' '}
        <a className="hiw__intro-explore-link" href="#ch-voice" data-goto="ch-voice">
          <em>how I optimized voice transcription to cut cost</em>
        </a>{' '}
        <span className="hiw__intro-explore-sep">›</span>{' '}
        <a className="hiw__intro-explore-link" href="#ch-notes" data-goto="ch-notes">
          <em>the struggles of local note processing</em>
        </a>{' '}
        <span className="hiw__intro-explore-sep">›</span> and lastly,{' '}
        <a className="hiw__intro-explore-link" href="#ch-future" data-goto="ch-future">
          <em>how I intend to grow this solution</em>
        </a>
        .
      </p>
    </section>
  );
}

export function MarketChapter() {
  return (
    <section id="ch-market" className="ch hiw__page" data-page="ch-market">
      <h3 className="market-facts__title">
        Market facts <span className="market-facts__title-sub">· the wider context</span>
      </h3>
      <div className="market-facts" role="table" aria-label="Market facts">
        <div className="market-facts__head" role="row">
          <span role="columnheader">Fact</span>
          <span role="columnheader" className="src">
            What it means in context
          </span>
          <span role="columnheader">Figure</span>
        </div>

        <div className="market-facts__row" role="row">
          <span className="market-facts__k" role="cell">
            Licensed PTs · US
          </span>
          <span className="market-facts__note" role="cell">
            The full addressable market for a US-only physical-therapy scribe.{' '}
            <strong>BLS Occupational Outlook · 2024</strong>.
          </span>
          <span className="market-facts__v" role="cell">
            <span className="approx">~</span>180,000<span className="unit">clinicians</span>
          </span>
        </div>

        <div className="market-facts__row" role="row">
          <span className="market-facts__k" role="cell">
            Visits per clinician · year
          </span>
          <span className="market-facts__note" role="cell">
            ~15 patients/day × ~225 working days. Roughly <strong>1,650 hours</strong> of session
            audio per clinician, per year.
          </span>
          <span className="market-facts__v" role="cell">
            <span className="approx">~</span>3,375<span className="unit">visits/yr</span>
          </span>
        </div>

        <div className="market-facts__row" role="row">
          <span className="market-facts__k" role="cell">
            Average billable session
          </span>
          <span className="market-facts__note" role="cell">
            A typical 1:1 PT visit. Drives the per-clinician audio-minute estimate that anchors
            every downstream cost number.
          </span>
          <span className="market-facts__v" role="cell">
            30–45<span className="unit">min</span>
          </span>
        </div>

        <div className="market-facts__row" role="row">
          <span className="market-facts__k" role="cell">
            Manual note time · per year
          </span>
          <span className="market-facts__note" role="cell">
            Hand-written documentation, about <strong>12 min/visit</strong>, blended across a
            typical caseload, multiplied across all ~3,375 visits a clinician logs in a year.
          </span>
          <span className="market-facts__v" role="cell">
            <span className="approx">~</span>675<span className="unit">hrs/yr</span>
          </span>
        </div>

        <div className="market-facts__row" role="row">
          <span className="market-facts__k" role="cell">
            AI-assisted note time · per year
          </span>
          <span className="market-facts__note" role="cell">
            Record → generate → review &amp; finalize. Real-world ambient-scribe studies land at{' '}
            <strong>~5 min/visit</strong>, the same caseload, a fraction of the desk time. Against
            the <strong>~675 hrs/yr</strong> above, that&rsquo;s roughly:
          </span>
          <span className="market-facts__v" role="cell">
            <span className="approx">~</span>60<span className="unit">% less</span>
          </span>
        </div>

        <div className="market-facts__row is-alarm" role="row">
          <span className="market-facts__k" role="cell">
            Industry-wide subs · half-adoption
          </span>
          <span className="market-facts__note" role="cell">
            90,000 PTs × $1,800/yr, what would flow into SaaS subscription revenue if even{' '}
            <strong>half</strong> of US PTs subscribed.
          </span>
          <span className="market-facts__v" role="cell">
            <span className="approx">~</span>$162M<span className="unit">/yr</span>
          </span>
        </div>

        <div className="market-facts__row" role="row">
          <span className="market-facts__k" role="cell">
            Estimated operating cost · half-adoption
          </span>
          <span className="market-facts__note" role="cell">
            What it actually costs to run a Heidi-style scribe for those same 90k subscribers:
            Nova-3 transcription on every minute (<strong>~$45M</strong>), plus LLM note generation
            and cloud infrastructure. Against the <strong>~$162M</strong> they pay in, the gap is
            the markup.
          </span>
          <span className="market-facts__v" role="cell">
            <span className="approx">~</span>$60M<span className="unit">/yr</span>
          </span>
        </div>
      </div>

      <div className="intro-bridge-block">
        <span className="intro-bridge-block__eyebrow">The question</span>
        <p className="intro-bridge">
          So it begs the question:{' '}
          <strong>could I build a secure, local-first clinical scribe that holds its own?</strong>
        </p>
      </div>

      <ol className="goals" role="list">
        <li className="goal" role="listitem">
          <a className="goal__link" href="#ch-security" data-goto="ch-security">
            <span className="goal__k">01</span>
            <span className="goal__body">
              <span className="goal__h">
                Your patients' information never leaves your computer.
              </span>
              <span className="goal__teaser">
                No cloud, no outside servers, no one else holding the keys.
              </span>
            </span>
            <span className="goal__go">ch. 01 →</span>
          </a>
        </li>
        <li className="goal" role="listitem">
          <a className="goal__link" href="#ch-voice" data-goto="ch-voice">
            <span className="goal__k">02</span>
            <span className="goal__body">
              <span className="goal__h">Runs on the everyday laptop you already have.</span>
              <span className="goal__teaser">
                No special equipment, no IT request, nothing new to buy.
              </span>
            </span>
            <span className="goal__go">ch. 02 →</span>
          </a>
        </li>
        <li className="goal" role="listitem">
          <a className="goal__link" href="#ch-notes" data-goto="ch-notes">
            <span className="goal__k">03</span>
            <span className="goal__body">
              <span className="goal__h">Covers the core features of the big-name scribes.</span>
              <span className="goal__teaser">
                The same polished notes, for a fraction of the price.
              </span>
            </span>
            <span className="goal__go">ch. 03 →</span>
          </a>
        </li>
      </ol>

      <ol className="hiw__index" role="list">
        <li role="listitem">
          <a className="hiw__idx" href="#ch-security" data-goto="ch-security">
            <span className="hiw__idx-num mono">01</span>
            <span className="hiw__idx-body">
              <span className="hiw__idx-kicker">
                <span className="ch__eyebrow ch__eyebrow--sec">
                  <span className="dot" />
                  Secure, local-first
                </span>
              </span>
              <span className="hiw__idx-title">
                No server-side database. Encrypted at rest. A worker that proxies and nothing else.
              </span>
            </span>
            <span className="hiw__idx-leader" aria-hidden="true" />
            <span className="hiw__idx-meta mono">
              <span>vault · csp · proxy</span>
              <span className="hiw__idx-page">p. 1</span>
            </span>
            <span className="hiw__idx-arrow" aria-hidden="true">
              →
            </span>
          </a>
        </li>
        <li role="listitem">
          <a className="hiw__idx" href="#ch-voice" data-goto="ch-voice">
            <span className="hiw__idx-num mono">02</span>
            <span className="hiw__idx-body">
              <span className="hiw__idx-kicker">
                <span className="ch__eyebrow ch__eyebrow--trans">
                  <span className="dot" />
                  Voice &amp; cost
                </span>
              </span>
              <span className="hiw__idx-title">
                Three ways to turn speech into text, and the audio-engineering tricks that make Nova
                affordable.
              </span>
            </span>
            <span className="hiw__idx-leader" aria-hidden="true" />
            <span className="hiw__idx-meta mono">
              <span>whisper · web speech · nova-3</span>
              <span className="hiw__idx-page">p. 2</span>
            </span>
            <span className="hiw__idx-arrow" aria-hidden="true">
              →
            </span>
          </a>
        </li>
        <li role="listitem">
          <a className="hiw__idx" href="#ch-notes" data-goto="ch-notes">
            <span className="hiw__idx-num mono">03</span>
            <span className="hiw__idx-body">
              <span className="hiw__idx-kicker">
                <span className="ch__eyebrow ch__eyebrow--note">
                  <span className="dot" />
                  Notes &amp; the AI bound
                </span>
              </span>
              <span className="hiw__idx-title">
                The one critical-path feature I couldn't keep local, and the on-device PII model
                that softens the blow.
              </span>
            </span>
            <span className="hiw__idx-leader" aria-hidden="true" />
            <span className="hiw__idx-meta mono">
              <span>sonnet 4.6 · bert-ner · regex</span>
              <span className="hiw__idx-page">p. 3</span>
            </span>
            <span className="hiw__idx-arrow" aria-hidden="true">
              →
            </span>
          </a>
        </li>
        <li role="listitem">
          <a className="hiw__idx" href="#ch-future" data-goto="ch-future">
            <span className="hiw__idx-num mono">04</span>
            <span className="hiw__idx-body">
              <span className="hiw__idx-kicker">
                <span className="ch__eyebrow">
                  <span className="dot" style={{ background: 'var(--amber)' }} />
                  Down the road
                </span>
              </span>
              <span className="hiw__idx-title">
                If "local" didn't have to mean your laptop, just a machine inside the building.
              </span>
            </span>
            <span className="hiw__idx-leader" aria-hidden="true" />
            <span className="hiw__idx-meta mono">
              <span>fog computing · on-prem</span>
              <span className="hiw__idx-page">p. 4</span>
            </span>
            <span className="hiw__idx-arrow" aria-hidden="true">
              →
            </span>
          </a>
        </li>
      </ol>

      <p className="note" style={{ marginTop: 18 }}>
        The <strong>~$5/yr estimate</strong> is note-generation billed directly to your own provider
        account (Anthropic, OpenAI, or Google) at a typical caseload. PTScribe takes no cut. Local
        Whisper carries the transcript for $0 and the Nova-3 "Improve with AI" pass is opt-in and
        capped 1× per session. The <strong>$89M</strong> is a cloud-only counterfactual, what every
        minute of every visit would cost if you sent it all to Nova-3. PTScribe doesn't pay that,
        because local Whisper carries the default load. <strong>$162M</strong> is a straightforward
        revenue estimate at $1,800/yr × 90k PTs, not a claim about any one vendor's margins.
        <span className="note__sig">basis &amp; caveat</span>
      </p>

      <div className="hiw__pager">
        <a className="hiw__pager-link hiw__pager-prev" href="#ch-intro" data-goto="ch-intro">
          <span className="hiw__pager-dir mono">← Back</span>
          <span className="hiw__pager-label">Why I built this</span>
        </a>
        <a className="btn btn--primary hiw__pager-next" href="#ch-security" data-goto="ch-security">
          Start with the security model
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M3 6h6M6 3l3 3-3 3" />
          </svg>
        </a>
      </div>
    </section>
  );
}

export function SecurityChapter() {
  return (
    <section id="ch-security" className="ch hiw__page" data-page="ch-security">
      <ChapterHeader
        num="01"
        eyebrow="Secure, local-first strategy · 90s read"
        eyebrowVariant="sec"
        title="Your data stays on your device unless you explicitly send it."
        lede={
          <>
            Three layers enforce that. <strong>Everything lives on your machine, encrypted.</strong>{' '}
            The <strong>only thing that crosses the network is a thin proxy.</strong> And the{' '}
            <strong>browser's CSP is the real local-first fence</strong>, a compromised dependency
            can't phone home, because the browser refuses to open the connection.
          </>
        }
      />

      <SectionHead tag="anatomy" title="Where every byte lives, and what's allowed to cross" />

      <div
        className="flow"
        role="group"
        aria-label="Data flow: the vault key is held only in memory, encrypts every byte into localStorage and IndexedDB at rest, and the only thing that crosses the network is a thin Cloudflare Worker proxy that never stores clinical data."
      >
        <div className="flow__strip" style={{ ['--cols' as string]: 5 } as CSSProperties}>
          <div className="node node--ink">
            <div className="node__top">
              <span className="node__tag">browser tab</span>
              <span className="node__glyph" aria-hidden="true">
                <VaultIcon />
              </span>
            </div>
            <div className="node__name">Vault key (in memory)</div>
            <div className="node__desc">
              Unlocked once when you open the app, via passphrase or passkey. Held only in memory.
            </div>
            <div className="node__meta">tab-lifetime</div>
          </div>
          <div className="flow__arrow">
            <span className="flow__arrow-lbl">AES-GCM</span>
          </div>
          <div className="node node--sage">
            <div className="node__top">
              <span className="node__tag">at-rest</span>
              <span className="node__glyph" aria-hidden="true">
                <StorageIcon />
              </span>
            </div>
            <div className="node__name">localStorage + IndexedDB</div>
            <div className="node__desc">
              Patients, sessions, notes, templates in <code>localStorage</code>. Audio Blobs in
              IndexedDB. Every byte sealed at rest.
            </div>
            <div className="node__meta">no server-side DB</div>
          </div>
          <div className="flow__arrow flow__arrow--rec">
            <span className="flow__arrow-lbl">explicit</span>
          </div>
          <div className="node">
            <div className="node__top">
              <span className="node__tag">network boundary</span>
              <span className="node__glyph" aria-hidden="true">
                <CloudIcon />
              </span>
            </div>
            <div className="node__name">Cloudflare Worker</div>
            <div className="node__desc">
              A proxy and nothing else. Forwards AI calls.{' '}
              <strong>Never stores or logs clinical data.</strong> Provider credentials stay
              server-side.
            </div>
            <div className="node__meta">/api/transcribe · /api/generate</div>
          </div>
        </div>

        <div className="flow__branch">
          <div className="flow__branch-stems">
            <span />
            <span />
          </div>
          <div className="flow__branch-row">
            <div className="node node--ghost">
              <div className="node__top">
                <span className="node__tag">worker enforces</span>
                <span className="node__glyph" />
              </div>
              <div className="node__name">The cloud worker is locked to this app</div>
              <div className="node__desc">
                It only accepts requests coming from PTScribe, caps how many anyone can send, and
                forwards to a fixed short list of AI models. It can't be turned into a free open
                proxy.
              </div>
            </div>
            <div className="node node--ghost">
              <div className="node__top">
                <span className="node__tag">the real fence</span>
                <span className="node__glyph" />
              </div>
              <div className="node__name">The browser blocks outside connections</div>
              <div className="node__desc">
                Even if a piece of code in PTScribe were tampered with, the browser refuses to let
                it talk to anywhere except PTScribe's own worker and the model download site.
                There's nowhere for stolen data to go.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="note">
        <p>
          An MVP focused on clinical transcription didn't need a database. But the scaffolding is
          already there: login, DB connections, even a way to deploy this across a whole company.
          Maybe go check it out. <strong>Maybe hire me.</strong>
        </p>
        <span className="note__sig">github.com/kyle-giacchi/ptscribe</span>
      </div>

      <SectionHead tag="proof" title="The Worker forwards, gates, and forgets" />

      <div className="snippet" role="region" aria-label="The Worker is a proxy only">
        <div className="snippet__head">
          <span className="snippet__head-l">
            <span className="snippet__head-dot" /> worker/index.ts
          </span>
          <span>"proxy and nothing else"</span>
        </div>
        <pre>{`// No persistence. No body is ever stored.
export default {
  async fetch(req, env) {
    if (!req.headers.get("Origin"))         return deny(403);
    if (!gateOk(req, env.GATE_HASH))         return deny(401);
    if (!(await rateLimitOk(req, env.KV)))   return deny(429);

    const route = match(req.url);              // /api/transcribe | /api/generate | /api/model/*
    if (!route)                                return deny(404);
    if (!ALLOWED_MODELS.has(route.model))      return deny(400);

    return forward(route, req, env);           // streams provider response
  }
}`}</pre>
      </div>

      <Disclose
        tag="implementer detail"
        title="Cipher, key lifecycle, gate ordering, and the CSP value"
      >
        <div className="specs">
          <div className="spec">
            <div className="spec__k">at-rest cipher</div>
            <div className="spec__v">
              <code>AES-GCM</code>
            </div>
            <div className="spec__note">
              Web Crypto. Every byte of clinical data sealed before it touches storage.
            </div>
          </div>
          <div className="spec">
            <div className="spec__k">key lifecycle</div>
            <div className="spec__v">
              <code>tab-lifetime</code>
            </div>
            <div className="spec__note">
              Unlocked at cold open. Held in memory. Evicted when the tab closes. No idle timeout,
              no recovery.
            </div>
          </div>
          <div className="spec">
            <div className="spec__k">worker gates</div>
            <div className="spec__v">
              <code>Origin · sha256 · rate limit · allowlist</code>
            </div>
            <div className="spec__note">
              No <code>Origin</code> → rejected. Pre-gate per-IP throttle, then post-gate per-IP and
              per-day, then global daily ceiling.
            </div>
          </div>
          <div className="spec">
            <div className="spec__k">CSP</div>
            <div className="spec__v">
              <code>connect-src 'self' + HF</code>
            </div>
            <div className="spec__note">
              A compromised dep can't open a socket to an attacker server. The browser is the
              enforcer.
            </div>
          </div>
        </div>
      </Disclose>

      <div className="takeaway">
        <span className="takeaway__icon" aria-hidden="true">
          ✓
        </span>
        <div>
          <div className="takeaway__h">There is nothing to leak from my servers</div>
          <div className="takeaway__body">
            If my Cloudflare account vanished tomorrow, no patient data would vanish with it,
            because no patient data was ever there. The flip side: the vault key is yours alone,
            with no recovery. That's the deal local-first asks you to take.
          </div>
        </div>
      </div>

      <Pager
        prev={{ id: 'ch-intro', label: 'Why I built this' }}
        next={{ id: 'ch-voice', label: 'Voice & cost' }}
      />
    </section>
  );
}

export function VoiceChapter() {
  return (
    <section id="ch-voice" className="ch hiw__page" data-page="ch-voice">
      <ChapterHeader
        num="02"
        eyebrow="Voice processing options · 2 min read"
        eyebrowVariant="trans"
        title="More than anything, I wanted to find out what's possible on a moderately-powered phone or laptop."
        lede={
          <>
            It turns out there's a whole spectrum. PTScribe uses several paths depending on the
            moment: a <strong>fully-local Whisper</strong> as the canonical transcript, a{' '}
            <strong>best-effort live preview</strong> while you record, and an{' '}
            <strong>opt-in cloud pass</strong> for the highest quality. Below: the options I
            explored, why I picked what I picked, and the audio-engineering trick that keeps the
            cloud bill from spiralling.
          </>
        }
      />

      <p className="ch__lede" style={{ fontSize: 14.5, marginTop: 4, marginBottom: 14 }}>
        Worst case first. <em>What if every user needed the highest-quality transcription?</em>{' '}
        Nova-3 bills by the minute, and at any real scale that compounds. So before a single second
        of audio goes to the cloud, I leaned on two tricks from my past life in audio engineering:{' '}
        <strong>silence removal</strong> and <strong>pitch-corrected speed-up</strong>. Both run
        on-device.
      </p>

      <div className="cost-strip">
        <div className="cost-strip__title">
          <span>A typical 32-minute PT session</span>
          <span className="cost-strip__title-r">
            unusually silent: exercise sets, manual therapy, repositioning, resting
          </span>
        </div>

        <div className="cost-bar cost-bar--baseline">
          <div className="cost-bar__label">
            <span className="cost-bar__label-h">Baseline · what you recorded</span>
            <span className="cost-bar__label-sub">Raw audio, untouched</span>
          </div>
          <div className="cost-bar__track">
            <div className="cost-bar__fill cost-bar__fill--split" style={{ width: '100%' }} />
          </div>
          <div className="cost-bar__value">
            <strong>32 min</strong> · 100%
          </div>
        </div>

        <div className="cost-bar cost-bar--trim">
          <div className="cost-bar__label">
            <span className="cost-bar__label-h">After silence removal</span>
            <span className="cost-bar__label-sub">Roughly half a typical session is dead air</span>
          </div>
          <div className="cost-bar__track">
            <div className="cost-bar__fill" style={{ width: '50%', background: 'var(--ink)' }} />
          </div>
          <div className="cost-bar__value">
            <strong>16 min</strong> · <span className="pct-down">−50%</span>
          </div>
        </div>

        <div className="cost-bar cost-bar--speed">
          <div className="cost-bar__label">
            <span className="cost-bar__label-h">After 1.5× pitch-corrected speed-up</span>
            <span className="cost-bar__label-sub">
              ASR handles 1.5× speech cleanly with no accuracy loss
            </span>
          </div>
          <div className="cost-bar__track">
            <div
              className="cost-bar__fill"
              style={{ width: '33.4%', background: 'var(--sage-deep)' }}
            />
          </div>
          <div className="cost-bar__value">
            <strong>~10.7 min</strong> · <span className="pct-down">−67%</span> total
          </div>
        </div>

        <div className="cost-bar__legend">
          <span className="cost-bar__legend-item is-speech">speech</span>
          <span className="cost-bar__legend-item is-silence">silence (trimmed before send)</span>
          <span className="cost-bar__legend-item is-trimmed">speech (sped up)</span>
        </div>
      </div>

      <div className="stats">
        <div className="stat stat--alarm">
          <span className="stat__k">Per-clinician, baseline</span>
          <span className="stat__v">
            ~$495<span className="unit">/yr</span>
          </span>
          <span className="stat__sub">Every session sent to Nova at standard pricing.</span>
        </div>
        <div className="stat stat--emph">
          <span className="stat__k">Per-clinician, optimized</span>
          <span className="stat__v">
            ~$165<span className="unit">/yr</span>
          </span>
          <span className="stat__sub">
            Same coverage, with both features on. <strong>~$330/yr saved</strong>.
          </span>
        </div>
        <div className="stat">
          <span className="stat__k">US PT industry · net savings</span>
          <span className="stat__v">
            ~$59.5M<span className="unit">/yr</span>
          </span>
          <span className="stat__sub">
            180k PTs · $89M baseline → $30M optimized. Just from not transcribing silence.
          </span>
        </div>
      </div>

      <p className="note">
        But that's the <em>cloud-only</em> picture. In PTScribe, Nova isn't the default path at all,
        local Whisper produces the transcript for free, and Nova is the capped, opt-in "Improve with
        AI" pass. These optimizations apply to the <strong>fraction</strong> of audio you choose to
        send to the cloud, on top of a default that's already $0. The numbers above are what a
        Nova-for-everything service would pay; PTScribe's actual cloud bill is a sliver of even the
        optimized figure.
      </p>

      <SectionHead tag="three paths" title="…and only one of them costs anything" />

      <div className="tradeoffs">
        <div className="tradeoff is-picked">
          <div className="tradeoff__left">
            <span className="tradeoff__verdict is-picked">✓ Canonical · the default</span>
            <span className="tradeoff__name">Local Whisper, in the browser</span>
          </div>
          <div className="tradeoff__right">
            <div className="tradeoff__col">
              <div className="tradeoff__col-h is-pro">Why I picked it</div>
              <p>
                Runs entirely on-device in a Web Worker. The model downloads once, caches, and after
                that <strong>no audio ever leaves the machine</strong>. The thing I'm proudest of in
                this build.
              </p>
            </div>
            <div className="tradeoff__col">
              <div className="tradeoff__col-h is-con">The catch</div>
              <p>
                First transcription on a fresh browser pays a one-time model download. After that,
                it's free and offline, but the wait is real, so I design loading states around it.
              </p>
            </div>
          </div>
        </div>

        <div className="tradeoff">
          <div className="tradeoff__left">
            <span className="tradeoff__verdict">~ Safety net · during recording</span>
            <span className="tradeoff__name">Live captions while you record</span>
          </div>
          <div className="tradeoff__right">
            <div className="tradeoff__col">
              <div className="tradeoff__col-h is-pro">Why it's here</div>
              <p>
                A running transcript captured <em>during</em> the visit, opt-in and zero-network on
                browsers that support Web Speech. Lower-powered devices and older browsers can still
                capture a session.
              </p>
            </div>
            <div className="tradeoff__col">
              <div className="tradeoff__col-h is-con">The catch</div>
              <p>
                It's best-effort, not canonical. Quality and availability vary by browser. The
                streaming cloud pass costs money. I treat this as a fallback, not the source of
                truth.
              </p>
            </div>
          </div>
        </div>

        <div className="tradeoff">
          <div className="tradeoff__left">
            <span className="tradeoff__verdict is-caveat">$ Opt-in · best quality</span>
            <span className="tradeoff__name">Nova-3 "Improve with AI"</span>
          </div>
          <div className="tradeoff__right">
            <div className="tradeoff__col">
              <div className="tradeoff__col-h is-pro">When it wins</div>
              <p>
                Speaker diarization (clinician vs. patient) and the cleanest dictation when accuracy
                matters more than privacy by default. Always an explicit click, never automatic.
              </p>
            </div>
            <div className="tradeoff__col">
              <div className="tradeoff__col-h is-con">The catch</div>
              <p>
                It's the only one that actually costs me money.{' '}
                <strong>Please be gentle on my hosting bill</strong>, or just hire me so I can keep
                providing this for free.
              </p>
            </div>
          </div>
        </div>
      </div>

      <SectionHead
        tag="pipeline"
        title="The five passes that run before any audio leaves the machine"
      />

      <ol className="steps">
        <li>
          <b>Capture.</b> Web Audio records to memory. A VAD-gated streaming pass appends a live
          preview so there's a transcript building <em>during</em> the visit.
        </li>
        <li>
          <b>Silence-trim.</b> ML VAD identifies speech ranges. The non-speech regions are dropped
          before anything goes further. The original blob stays untouched.
        </li>
        <li>
          <b>1.5× pitch-corrected speed-up.</b> Phase-vocoder time-stretch keeps voices
          intelligible. ASR handles it cleanly, verified on real session audio.
        </li>
        <li>
          <b>Local Whisper (T2).</b> The canonical pass. A worker pool chunks audio at 2-min
          boundaries and transcribes in parallel.
        </li>
        <li>
          <b>Optional Nova-3 (T3).</b> An explicit click, capped 1× per session, lifetime. Receives
          the trimmed + sped-up audio, never the raw recording.
        </li>
      </ol>

      <Disclose
        tag="implementer detail"
        title="Specific models, libraries, and audio-engineering vocabulary"
      >
        <div className="specs">
          <div className="spec">
            <div className="spec__k">canonical local model</div>
            <div className="spec__v">
              <code>Xenova/whisper-tiny.en</code>
            </div>
            <div className="spec__note">
              Runs in a Web Worker via <code>@huggingface/transformers</code>. Model files served
              from R2 at <code>/api/model/*</code>, cached in IDB after first download.
            </div>
          </div>
          <div className="spec">
            <div className="spec__k">cloud model</div>
            <div className="spec__v">
              <code>@cf/deepgram/nova-3</code>
            </div>
            <div className="spec__note">
              Cloudflare Workers AI, diarized. Reached via <code>POST /api/transcribe</code>. Capped
              at one Nova call per session, lifetime.
            </div>
          </div>
          <div className="spec">
            <div className="spec__k">live preview</div>
            <div className="spec__v">
              <code>Web Speech API</code>
            </div>
            <div className="spec__note">
              Browser-native, zero-network where available. Falls back to streaming cloud Whisper on
              browsers without it.
            </div>
          </div>
          <div className="spec">
            <div className="spec__k">time-stretch</div>
            <div className="spec__v">
              <code>Phase vocoder, 1.5×</code>
            </div>
            <div className="spec__note">
              Pitch-preserving. Applied to the silence-trimmed audio before the optional Nova
              upload.
            </div>
          </div>
        </div>
      </Disclose>

      <div className="takeaway">
        <span className="takeaway__icon" aria-hidden="true">
          ✓
        </span>
        <div>
          <div className="takeaway__h">Default path is free, private, and offline</div>
          <div className="takeaway__body">
            You don't need to pay or trust the cloud to use PTScribe; local Whisper is the default.
            Nova is there <em>when you want it</em>, and even then you're sending a third of the
            audio you recorded. <strong>Local is the only path that stays at $0.</strong>
          </div>
        </div>
      </div>

      <Pager
        prev={{ id: 'ch-security', label: 'Secure, local-first' }}
        next={{ id: 'ch-notes', label: 'Notes & the AI bound' }}
      />
    </section>
  );
}

export function NotesChapter() {
  return (
    <section id="ch-notes" className="ch hiw__page" data-page="ch-notes">
      <ChapterHeader
        num="03"
        eyebrow="Notes & PII · 2 min read"
        eyebrowVariant="note"
        title="The AI only ever sees what you approved. And I'll be honest about what that means."
        lede={
          <>
            I haven't found the best solution for processing notes locally{' '}
            <em>for the average clinical user</em>. The CPU-bound models small enough to run in a
            browser just aren't big enough for the job, especially when you throw a long transcript
            at them. So this led me to the{' '}
            <strong>first "non-local feature" in the critical path</strong>. Ugh… I know. I hear
            your boos over the inter-webs.
          </>
        }
      />

      <p className="note">
        Let's be honest about what "only the transcript" means: <em>everything</em> in that
        transcript goes with it, including any patient name or identifier that was spoken aloud
        during the visit and never edited out. So this leaves one more bit of friction on you, the
        clinician, to protect patient privacy, manually scrubbing PII before you hit generate.
      </p>

      <SectionHead tag="the model I'd love to ship" title="…and the model I actually ship today" />

      <div className="tradeoffs">
        <div className="tradeoff">
          <div className="tradeoff__left">
            <span className="tradeoff__verdict is-passed">⤬ Passed on (for now)</span>
            <span className="tradeoff__name">openai/privacy-filter</span>
          </div>
          <div className="tradeoff__right">
            <div className="tradeoff__col">
              <div className="tradeoff__col-h is-pro">Why it's tempting</div>
              <p>
                Catches PII with real contextual understanding. Run it with WebGPU on a machine with
                a discrete GPU and it's <em>excellent</em>.
              </p>
            </div>
            <div className="tradeoff__col">
              <div className="tradeoff__col-h is-con">Why I passed</div>
              <p>
                I can't expect every clinician to have a 3090 with 24 GB of VRAM sitting under their
                desk. <em>(cue tears)</em>
              </p>
            </div>
          </div>
        </div>

        <div className="tradeoff is-picked">
          <div className="tradeoff__left">
            <span className="tradeoff__verdict is-picked">✓ Picked · ships today</span>
            <span className="tradeoff__name">bert-base-NER + regex</span>
          </div>
          <div className="tradeoff__right">
            <div className="tradeoff__col">
              <div className="tradeoff__col-h is-pro">Why it ships</div>
              <p>
                Runs comfortably anywhere. NER catches contextual names; regex handles the
                high-confidence structured stuff (phone numbers, dates, IDs).{' '}
                <strong>Good enough to be genuinely useful, today.</strong>
              </p>
            </div>
            <div className="tradeoff__col">
              <div className="tradeoff__col-h is-con">The trade</div>
              <p>
                Not as smart as the big model on edge cases. Clear path to the larger model the day
                WebGPU + capable hardware are a safe assumption.
              </p>
            </div>
          </div>
        </div>
      </div>

      <SectionHead tag="what crosses the wire" title="Two fields go to Anthropic. Nothing else." />

      <div className="snippet" role="region" aria-label="Generation request bound">
        <div className="snippet__head">
          <span className="snippet__head-l">
            <span className="snippet__head-dot" /> src/api/generate.ts
          </span>
          <span>strictly bounded</span>
        </div>
        <pre>{`// Two things go on the wire. Three modifiers are appended server-side.
const body: GenerateRequest = {
  transcript: edited ?? activeTier,        // edited > T3 > T2 > T1
  modifiers:  template.modifiers,          // tone / emphasis / custom
};

// NEVER sent: MRN, ICD-10, prior notes, plan of care, prior sessions.
// The clinician's last responsibility is to scrub anything spoken aloud
// that doesn't belong in the cloud, assisted by the on-device NER + regex,
// with a diff modal review before any edit is applied.`}</pre>
      </div>

      <div
        className="flow"
        style={{ marginTop: 16 }}
        role="group"
        aria-label="Data flow: the curated transcript is PII-scrubbed on-device with a clinician-reviewed diff, and only the transcript plus formatting modifiers are sent over the network to Anthropic Sonnet. The chart (MRN, ICD-10, prior notes, plan of care) is never sent."
      >
        <div className="flow__strip" style={{ ['--cols' as string]: 5 } as CSSProperties}>
          <div className="node node--sage">
            <div className="node__top">
              <span className="node__tag">on-device</span>
              <span className="node__glyph" />
            </div>
            <div className="node__name">Curated transcript</div>
            <div className="node__desc">
              Whatever tier is active, your edits beat T3 beats T2 beats T1.
            </div>
          </div>
          <div className="flow__arrow">
            <span className="flow__arrow-lbl">PII scrub</span>
          </div>
          <div className="node node--sage">
            <div className="node__top">
              <span className="node__tag">on-device</span>
              <span className="node__glyph" />
            </div>
            <div className="node__name">bert-base-NER + regex</div>
            <div className="node__desc">
              Clinician-triggered. Review a diff before applying. <strong>Never silent.</strong>
            </div>
          </div>
          <div className="flow__arrow flow__arrow--rec">
            <span className="flow__arrow-lbl">explicit</span>
          </div>
          <div className="node node--rec">
            <div className="node__top">
              <span className="node__tag">network · awaited</span>
              <span className="node__glyph" />
            </div>
            <div className="node__name">Anthropic Sonnet 4.6</div>
            <div className="node__desc">
              Receives only the curated transcript + formatting modifiers. Returns the full
              structured note atomically.
            </div>
          </div>
        </div>

        <div className="flow__branch">
          <div className="flow__branch-stems">
            <span />
            <span />
          </div>
          <div className="flow__branch-row">
            <div className="node node--ghost">
              <div className="node__top">
                <span className="node__tag">never sent</span>
                <span className="node__glyph" />
              </div>
              <div className="node__name">
                MRN · ICD-10 · prior notes · plan of care · prior sessions
              </div>
              <div className="node__desc">
                The model doesn't see the chart. If you want prior context, you paste it in
                deliberately.
              </div>
            </div>
            <div className="node node--ghost">
              <div className="node__top">
                <span className="node__tag">honest caveat</span>
                <span className="node__glyph" />
              </div>
              <div className="node__name">What you spoke aloud, you sent</div>
              <div className="node__desc">
                A name said during a visit is in the transcript until <em>you</em> scrub it. PII
                scrubbing is on-device, but clinician-triggered.
              </div>
            </div>
          </div>
        </div>
      </div>

      <Disclose
        tag="implementer detail"
        title="Model sizes, runtime, and what the request builder enforces"
      >
        <div className="specs">
          <div className="spec">
            <div className="spec__k">PII scrub · today</div>
            <div className="spec__v">
              <code>bert-base-NER + regex</code>
            </div>
            <div className="spec__note">
              ~90 MB. WASM. Runs on a normal laptop. NER catches contextual names; regex handles
              phone numbers, dates, IDs.
            </div>
          </div>
          <div className="spec">
            <div className="spec__k">PII scrub · queued</div>
            <div className="spec__v">
              <code>openai/privacy-filter</code>
            </div>
            <div className="spec__note">
              ~875 MB. WebGPU. Excellent on capable hardware. Will ship the day WebGPU + 24 GB VRAM
              is a safe assumption.
            </div>
          </div>
          <div className="spec">
            <div className="spec__k">generation model</div>
            <div className="spec__v">
              <code>claude-sonnet-4-6</code>
            </div>
            <div className="spec__note">
              Reached via <code>POST /api/generate</code>. Provider credentials stay server-side.
              One-shot: returns the full note atomically.
            </div>
          </div>
          <div className="spec">
            <div className="spec__k">request bound</div>
            <div className="spec__v">
              <code>transcript + modifiers</code>
            </div>
            <div className="spec__note">
              Enforced in the request builder, not by trust. Chart context (MRN, ICD-10, prior
              notes, plan of care) is never assembled into the request body.
            </div>
          </div>
        </div>
      </Disclose>

      <div className="takeaway takeaway--caveat">
        <span className="takeaway__icon" aria-hidden="true">
          !
        </span>
        <div>
          <div className="takeaway__h">Note generation is the one trade I made on purpose</div>
          <div className="takeaway__body">
            The transcript and modifiers go to Anthropic. Nothing else does. On-device PII scrubbing
            closes most of the gap, and the bigger model is queued for the day the hardware is
            there. That tension,{' '}
            <em>what's ideal vs. what runs on the machine the clinician was actually issued</em>, is
            the throughline of the whole project.
          </div>
        </div>
      </div>

      <Pager
        prev={{ id: 'ch-voice', label: 'Voice & cost' }}
        next={{ id: 'ch-future', label: 'Down the road' }}
      />
    </section>
  );
}

export function FutureChapter() {
  return (
    <section id="ch-future" className="ch hiw__page" data-page="ch-future">
      <ChapterHeader
        num="04"
        eyebrow="Down the road · 90s read"
        eyebrowVariant="amber"
        title={
          "What if “local” didn't have to mean your laptop, just a machine inside the building?"
        }
        lede={
          <>
            Right now, "local-first" means <em>your laptop</em>. Great for privacy, but it's also
            why the heavy lifting (the big PII model, fully local note generation) keeps slamming
            into the "do you happen to own a 24 GB GPU?" wall. Most clinicians don't, and never
            will. So here's the idea I'm most excited about: a single capable box sitting in the
            back office of a PT practice: <strong>the clinic's brain</strong>.
          </>
        }
      />

      <SectionHead
        tag="sketch"
        title="Every device talks to a box on the LAN, never the public internet"
      />

      <div className="lan">
        <div className="lan__col">
          <div className="lan__device">
            <span className="lan__device-glyph" aria-hidden="true" />
            <span>
              <span className="lan__device-name">Front-desk laptop</span>
              <span className="lan__device-sub mono">cheap · dumb</span>
            </span>
          </div>
          <div className="lan__device">
            <span className="lan__device-glyph lan__device-glyph--tablet" aria-hidden="true" />
            <span>
              <span className="lan__device-name">Treatment-room tablet</span>
              <span className="lan__device-sub mono">cheap · dumb</span>
            </span>
          </div>
          <div className="lan__device">
            <span className="lan__device-glyph" aria-hidden="true" />
            <span>
              <span className="lan__device-name">Clinician laptop</span>
              <span className="lan__device-sub mono">cheap · dumb</span>
            </span>
          </div>
        </div>

        <div className="lan__wire" aria-hidden="true">
          <span className="lan__wire-lbl">LAN · never WAN</span>
        </div>

        <div className="lan__brain">
          <span className="lan__brain-tag">the back office</span>
          <span className="lan__brain-name">Clinic brain (one box)</span>
          <div className="lan__brain-stack">
            <div className="lan__brain-row">
              <span>PII scrub</span>
              <span>openai/privacy-filter · 875 MB</span>
            </div>
            <div className="lan__brain-row">
              <span>Transcribe</span>
              <span>whisper-large · diarized</span>
            </div>
            <div className="lan__brain-row">
              <span>Generate</span>
              <span>local Sonnet-class · on-prem</span>
            </div>
            <div className="lan__brain-row">
              <span>GPU</span>
              <span>24 GB · serves the whole clinic</span>
            </div>
          </div>
        </div>
      </div>

      <div className="roadmap">
        <div className="roadmap__eyebrow">
          Fog computing · the office becomes its own private cloud
        </div>
        <h3 className="roadmap__title">Suddenly the trade-offs flip in the user’s favor.</h3>
        <div className="roadmap__grid">
          <div className="roadmap__card">
            <span className="roadmap__card-h">↩ data residency</span>
            <span className="roadmap__card-v">Data never leaves the building</span>
            <span className="roadmap__card-sub">
              Audio, transcripts, notes, all of it stays within the four walls. An easier story to
              tell a compliance officer than "it's in a browser tab somewhere."
            </span>
          </div>
          <div className="roadmap__card">
            <span className="roadmap__card-h">⚙ hardware</span>
            <span className="roadmap__card-v">One GPU, whole clinic</span>
            <span className="roadmap__card-sub">
              One capable machine serves the whole clinic. The laptops stay cheap and dumb; the
              powerhouse in the back does the real work.
            </span>
          </div>
          <div className="roadmap__card">
            <span className="roadmap__card-h">$ cloud bill</span>
            <span className="roadmap__card-v">Goes to zero, for real</span>
            <span className="roadmap__card-sub">
              No Nova passes, no Anthropic in the critical path. The office owns its own compute, so
              the marginal cost per note is… electricity.
            </span>
          </div>
          <div className="roadmap__card">
            <span className="roadmap__card-h">⤴ scale</span>
            <span className="roadmap__card-v">Multi-office groups</span>
            <span className="roadmap__card-sub">
              A regional PT group could run one box per location, or a beefier one at HQ that
              satellite offices reach over a VPN.
            </span>
          </div>
        </div>
      </div>

      <div className="note">
        <p>
          There's real network engineering to work out, service discovery so a laptop can find the
          box, auth so only clinic-owned devices can reach it, and a graceful fallback for when the
          box is down or someone's charting from home. But the bones are already there: the app is
          just a static bundle talking to a proxy.{' '}
          <strong>
            Point that proxy at a box on the LAN instead of a Cloudflare Worker, and… well. Maybe
            that's the v2.
          </strong>{' '}
          Or maybe that's where someone reading this comes in. ;)
        </p>
        <span className="note__sig">github.com/kyle-giacchi/ptscribe</span>
      </div>

      <Pager
        prev={{ id: 'ch-notes', label: 'Notes & the AI bound' }}
        next={{ id: 'ch-intro', label: 'Why I built this' }}
      />
    </section>
  );
}

// ─── Style sheet (scoped under .hiw root to avoid leaking the cream palette) ─

export const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

.hiw-root {
  /* surfaces - app palette: white panel on light blue-gray */
  --bg:       #f4f6f9;
  --paper:    #ffffff;
  --paper-2:  #f4f6f9;
  --paper-3:  #edf0f4;
  --paper-4:  #e4e8ee;
  /* ink - app navy */
  --ink:      #1a2030;
  --ink-2:    #5a6577;
  --ink-3:    #8893a5;
  --ink-4:    #a4adbd;
  /* hairlines */
  --line:     rgba(26, 32, 48, 0.18);
  --line-2:   rgba(26, 32, 48, 0.10);
  --line-3:   rgba(26, 32, 48, 0.06);
  /* accents - sage tokens remapped to app teal */
  --sage:     #0ea5a8;
  --sage-deep:#0a6d70;
  --sage-soft:#cfe9ea;
  --sage-tint:#e6f7f6;
  /* "record" (network/alarm) - app red */
  --record:   #dc2942;
  --record-soft: #f3b6bf;
  --record-tint: #fde4e8;
  /* amber (caveat/future) - app amber */
  --amber:    #c47a09;
  --amber-soft:#f1d79b;
  --amber-tint:#fdf3df;
  --radius:   12px;
  --radius-sm: 8px;
  --shadow-soft: 0 1px 0 rgba(26,32,48,0.04), 0 6px 18px rgba(26,32,48,0.06);
  --shadow-modal: 0 30px 80px -20px rgba(26,32,48,0.35), 0 8px 24px rgba(26,32,48,0.10);
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--ink);
  font-size: 14.5px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.hiw-root * { box-sizing: border-box; }
.hiw-root .mono { font-family: "JetBrains Mono", ui-monospace, monospace; font-feature-settings: "ss01" 1; }
.hiw-root .eyebrow {
  display: inline-block; font-size: 11px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-3); font-weight: 500;
}
.hiw-root .btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-radius: 9px;
  font-size: 13.5px; font-weight: 500;
  border: 1px solid var(--line); background: var(--paper);
  color: var(--ink); cursor: pointer; font-family: inherit;
  text-decoration: none; transition: transform 0.06s ease, background 0.15s ease, border-color 0.15s ease;
}
.hiw-root .btn:hover { background: var(--paper-2); }
.hiw-root .btn:active { transform: translateY(1px); }
.hiw-root .btn--primary { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.hiw-root .btn--primary:hover { background: #0f1320; }

/* Keyboard focus - the scoped reset otherwise leaves only the UA default.
   A clinical-app portfolio piece should be obviously keyboard-navigable. */
.hiw-root a:focus-visible,
.hiw-root button:focus-visible,
.hiw-root summary:focus-visible,
.hiw-root [data-goto]:focus-visible {
  outline: 2px solid var(--sage-deep);
  outline-offset: 2px;
  border-radius: 6px;
}
.hiw-root .snippet a:focus-visible,
.hiw-root .node--ink a:focus-visible { outline-color: var(--sage-soft); }

/* ── Panel layout ─────────────────────────────────────────── */
.hiw-root.hiw__panel {
  width: min(1240px, calc(100vw - 48px));
  height: min(900px, calc(100vh - 48px));
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow-modal);
  display: grid;
  grid-template-columns: 248px 1fr;
  grid-template-rows: auto 1fr;
  overflow: hidden;
}
.hiw__head {
  grid-column: 1 / -1;
  padding: 22px 28px 18px 28px;
  border-bottom: 1px solid var(--line-2);
  background: var(--paper);
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
}
.hiw__head-l { display: flex; align-items: center; gap: 12px; }
.hiw__head-mark {
  width: 28px; height: 28px; border-radius: 8px;
  background: var(--ink); color: var(--paper);
  display: inline-flex; align-items: center; justify-content: center;
  font-family: "JetBrains Mono", monospace; font-size: 12px; font-weight: 600;
}
.hiw__head-name { font-weight: 600; font-size: 14px; }
.hiw__head-divider { width: 1px; height: 16px; background: var(--line); margin: 0 4px; }
.hiw__head-title { font-size: 13.5px; color: var(--ink-2); font-weight: 500; }
.hiw__head-r { display: flex; align-items: center; gap: 10px; }
.hiw__edit-link {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11.5px; font-family: "JetBrains Mono", monospace;
  color: var(--ink-3); text-decoration: none;
  padding: 5px 9px; border: 1px solid var(--line-2);
  border-radius: 6px; background: var(--paper-2);
}
.hiw__edit-link:hover { color: var(--ink); border-color: var(--line); }
.hiw__close {
  appearance: none; background: var(--paper-2);
  border: 1px solid var(--line); border-radius: 8px;
  width: 32px; height: 32px; cursor: pointer; color: var(--ink-2);
  display: inline-flex; align-items: center; justify-content: center;
}
.hiw__close:hover { background: var(--paper-3); color: var(--ink); }

/* ── Left rail / TOC ──────────────────────────────────────── */
.hiw__rail {
  border-right: 1px solid var(--line-2);
  background: var(--paper-2);
  padding: 28px 18px 24px 24px;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 6px;
}
.hiw__rail-eyebrow {
  font-size: 10.5px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-3);
  font-weight: 600; padding: 0 8px 8px;
}
.hiw__rail .toc { display: flex; flex-direction: column; gap: 2px; }
.hiw__rail .toc__item {
  display: grid; grid-template-columns: 28px 1fr;
  gap: 10px; align-items: baseline;
  padding: 9px 10px; border-radius: 7px;
  border: 1px solid transparent;
  text-decoration: none; color: var(--ink-2); position: relative;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
  cursor: pointer;
}
.hiw__rail .toc__item:hover { background: var(--paper-3); color: var(--ink); }
.hiw__rail .toc__num {
  font-family: "JetBrains Mono", monospace; font-size: 11px;
  color: var(--ink-3); letter-spacing: 0;
}
.hiw__rail .toc__name { font-size: 13px; font-weight: 500; letter-spacing: -0.005em; display: block; }
.hiw__rail .toc__desc { font-size: 11px; color: var(--ink-3); margin-top: 2px; line-height: 1.35; display: block; }
.hiw__rail .toc__item.is-active {
  background: var(--paper); color: var(--ink);
  border-color: var(--line); box-shadow: var(--shadow-soft);
}
.hiw__rail .toc__item.is-active .toc__num { color: var(--ink); }
.hiw__rail-foot {
  margin-top: auto; padding: 14px 10px 4px;
  border-top: 1px dashed var(--line-2);
}
.hiw__rail-foot-l {
  font-size: 11px; color: var(--ink-3);
  display: flex; flex-direction: column; gap: 6px;
}
.hiw__rail-foot-l a {
  color: var(--ink-2); text-decoration: none;
  font-family: "JetBrains Mono", monospace; font-size: 11px;
}
.hiw__rail-foot-l a:hover { color: var(--ink); }

/* ── Main scroll area ─────────────────────────────────────── */
.hiw__main {
  overflow-y: auto; padding: 8px 0 80px;
  background: var(--paper); scroll-behavior: smooth;
}
.hiw__main::-webkit-scrollbar { width: 10px; }
.hiw__main::-webkit-scrollbar-thumb {
  background: var(--paper-4); border-radius: 6px; border: 2px solid var(--paper);
}

/* ── Paging ───────────────────────────────────────────────── */
/* React mounts one chapter at a time, so we don't gate on .is-active. */
.hiw__page { display: block; animation: hiw-pageIn 0.24s ease both; }
@keyframes hiw-pageIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Intro block ──────────────────────────────────────────── */
.hiw__intro {
  padding: 32px 48px 16px;
  max-width: 820px;
}
.hiw__intro-eyebrow { color: var(--record); font-weight: 600; }
.hiw__intro-eyebrow.eyebrow--v3 { color: var(--sage-deep); }
.hiw__intro-h1 {
  font-size: 32px; line-height: 1.16;
  letter-spacing: -0.022em; font-weight: 600;
  margin: 10px 0 14px; text-wrap: balance;
}
.intro-h1--loud {
  font-size: 38px; line-height: 1.08;
  letter-spacing: -0.026em; font-weight: 600;
  margin: 8px 0 14px; text-wrap: balance; max-width: 22ch;
}
.intro-h1--loud .intro-h1__amt {
  background: linear-gradient(transparent 62%, var(--record-soft) 62% 92%, transparent 92%);
  padding: 0 2px;
}
.hiw__intro-sub {
  font-size: 15.5px; color: var(--ink-2);
  line-height: 1.55; margin: 0; text-wrap: pretty;
}
/* Stacked intro paragraphs - the gap is the spacing rhythm of the pitch. */
.hiw__intro-body {
  display: flex; flex-direction: column; gap: 14px;
}
.hiw__intro-punch {
  font-size: 16.5px; color: var(--ink); font-weight: 500;
}
.hiw__intro-qs {
  display: flex; flex-direction: column; gap: 10px;
  margin: 2px 0; padding-left: 16px;
  border-left: 2px solid var(--ch-accent, var(--ink-3));
}
.hiw__intro-q {
  font-size: 15.5px; color: var(--ink); line-height: 1.5;
  margin: 0; font-weight: 600; text-wrap: pretty;
}
.hiw__intro-explore {
  font-size: 14px; color: var(--ink-2); line-height: 1.75;
  margin: 4px 0 0; text-wrap: pretty;
}
.hiw__intro-explore em {
  font-style: normal; color: var(--ink); font-weight: 600;
}
.hiw__intro-explore-link {
  text-decoration: none;
  border-bottom: 1px solid color-mix(in srgb, var(--ink) 28%, transparent);
  transition: border-color 0.15s ease, color 0.15s ease;
}
.hiw__intro-explore-link em { color: var(--ink); }
.hiw__intro-explore-link:hover {
  border-bottom-color: var(--ink);
}
.hiw__intro-explore-link:hover em { color: var(--ink); }
.hiw__intro-explore-link:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
  border-radius: 2px;
}
.hiw__intro-explore-sep {
  color: var(--ink-3); margin: 0 1px; font-weight: 400;
}

/* ── Chapter ──────────────────────────────────────────────── */
.ch {
  padding: 28px 48px 8px;
  max-width: 980px;
  scroll-margin-top: 28px;
  --ch-accent: var(--ink);
}
/* Per-chapter dominant accent - structure stays identical across chapters,
   so hue (plus copy) is what gives each one its own identity. */
#ch-security { --ch-accent: var(--ink); }
#ch-voice    { --ch-accent: var(--sage-deep); }
#ch-notes    { --ch-accent: var(--record); }
#ch-future   { --ch-accent: var(--amber); }
.ch__head {
  display: grid; grid-template-columns: 72px 1fr;
  gap: 18px; align-items: start; margin-bottom: 18px;
}
.ch__num {
  font-family: "JetBrains Mono", monospace;
  font-size: 13px; color: var(--ink);
  font-weight: 600; letter-spacing: -0.02em;
  background: var(--paper-2);
  border: 1px solid color-mix(in oklab, var(--ch-accent) 50%, var(--line));
  border-radius: 10px; padding: 8px 0 10px;
  text-align: center; position: relative;
}
.ch__num span {
  display: block; font-size: 9.5px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-3);
  font-weight: 500; font-family: "Inter", ui-sans-serif, sans-serif; margin-bottom: 4px;
}
.ch__head-r { padding-top: 4px; }
.ch__eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 10.5px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-3); font-weight: 600;
}
.ch__eyebrow .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--sage-deep); display: inline-block; }
.ch__eyebrow.ch__eyebrow--sec .dot { background: var(--ink); }
.ch__eyebrow.ch__eyebrow--trans .dot { background: var(--sage-deep); }
.ch__eyebrow.ch__eyebrow--note .dot { background: var(--record); }
.ch__title {
  font-size: 24px; font-weight: 600;
  letter-spacing: -0.018em; line-height: 1.18;
  margin: 6px 0 8px; text-wrap: balance;
}
.ch__lede {
  font-size: 16px; line-height: 1.55;
  color: var(--ink-2); margin: 0;
  max-width: 64ch; text-wrap: pretty;
}
.ch__lede strong { color: var(--ink); font-weight: 600; }

.ch__sec-head {
  display: flex; align-items: baseline;
  gap: 12px; margin: 28px 0 12px;
}
.ch__sec-tag {
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px; color: var(--ink-3); letter-spacing: 0.06em;
}
.ch__sec-tag::before { content: "§ "; color: var(--ch-accent); opacity: 0.7; }
.ch__sec-title {
  font-size: 14.5px; font-weight: 600;
  letter-spacing: -0.005em; margin: 0; color: var(--ink);
}
.ch__sec-rule {
  flex: 1; height: 1px; background: var(--line-2);
  align-self: center; margin-left: 4px;
}

/* ── Flow / nodes ─────────────────────────────────────────── */
.flow {
  background: var(--paper-2);
  border: 1px solid var(--line-2);
  border-radius: 14px; padding: 28px 24px 22px;
  position: relative;
  background-image:
    linear-gradient(rgba(26,32,48,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(26,32,48,0.025) 1px, transparent 1px);
  background-size: 16px 16px; background-position: -1px -1px;
}
.flow__strip {
  display: grid; grid-template-columns: repeat(var(--cols, 5), 1fr);
  align-items: center; gap: 0;
}
.flow__strip > .node { margin: 0 6px; }
.node {
  background: var(--paper); border: 1px solid var(--line);
  border-radius: 10px; padding: 12px 14px; min-height: 96px;
  display: flex; flex-direction: column; gap: 4px; position: relative;
  box-shadow: 0 1px 0 rgba(26,32,48,0.04);
}
.node--ink { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.node--sage { background: var(--sage-tint); border-color: rgba(10,109,112,0.4); }
.node--rec  { background: var(--record-tint); border-color: rgba(220,41,66,0.45); }
.node--ghost { background: transparent; border-style: dashed; }
.node__top {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin-bottom: 2px;
}
.node__tag {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.06em;
  color: var(--ink-3); text-transform: uppercase;
}
.node--ink .node__tag { color: var(--ink-4); }
.node__glyph {
  width: 16px; height: 16px; border-radius: 4px;
  background: var(--paper-3); border: 1px solid var(--line);
  display: inline-block;
}
.node--ink .node__glyph { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.2); }
.node--sage .node__glyph { background: var(--sage); border-color: var(--sage-deep); }
.node--rec  .node__glyph { background: var(--record); border-color: var(--record); }
.node__glyph:has(svg) {
  width: 30px; height: 30px;
  background: transparent !important;
  border: none !important; border-radius: 0;
  color: var(--ink-2);
  display: inline-flex; align-items: center; justify-content: center;
}
.node--ink .node__glyph:has(svg) { color: var(--paper); }
.node--sage .node__glyph:has(svg) { color: var(--sage-deep); }
.node--rec .node__glyph:has(svg) { color: var(--record); }
.node__glyph svg { width: 100%; height: 100%; display: block; }
.node__name { font-size: 13.5px; font-weight: 600; letter-spacing: -0.005em; line-height: 1.2; }
.node__desc { font-size: 11.5px; color: var(--ink-3); line-height: 1.4; }
.node--ink .node__desc { color: var(--ink-4); }
.node__meta {
  margin-top: auto;
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px; color: var(--ink-3); padding-top: 6px;
}
.node--ink .node__meta { color: var(--ink-4); }
.node code {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px; background: var(--paper-3);
  padding: 0 4px; border-radius: 3px;
}
.node--ink code { background: rgba(255,255,255,0.1); color: var(--paper); }

.flow__arrow {
  align-self: center; display: flex;
  align-items: center; justify-content: center;
  height: 1px; position: relative; margin: 0 -1px; z-index: 0;
}
.flow__arrow::before {
  content: ""; display: block; height: 1px;
  background: var(--ink-3); width: 100%; opacity: 0.55;
}
.flow__arrow::after {
  content: ""; position: absolute; right: 6px;
  width: 0; height: 0;
  border-style: solid; border-width: 4px 0 4px 6px;
  border-color: transparent transparent transparent var(--ink-3); opacity: 0.75;
}
.flow__arrow--rec::before { background: var(--record); opacity: 0.7; }
.flow__arrow--rec::after  { border-left-color: var(--record); opacity: 0.85; }
.flow__arrow-lbl {
  position: absolute; top: 8px;
  font-family: "JetBrains Mono", monospace;
  font-size: 10px; color: var(--ink-3);
  background: var(--paper-2); padding: 1px 6px;
  border-radius: 4px; white-space: nowrap;
}

.flow__branch { position: relative; margin-top: 4px; padding-top: 26px; }
.flow__branch::before {
  content: ""; position: absolute;
  left: 12%; right: 12%; top: 12px; height: 1px;
  border-top: 1px dashed var(--ink-3); opacity: 0.45;
}
.flow__branch-stems {
  position: absolute; inset: 0 0 auto 0;
  height: 12px; display: grid; grid-template-columns: repeat(2, 1fr);
}
.flow__branch-stems span {
  width: 1px; background: var(--ink-3);
  opacity: 0.4; justify-self: center;
}
.flow__branch-row {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px; padding: 0 24px;
}

/* ── Specs / snippet ──────────────────────────────────────── */
.specs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px; margin: 4px 0 4px;
}
.spec {
  border: 1px solid var(--line-2); border-radius: 9px;
  padding: 10px 12px; background: var(--paper);
  display: flex; flex-direction: column; gap: 2px;
}
.spec__k {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-3);
}
.spec__v {
  font-size: 13px; font-weight: 500;
  color: var(--ink); letter-spacing: -0.005em;
}
.spec__v code {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px; background: var(--paper-3);
  padding: 0 4px; border-radius: 4px; color: var(--ink);
}
.spec__note { font-size: 11px; color: var(--ink-3); margin-top: 2px; }
.spec__note code {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px; background: var(--paper-3);
  padding: 0 4px; border-radius: 3px;
}
.snippet {
  background: var(--ink); color: #d8e0ee;
  border-radius: 12px;
  font-family: "JetBrains Mono", monospace;
  font-size: 12.5px; line-height: 1.55;
  padding: 14px 18px 16px; overflow-x: auto;
  position: relative; border: 1px solid var(--ink);
  box-shadow: var(--shadow-soft);
}
.snippet__head {
  display: flex; align-items: center; justify-content: space-between;
  margin: -4px -6px 8px; padding: 0 6px 8px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  font-size: 10.5px; letter-spacing: 0.06em; color: var(--ink-4);
}
.snippet__head-l { display: flex; align-items: center; gap: 8px; }
.snippet__head-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--sage); display: inline-block; }
.snippet pre { margin: 0; white-space: pre; font: inherit; color: inherit; }

/* ── Disclose ─────────────────────────────────────────────── */
.disclose {
  margin: 28px 0 4px;
  border: 1px solid var(--line-2);
  border-radius: 12px;
  background: var(--paper-2);
  overflow: hidden;
}
.disclose[open] { background: var(--paper); border-color: var(--line); }
.disclose__sum {
  list-style: none; cursor: pointer;
  display: flex; align-items: center; gap: 16px;
  padding: 12px 16px; user-select: none;
}
.disclose__sum::-webkit-details-marker { display: none; }
.disclose__sum:hover { background: var(--paper-3); }
.disclose[open] .disclose__sum {
  border-bottom: 1px dashed var(--line-2);
  background: transparent;
}
.disclose__sum .ch__sec-head {
  margin: 0; flex: 1; min-width: 0;
}
.disclose__sum .ch__sec-rule { display: none; }
.disclose__hint {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 10.5px; letter-spacing: 0.06em;
  color: var(--ink-3); white-space: nowrap;
  padding: 4px 8px; border: 1px solid var(--line);
  border-radius: 6px; background: var(--paper);
}
.disclose:hover .disclose__hint { color: var(--ink); border-color: var(--ink-3); }
.disclose__hint-close { display: none; }
.disclose[open] .disclose__hint-open { display: none; }
.disclose[open] .disclose__hint-close { display: inline; }
.disclose__chev {
  display: inline-block;
  font-family: "JetBrains Mono", monospace;
  font-size: 14px; line-height: 1; color: var(--ink-3);
  transition: transform 0.2s ease;
}
.disclose[open] .disclose__chev { transform: rotate(90deg); color: var(--ink); }
.disclose__body {
  padding: 16px 16px 18px;
  display: grid; gap: 14px;
}
.disclose__body .specs,
.disclose__body .steps,
.disclose__body .snippet { margin: 0; }

/* ── Takeaway ─────────────────────────────────────────────── */
.takeaway {
  display: grid; grid-template-columns: 28px 1fr;
  gap: 14px; background: var(--sage-tint);
  border: 1px solid rgba(10,109,112,0.32);
  border-radius: 12px; padding: 14px 18px 14px 14px;
  margin: 4px 0 0;
}
.takeaway__icon {
  width: 26px; height: 26px; border-radius: 7px;
  background: var(--sage-deep); color: var(--paper);
  display: inline-flex; align-items: center; justify-content: center;
  font-family: "JetBrains Mono", monospace;
  font-size: 13px; font-weight: 700; margin-top: 2px;
}
.takeaway__h {
  font-size: 12.5px; letter-spacing: 0.06em;
  text-transform: uppercase; font-weight: 600;
  color: var(--sage-deep); margin: 2px 0 4px;
}
.takeaway__body {
  font-size: 14px; color: var(--ink);
  line-height: 1.5; text-wrap: pretty;
}
.takeaway--caveat { background: var(--amber-tint); border-color: rgba(196,122,9,0.45); }
.takeaway--caveat .takeaway__icon { background: #7a4c04; }
.takeaway--caveat .takeaway__h { color: #7a4c04; }

/* ── Steps ────────────────────────────────────────────────── */
.steps {
  margin: 4px 0 0; padding: 0; list-style: none;
  display: grid; gap: 0;
  background: var(--paper-2); border: 1px solid var(--line-2);
  border-radius: 12px; overflow: hidden; counter-reset: step;
}
.steps li {
  display: grid; grid-template-columns: 72px 1fr;
  align-items: start; gap: 18px;
  padding: 14px 18px 16px; border-top: 1px solid var(--line-3);
  font-size: 13.5px; line-height: 1.55;
  color: var(--ink-2); position: relative;
}
.steps li:first-child { border-top: none; }
.steps li::before {
  content: "STEP " counter(step, decimal-leading-zero);
  counter-increment: step;
  font-family: "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.08em;
  color: var(--ink-3); padding-top: 3px; white-space: nowrap;
  border-right: 1px solid var(--line-3); padding-right: 18px;
  align-self: stretch;
}
.steps li b { color: var(--ink); font-weight: 600; margin-right: 4px; letter-spacing: -0.005em; }
.steps li code {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px; background: var(--paper-3);
  padding: 1px 5px; border-radius: 4px;
  color: var(--ink); border: 1px solid var(--line-3);
}

/* ── Pager ────────────────────────────────────────────────── */
.hiw__pager {
  display: flex; align-items: stretch;
  justify-content: space-between; gap: 12px;
  margin: 28px 0 8px; padding-top: 18px;
  border-top: 1px dashed var(--line-2);
}
.hiw__pager-link {
  display: inline-flex; flex-direction: column; gap: 2px;
  padding: 10px 14px; border: 1px solid var(--line);
  border-radius: 10px; background: var(--paper);
  text-decoration: none; color: var(--ink); min-width: 180px;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.hiw__pager-link:hover { background: var(--paper-2); border-color: var(--ink-3); }
.hiw__pager-prev { text-align: left; }
.hiw__pager-next { text-align: right; margin-left: auto; align-items: flex-end; }
.hiw__pager-dir { font-size: 10.5px; color: var(--ink-3); letter-spacing: 0.06em; }
.hiw__pager-label { font-size: 13px; font-weight: 600; letter-spacing: -0.005em; color: var(--ink); }
.hiw__pager-hint { align-self: center; font-size: 11px; color: var(--ink-3); }
.hiw__intro .hiw__pager { margin-top: 32px; }
.hiw__intro .hiw__pager-next { margin-left: auto; }
.ch__sec-head--inline {
  display: inline-flex; margin: 0; gap: 10px; align-items: baseline;
}

/* ── Intro: index list, bridge, goals ─────────────────────── */
.market-strip__h {
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--ink-3);
  font-weight: 600; margin: 26px 0 10px;
  display: flex; justify-content: space-between; align-items: baseline;
}
.market-facts__title {
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
  font-weight: 600; font-size: 28px;
  line-height: 1.15; letter-spacing: -0.01em;
  color: var(--ink);
  margin: 38px 0 14px; padding-top: 22px;
  border-top: 1px solid var(--line);
}
.market-facts__title-sub {
  font-family: inherit; font-weight: 400; font-style: italic;
  color: var(--ink-3); font-size: 0.78em; letter-spacing: 0; margin-left: 6px;
}
.market-facts {
  margin: 4px 0 0;
  border: 1px solid var(--line-2);
  border-radius: 14px; background: var(--paper-2); overflow: hidden;
}
.market-facts__head {
  display: grid; grid-template-columns: 190px 1fr 200px;
  gap: 18px; padding: 10px 20px;
  background: var(--paper-3);
  border-bottom: 1px solid var(--line-2);
  font-family: "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--ink-3); font-weight: 600;
}
.market-facts__head span:last-child { text-align: left; }
.market-facts__head .src {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.02em;
  text-transform: none; color: var(--ink-4); font-weight: 400;
}
.market-facts__row {
  display: grid; grid-template-columns: 190px 1fr 200px;
  align-items: center; gap: 18px; padding: 14px 20px;
  border-top: 1px solid var(--line-3); background: transparent;
}
.market-facts__row:first-child { border-top: none; }
.market-facts__k {
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-3);
  font-weight: 600; line-height: 1.3;
}
.market-facts__note {
  font-size: 12.5px; color: var(--ink-2);
  line-height: 1.5; text-wrap: pretty;
}
.market-facts__note strong { color: var(--ink); font-weight: 600; }
.market-facts__v {
  text-align: left; font-size: 26px;
  font-weight: 600; letter-spacing: -0.022em;
  color: var(--ink); line-height: 1;
  font-family: "Inter", ui-sans-serif, sans-serif; white-space: nowrap;
}
.market-facts__v .unit {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px; color: var(--ink-3);
  font-weight: 500; letter-spacing: 0; margin-left: 4px;
}
.market-facts__v .approx {
  color: var(--ink-3); font-weight: 500;
  margin-right: -2px; font-size: 20px; letter-spacing: -0.018em;
}
.market-facts__row.is-alarm {
  background: var(--record-tint);
  border-top-color: rgba(220,41,66,0.28);
}
.market-facts__row.is-alarm + .market-facts__row { border-top-color: rgba(220,41,66,0.28); }
.market-facts__row.is-alarm .market-facts__k,
.market-facts__row.is-alarm .market-facts__v { color: var(--record); }
.market-facts__row.is-alarm .market-facts__v .approx { color: rgba(220,41,66,0.75); }

/* ── Price compare ────────────────────────────────────────── */
.price-compare {
  display: grid; grid-template-columns: 1fr auto 1fr;
  align-items: stretch; gap: 0; margin: 22px 0 0;
  border: 1px solid var(--line-2); border-radius: 14px;
  background: var(--paper-2); overflow: hidden;
}
.price-card {
  border: none; border-radius: 0;
  padding: 20px 24px; background: transparent;
  display: flex; flex-direction: column; gap: 4px; position: relative;
}
.price-card--ours {
  background: transparent;
}
.price-card__kicker {
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--ink-3); font-weight: 600;
}
.price-card--ours .price-card__kicker { color: var(--sage-deep); }
.price-card__name {
  font-size: 13px; font-weight: 600;
  color: var(--ink); letter-spacing: -0.005em; margin-bottom: 4px;
}
.price-card__v {
  display: flex; align-items: baseline; gap: 6px;
  margin-top: 4px; font-size: 56px;
  font-weight: 600; letter-spacing: -0.03em;
  line-height: 1; color: var(--ink);
}
.price-card--ours .price-card__v { color: var(--sage-deep); }
.price-card--saas .price-card__v { color: var(--ink-3); }
.price-card--saas .price-card__v .unit { color: var(--ink-4); }
.price-card__v .approx {
  font-size: 30px; color: var(--ink-3);
  font-weight: 500; margin-right: -2px; letter-spacing: -0.018em;
}
.price-card--ours .price-card__v .approx { color: rgba(10,109,112,0.7); }
.price-card__v .unit {
  font-family: "JetBrains Mono", monospace;
  font-size: 13px; color: var(--ink-3);
  font-weight: 500; letter-spacing: 0;
  margin-left: 4px; margin-bottom: 6px;
}
.price-compare__vs {
  align-self: stretch; display: flex; align-items: center;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-3);
  padding: 0 16px; font-weight: 600;
  background: var(--paper-3);
  border-left: 1px solid var(--line-2);
  border-right: 1px solid var(--line-2);
}
.price-mult { display: flex; justify-content: center; margin: 14px 0 0; }
.price-mult__pill {
  display: inline-flex; align-items: baseline; gap: 8px;
  padding: 8px 16px 9px; background: var(--ink); color: var(--paper);
  border-radius: 999px;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px; letter-spacing: 0.06em;
}
.price-mult__big {
  font-family: "Inter", ui-sans-serif, sans-serif;
  font-size: 18px; font-weight: 600;
  letter-spacing: -0.014em; color: var(--paper);
}
.price-mult__lbl { color: var(--ink-4); }

/* ── Bridge + goals ───────────────────────────────────────── */
.intro-bridge-block {
  margin: 44px auto 22px;
  text-align: center; max-width: 720px; padding: 0 12px;
}
.intro-bridge-block__eyebrow {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--ink-3);
  font-weight: 600; margin-bottom: 14px;
}
.intro-bridge-block__eyebrow::before,
.intro-bridge-block__eyebrow::after {
  content: ""; width: 28px; height: 1px; background: var(--line-2);
}
.intro-bridge {
  margin: 0 auto; font-size: 30px;
  line-height: 1.22; color: var(--ink);
  font-weight: 600; letter-spacing: -0.022em;
  text-wrap: balance; max-width: 22ch; text-align: center;
}
.intro-bridge strong {
  font-weight: 600;
  background: linear-gradient(transparent 60%, var(--sage-tint) 60% 96%, transparent 96%);
  padding: 0 4px;
}
.goals {
  list-style: none; margin: 16px 0 0; padding: 0;
  border-top: 1px solid var(--line-2);
}
.goal { border-bottom: 1px solid var(--line-2); }
.goal__link {
  display: grid; grid-template-columns: auto 1fr auto;
  align-items: center; gap: 16px;
  padding: 15px 10px; text-decoration: none; color: inherit;
  cursor: pointer; transition: background 0.15s ease, padding-left 0.15s ease;
}
.goal__link:hover { background: var(--paper-2); padding-left: 14px; }
.goal__k {
  font-family: "JetBrains Mono", monospace;
  font-size: 13px; font-weight: 600; letter-spacing: 0.04em;
  color: var(--ink-4); transition: color 0.15s ease;
}
.goal__link:hover .goal__k { color: var(--sage-deep); }
.goal__body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.goal__h {
  font-size: 15px; font-weight: 600;
  line-height: 1.3; letter-spacing: -0.01em;
  color: var(--ink); text-wrap: pretty;
}
.goal__teaser {
  font-size: 12.5px; color: var(--ink-3);
  line-height: 1.4; text-wrap: pretty;
}
.goal__go {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--ink-4); white-space: nowrap;
  opacity: 0; transform: translateX(-4px);
  transition: opacity 0.15s ease, transform 0.15s ease, color 0.15s ease;
}
.goal__link:hover .goal__go { opacity: 1; transform: translateX(0); color: var(--sage-deep); }

/* ── Editorial index ──────────────────────────────────────── */
.hiw__index {
  list-style: none; margin: 28px 0 0; padding: 0;
  border-top: 1px solid var(--line);
}
.hiw__index > li { border-bottom: 1px solid var(--line); }
.hiw__idx {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(40px, 1fr) auto auto;
  align-items: center; gap: 18px;
  padding: 18px 12px;
  text-decoration: none; color: var(--ink);
  position: relative;
  transition: color 0.15s ease;
  cursor: pointer;
}
.hiw__idx::before {
  content: ""; position: absolute; inset: 0;
  background: var(--paper-2); opacity: 0;
  transition: opacity 0.15s ease; pointer-events: none; border-radius: 6px;
}
.hiw__idx:hover::before { opacity: 1; }
.hiw__idx > * { position: relative; }
.hiw__idx-num {
  font-size: 28px; font-weight: 500;
  letter-spacing: -0.01em; color: var(--ink-3);
  line-height: 1; min-width: 44px;
  transition: color 0.15s ease;
}
.hiw__idx:hover .hiw__idx-num { color: var(--ink); }
.hiw__idx-body {
  display: flex; flex-direction: column; gap: 6px; min-width: 0;
}
.hiw__idx-kicker { display: inline-flex; }
.hiw__idx-title {
  font-size: 17px; font-weight: 600;
  line-height: 1.3; letter-spacing: -0.012em;
  color: var(--ink); text-wrap: balance;
}
.hiw__idx-leader {
  align-self: end; height: 1px; margin-bottom: 8px;
  background-image: radial-gradient(circle, var(--ink-3) 0.8px, transparent 1.2px);
  background-size: 6px 2px; background-repeat: repeat-x;
  background-position: left bottom; opacity: 0.55;
}
.hiw__idx-meta {
  display: flex; flex-direction: column; align-items: flex-end;
  gap: 3px; font-size: 10.5px; color: var(--ink-3);
  letter-spacing: 0.04em; white-space: nowrap;
}
.hiw__idx-page { color: var(--ink-2); }
.hiw__idx-arrow {
  font-family: "JetBrains Mono", monospace;
  font-size: 14px; color: var(--ink-3);
  width: 18px; text-align: right;
  transform: translateX(-4px);
  transition: transform 0.18s ease, color 0.15s ease;
}
.hiw__idx:hover .hiw__idx-arrow { transform: translateX(0); color: var(--ink); }

/* ── Note marginalia ──────────────────────────────────────── */
.note {
  margin: 18px 0 8px;
  padding: 14px 18px 14px 22px;
  background: var(--paper-2);
  border: 1px solid var(--line-2);
  border-radius: 10px;
  font-style: italic; color: var(--ink-2);
  font-size: 14px; line-height: 1.6; text-wrap: pretty;
  position: relative;
}
.note::before {
  content: "“"; position: absolute;
  left: 6px; top: 4px;
  font-family: "JetBrains Mono", monospace;
  font-style: normal; font-size: 22px;
  color: var(--ink-3); opacity: 0.7;
  line-height: 1;
}
.note p { margin: 0; }
.note p + p { margin-top: 8px; }
.note__sig {
  display: block; margin-top: 8px;
  font-style: normal;
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px; letter-spacing: 0.04em; color: var(--ink-3);
}
.note__sig::before { content: "- "; opacity: 0.7; }
.note strong { font-weight: 600; font-style: normal; color: var(--ink); }
.note em { font-style: normal; }

/* ── Tradeoff ─────────────────────────────────────────────── */
.tradeoffs { display: grid; gap: 10px; margin: 4px 0 0; }
.tradeoff {
  display: grid; grid-template-columns: 200px 1fr; gap: 0;
  border: 1px solid var(--line-2); border-radius: 12px;
  background: var(--paper-2); overflow: hidden;
}
.tradeoff__left {
  background: var(--paper-3); padding: 14px 16px;
  border-right: 1px solid var(--line-2);
  display: flex; flex-direction: column; gap: 4px;
}
.tradeoff__verdict {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--ink-3); font-weight: 600;
}
.tradeoff__verdict.is-picked { color: var(--sage-deep); }
.tradeoff__verdict.is-passed { color: var(--ink-3); }
.tradeoff__verdict.is-caveat { color: #7a4c04; }
.tradeoff__name {
  font-size: 14px; font-weight: 600;
  letter-spacing: -0.005em; color: var(--ink); line-height: 1.25;
}
.tradeoff__size {
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px; color: var(--ink-3); margin-top: 2px;
}
.tradeoff__right {
  padding: 14px 18px; display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px; align-items: start; background: var(--paper);
}
.tradeoff__col-h {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-3);
  font-weight: 600; margin-bottom: 4px;
}
.tradeoff__col-h.is-pro::before { content: "+ "; color: var(--sage-deep); }
.tradeoff__col-h.is-con::before { content: "− "; color: var(--amber); }
.tradeoff__col p { margin: 0; font-size: 12.5px; color: var(--ink-2); line-height: 1.45; }
.tradeoff__col p + p { margin-top: 6px; }
.tradeoff.is-picked {
  border-color: rgba(10,109,112,0.45);
  box-shadow: 0 0 0 3px rgba(10,109,112,0.08);
}
.tradeoff.is-picked .tradeoff__left {
  background: var(--sage-tint);
  border-right-color: rgba(10,109,112,0.32);
}

/* ── Cost strip / table / stats ───────────────────────────── */
.cost-strip {
  margin: 4px 0 0; padding: 18px 20px 16px;
  background: var(--paper-2);
  border: 1px solid var(--line-2);
  border-radius: 12px;
}
.cost-strip__title {
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-3);
  font-weight: 600; margin-bottom: 12px;
  display: flex; justify-content: space-between; align-items: baseline;
}
.cost-strip__title-r { color: var(--ink-2); }
.cost-bar {
  display: grid; grid-template-columns: 220px 1fr 130px;
  align-items: center; gap: 14px;
  padding: 8px 0; border-top: 1px solid var(--line-3);
  font-size: 13px;
}
.cost-bar:first-of-type { border-top: none; }
.cost-bar__label { display: flex; flex-direction: column; gap: 2px; }
.cost-bar__label-h { font-weight: 600; font-size: 13px; color: var(--ink); }
.cost-bar__label-sub { font-size: 11px; color: var(--ink-3); }
.cost-bar__track {
  position: relative; height: 14px;
  background: repeating-linear-gradient(-45deg, var(--paper-3) 0 4px, var(--paper-2) 4px 8px);
  border-radius: 4px; border: 1px solid var(--line-3); overflow: hidden;
}
.cost-bar__fill { position: absolute; inset: 0 auto 0 0; background: var(--sage-deep); border-radius: 3px; }
/* Baseline split: speech (ink) vs. trimmed silence (neutral, not amber,
   dead air is neutral, not a warning; amber is reserved for caveat/future). */
.cost-bar__fill--split { background: linear-gradient(90deg, var(--ink) 0 50%, var(--ink-4) 50%); }
.cost-bar__value {
  text-align: right;
  font-family: "JetBrains Mono", monospace;
  font-size: 12px; color: var(--ink-2);
}
.cost-bar__value strong { color: var(--ink); font-weight: 600; }
.cost-bar__legend {
  display: flex; gap: 14px; margin-top: 12px;
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px; color: var(--ink-3);
}
.cost-bar__legend-item { display: inline-flex; align-items: center; gap: 6px; }
.cost-bar__legend-item::before {
  content: ""; width: 10px; height: 10px; border-radius: 2px; background: var(--ink);
}
.cost-bar__legend-item.is-speech::before { background: var(--ink); }
.cost-bar__legend-item.is-silence::before { background: var(--ink-4); }
.cost-bar__legend-item.is-trimmed::before { background: var(--sage-deep); }

.pct-down { color: var(--sage-deep); font-weight: 600; }

.stats {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 10px; margin: 4px 0 0;
}
.stat {
  background: var(--paper-2); border: 1px solid var(--line-2);
  border-radius: 12px; padding: 16px 18px;
  display: flex; flex-direction: column; gap: 4px;
}
.stat--emph { background: var(--sage-tint); border-color: rgba(10,109,112,0.35); }
.stat--alarm { background: var(--record-tint); border-color: rgba(220,41,66,0.35); }
.stat__k {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-3); font-weight: 600;
}
.stat--emph .stat__k { color: var(--sage-deep); }
.stat--alarm .stat__k { color: var(--record); }
.stat__v {
  font-size: 26px; font-weight: 600;
  letter-spacing: -0.018em; line-height: 1.1;
  color: var(--ink);
  font-family: "Inter", ui-sans-serif, sans-serif;
}
.stat__v .unit { font-size: 13px; color: var(--ink-3); font-weight: 500; margin-left: 4px; }
.stat__sub { font-size: 11.5px; color: var(--ink-3); line-height: 1.4; }

/* ── LAN / roadmap ────────────────────────────────────────── */
.lan {
  display: grid; grid-template-columns: 1fr 56px 1fr;
  gap: 14px; align-items: center;
  margin: 14px 0 0;
  padding: 22px 22px 18px;
  background: var(--paper); border: 1px solid var(--line-2);
  border-radius: 12px;
}
.lan__col { display: flex; flex-direction: column; gap: 8px; }
.lan__device {
  display: grid; grid-template-columns: 28px 1fr;
  align-items: center; gap: 10px;
  padding: 8px 10px;
  background: var(--paper-2); border: 1px solid var(--line-2);
  border-radius: 8px; font-size: 12px;
}
.lan__device-glyph {
  width: 22px; height: 14px;
  background: var(--ink); border-radius: 2px; position: relative;
}
.lan__device-glyph::after {
  content: ""; position: absolute;
  left: 50%; top: 100%;
  transform: translate(-50%, 2px);
  width: 10px; height: 1.5px; background: var(--ink);
}
.lan__device-glyph--tablet { width: 14px; height: 18px; }
.lan__device-glyph--tablet::after { display: none; }
.lan__device-name { display: block; color: var(--ink); font-weight: 500; }
.lan__device-sub { display: block; margin-top: 1px; color: var(--ink-3); font-size: 10.5px; font-family: "JetBrains Mono", monospace; }
.lan__wire {
  position: relative; height: 100%;
  display: flex; align-items: center; justify-content: center;
}
.lan__wire::before {
  content: ""; position: absolute; inset: 0;
  background-image: linear-gradient(90deg, var(--ink-3) 0 4px, transparent 4px 8px);
  background-size: 8px 1px; background-repeat: repeat-x;
  background-position: 0 50%; opacity: 0.5;
}
.lan__wire-lbl {
  position: relative; background: var(--paper);
  padding: 2px 8px;
  font-family: "JetBrains Mono", monospace;
  font-size: 10px; color: var(--ink-3);
  border: 1px solid var(--line-2);
  border-radius: 4px; white-space: nowrap;
}
.lan__brain {
  background: var(--ink); color: var(--paper);
  border-radius: 12px; padding: 14px 14px 12px;
  display: flex; flex-direction: column; gap: 6px; position: relative;
}
.lan__brain-tag {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-4);
}
.lan__brain-name { font-size: 14px; font-weight: 600; letter-spacing: -0.005em; }
.lan__brain-stack { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.lan__brain-row {
  display: flex; justify-content: space-between;
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px; color: var(--ink-4);
  border-top: 1px solid rgba(255,255,255,0.08); padding-top: 4px;
}
.lan__brain-row span:last-child { color: var(--sage-soft); }

.roadmap {
  margin: 4px 0 0;
  border: 1px dashed rgba(26,32,48,0.28);
  border-radius: 14px;
  background:
    repeating-linear-gradient(45deg, rgba(26,32,48,0.018) 0 8px, transparent 8px 16px),
    var(--paper-2);
  padding: 22px 24px 18px;
}
.roadmap__eyebrow {
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-3);
  font-weight: 600; margin-bottom: 8px;
  display: flex; align-items: center; gap: 8px;
}
.roadmap__eyebrow::before {
  content: ""; width: 6px; height: 6px;
  border-radius: 50%; background: var(--amber); display: inline-block;
}
.roadmap__title {
  font-size: 18px; font-weight: 600;
  letter-spacing: -0.014em; margin: 0 0 14px; line-height: 1.25;
}
.roadmap__grid {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 10px; margin-top: 6px;
}
.roadmap__card {
  background: var(--paper); border: 1px solid var(--line-2);
  border-radius: 10px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 4px;
}
.roadmap__card-h {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-3); font-weight: 600;
}
.roadmap__card-v {
  font-size: 13px; font-weight: 600;
  letter-spacing: -0.005em; line-height: 1.3; color: var(--ink);
}
.roadmap__card-sub {
  font-size: 11.5px; color: var(--ink-3);
  line-height: 1.4; margin-top: 2px;
}

/* ── Responsive ───────────────────────────────────────────── */
@media (max-width: 980px) {
  .hiw-root.hiw__panel {
    grid-template-columns: 1fr;
    width: calc(100vw - 24px);
    height: calc(100vh - 24px);
    border-radius: 12px;
  }
  .hiw__rail { display: none; }
  .ch, .hiw__intro { padding-left: 22px; padding-right: 22px; }
  .flow__strip { grid-template-columns: repeat(var(--cols, 5), minmax(140px, 1fr)); overflow-x: auto; }
  .flow__branch-row { padding: 0; }
  .tradeoff { grid-template-columns: 1fr; }
  .tradeoff__left { border-right: none; border-bottom: 1px solid var(--line-2); }
  .tradeoff__right { grid-template-columns: 1fr; gap: 8px; }
  .cost-bar { grid-template-columns: 1fr; gap: 4px; }
  .cost-bar__value { text-align: left; }
  .stats { grid-template-columns: 1fr; }
  .roadmap__grid { grid-template-columns: 1fr 1fr; }
  .lan { grid-template-columns: 1fr; }
  .lan__wire { height: 28px; }
}
@media (max-width: 720px) {
  .hiw__pager { flex-direction: column; }
  .hiw__pager-next, .hiw__pager-prev { margin-left: 0; align-items: flex-start; text-align: left; width: 100%; }
  .price-compare { grid-template-columns: 1fr; }
  .price-compare__vs {
    justify-content: center; padding: 8px 0;
    border-left: none; border-right: none;
    border-top: 1px solid var(--line-2);
    border-bottom: 1px solid var(--line-2);
  }
  .price-card__v { font-size: 44px; }
  .market-facts__row, .market-facts__head { grid-template-columns: 1fr; gap: 4px; }
  .market-facts__v { text-align: left; }
  .goal__go { opacity: 1; transform: none; }
  .goal__link:hover { padding-left: 10px; }
  .intro-bridge { font-size: 24px; }
  .intro-h1--loud { font-size: 30px; }
  .hiw__idx { grid-template-columns: auto 1fr auto; gap: 14px; padding: 16px 4px; }
  .hiw__idx-leader, .hiw__idx-meta { display: none; }
  .hiw__idx-num { font-size: 22px; min-width: 32px; }
  .hiw__idx-title { font-size: 15px; }
}
`;

// ─── Main component ──────────────────────────────────────────────────────────

export function HowItWorksModal({ open, onClose }: Props) {
  const [active, setActive] = useState<ChapterId>('ch-intro');
  const scrollRef = useRef<HTMLElement>(null);

  // Inject scoped stylesheet once.
  useEffect(() => {
    if (document.getElementById('hiw-modal-styles')) return;
    const s = document.createElement('style');
    s.id = 'hiw-modal-styles';
    s.textContent = STYLES;
    document.head.appendChild(s);
    return () => {
      document.getElementById('hiw-modal-styles')?.remove();
    };
  }, []);

  // Lock body scroll.
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

  // Keyboard: ESC closes, ←/→ pages.
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
      if (idx === -1) return; // sub-pages (e.g. ch-market) step via the pager, not arrow keys
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

  // Delegate clicks on [data-goto] anchors inside the modal to setActive.
  function handleMainClick(e: React.MouseEvent<HTMLElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-goto]');
    if (!el) return;
    const id = el.dataset.goto as ChapterId | undefined;
    if (!id || (id !== 'ch-market' && !CHAPTERS.some((c) => c.id === id))) return;
    e.preventDefault();
    setActive(id);
  }

  const currentTitle =
    active === 'ch-market'
      ? 'The market data'
      : (CHAPTERS.find((c) => c.id === active)?.name ?? '');

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
            className="hiw-root hiw__panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: 'relative' }}
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

            <aside className="hiw__rail" aria-label="Chapters">
              <div className="hiw__rail-eyebrow">Builder's journal</div>
              <nav className="toc">
                {CHAPTERS.map((c) => (
                  <a
                    key={c.id}
                    href={`#${c.id}`}
                    className={`toc__item${active === c.id ? 'is-active' : ''}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setActive(c.id);
                    }}
                  >
                    <span className="toc__num">{c.num}</span>
                    <span>
                      <span className="toc__name">{c.name}</span>
                      <span className="toc__desc">{c.desc}</span>
                    </span>
                  </a>
                ))}
              </nav>

              <div className="hiw__rail-foot">
                <div className="hiw__rail-foot-l">
                  <span>Want the gory details?</span>
                  <a href={REPO} target="_blank" rel="noopener noreferrer">
                    ↗ The repo
                  </a>
                </div>
              </div>
            </aside>

            <main className="hiw__main" ref={scrollRef} onClick={handleMainClick}>
              {active === 'ch-intro' && <IntroChapter />}
              {active === 'ch-market' && <MarketChapter />}
              {active === 'ch-security' && <SecurityChapter />}
              {active === 'ch-voice' && <VoiceChapter />}
              {active === 'ch-notes' && <NotesChapter />}
              {active === 'ch-future' && <FutureChapter />}
            </main>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
