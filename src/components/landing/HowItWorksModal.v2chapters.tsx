import { type CSSProperties } from 'react';
import {
  ChapterHeader,
  SectionHead,
  Disclose,
  Pager,
  VaultIcon,
  StorageIcon,
  CloudIcon,
} from './HowItWorksModal';

// ─── v2 slim chapters ─────────────────────────────────────────────────────────
// Trimmed variants of the four post-intro chapters, used only by
// HowItWorksModalV2. They reuse the v1 primitives + component CSS but cut the
// narrative connective tissue so each chapter reads as a scannable artifact set
// rather than an essay. Decisions (per the v2 slim-down spec):
//   • Ledes compressed to one line, voice retained.
//   • `note` blocks dropped — except Future, where one slimmed note survives as
//     the modal's closing CTA.
//   • Takeaways, SectionHeads, and Disclose kept.
//   • Read-time eyebrows ("· 90s read") dropped.
//   • Per-chapter artifact thinning (ghost branches, redundant lists, prose
//     inside cards) as noted inline.
// v1's chapters are untouched.

export function SecurityChapterV2() {
  return (
    <section id="ch-security" className="ch hiw__page" data-page="ch-security">
      <ChapterHeader
        num="01"
        eyebrow="Secure, local-first strategy"
        eyebrowVariant="sec"
        title="Your data stays on your device unless you explicitly send it."
        lede={
          <>
            Three layers make that true — and the strongest one is just{' '}
            <strong>the browser refusing to open the connection.</strong>
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
            <div className="node__desc">Unlocked once at open, via passphrase or passkey.</div>
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
            <div className="node__desc">Records + audio Blobs, every byte sealed at rest.</div>
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
              A proxy, nothing else. <strong>Never stores or logs clinical data.</strong>
            </div>
            <div className="node__meta">/api/transcribe · /api/generate</div>
          </div>
        </div>
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

export function VoiceChapterV2() {
  return (
    <section id="ch-voice" className="ch hiw__page" data-page="ch-voice">
      <ChapterHeader
        num="02"
        eyebrow="Voice processing options"
        eyebrowVariant="trans"
        title="More than anything, I wanted to find out what's possible on a moderately-powered phone or laptop."
        lede={
          <>
            Turns out there's a whole spectrum — and{' '}
            <strong>only one of the paths costs a cent.</strong>
          </>
        }
      />

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
                Runs on-device in a Web Worker. After a one-time download,{' '}
                <strong>no audio ever leaves the machine</strong>.
              </p>
            </div>
            <div className="tradeoff__col">
              <div className="tradeoff__col-h is-con">The catch</div>
              <p>
                That first model download is a real wait — so I design loading states around it.
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
                An opt-in transcript captured during the visit, zero-network where Web Speech
                exists.
              </p>
            </div>
            <div className="tradeoff__col">
              <div className="tradeoff__col-h is-con">The catch</div>
              <p>
                Best-effort, not canonical — quality varies by browser. A fallback, not the truth.
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
                Speaker diarization and the cleanest dictation — on an explicit click, never
                automatic.
              </p>
            </div>
            <div className="tradeoff__col">
              <div className="tradeoff__col-h is-con">The catch</div>
              <p>
                The only path that costs me money. <strong>Be gentle on the bill</strong> — or hire
                me. ;)
              </p>
            </div>
          </div>
        </div>
      </div>

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

export function NotesChapterV2() {
  return (
    <section id="ch-notes" className="ch hiw__page" data-page="ch-notes">
      <ChapterHeader
        num="03"
        eyebrow="Notes & PII"
        eyebrowVariant="note"
        title="The AI only ever sees what you approved. And I'll be honest about what that means."
        lede={
          <>
            Note generation isn't local yet, so{' '}
            <strong>this is the one place PTScribe reaches for the cloud.</strong> Boo, I know.
          </>
        }
      />

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
                Catches PII with real contextual understanding — <em>excellent</em> on a discrete
                GPU.
              </p>
            </div>
            <div className="tradeoff__col">
              <div className="tradeoff__col-h is-con">Why I passed</div>
              <p>
                I can't assume every clinician has a 3090 under the desk. <em>(cue tears)</em>
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
                Runs anywhere. NER catches names, regex catches phones/dates/IDs.{' '}
                <strong>Genuinely useful, today.</strong>
              </p>
            </div>
            <div className="tradeoff__col">
              <div className="tradeoff__col-h is-con">The trade</div>
              <p>
                Not as smart on edge cases — clear upgrade path once capable hardware is a safe bet.
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
              Whatever tier is active — your edits beat T3 beats T2 beats T1.
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
              Clinician-triggered, with a diff to review. <strong>Never silent.</strong>
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
              Receives only the curated transcript + modifiers. Returns the full note.
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

export function FutureChapterV2() {
  return (
    <section id="ch-future" className="ch hiw__page" data-page="ch-future">
      <ChapterHeader
        num="04"
        eyebrow="Down the road"
        eyebrowVariant="amber"
        title={
          "What if “local” didn't have to mean your laptop, just a machine inside the building?"
        }
        lede={
          <>
            Drop one capable box in the back office and the{' '}
            <strong>"do you happen to own a 24 GB GPU?" wall</strong> just… disappears.
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
              <span>openai/privacy-filter</span>
            </div>
            <div className="lan__brain-row">
              <span>Transcribe</span>
              <span>whisper-large · diarized</span>
            </div>
            <div className="lan__brain-row">
              <span>Generate</span>
              <span>local Sonnet-class</span>
            </div>
            <div className="lan__brain-row">
              <span>GPU</span>
              <span>24 GB · whole clinic</span>
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
              An easier story for a compliance officer than "it's in a browser tab somewhere."
            </span>
          </div>
          <div className="roadmap__card">
            <span className="roadmap__card-h">⚙ hardware</span>
            <span className="roadmap__card-v">One GPU, whole clinic</span>
            <span className="roadmap__card-sub">
              One capable machine does the real work; the laptops stay cheap and dumb.
            </span>
          </div>
          <div className="roadmap__card">
            <span className="roadmap__card-h">$ cloud bill</span>
            <span className="roadmap__card-v">Goes to zero, for real</span>
            <span className="roadmap__card-sub">
              No Nova, no Anthropic in the path. Marginal cost per note is electricity.
            </span>
          </div>
          <div className="roadmap__card">
            <span className="roadmap__card-h">⤴ scale</span>
            <span className="roadmap__card-v">Multi-office groups</span>
            <span className="roadmap__card-sub">
              One box per location, or a beefier one at HQ reached over a VPN.
            </span>
          </div>
        </div>
      </div>

      <div className="note">
        <p>
          The bones are already here: the app is just a static bundle talking to a proxy.{' '}
          <strong>
            Point that proxy at a box on the LAN instead of a Cloudflare Worker, and… well — maybe
            that's where someone reading this comes in. ;)
          </strong>
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
