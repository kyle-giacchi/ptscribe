# Architecture Page — Narrative Draft

> **Purpose:** This is the prose/story for a future "Architecture" page (reached from the
> landing-page "Architecture, explained" tile). It is a content draft only — not the page
> build. Numbers are pulled from [`docs/analysis/transcription-cost-savings.md`](analysis/transcription-cost-savings.md)
> and technical claims from [`docs/architecture-primer.md`](architecture-primer.md).
> Voice: first-person, candid, builder-telling-the-story.

---

## Hero — Why I built this

I honestly couldn't believe how expensive some of these clinical-note transcription
services are — the leading SaaS scribes run about **$1,800 a year per clinician**, roughly
**$150/month, per seat**.

From a personal-AI-cost perspective, a Claude Max subscription costs about the same — and arguably gives you a lot more.

Now, I get it — AI costs money. Running these models isn't free. But *$1,800-per-clinician-per-year*
money? Do we really need yet another payer (the clinician) and another provider (the SaaS
company) wedged into the healthcare stack?

So I built it for the clinicians who carry an active caseload: physical therapists. PT
practices tend to run on thinner margins than most other clinical specialties, which makes an
$1,800-a-year-per-seat subscription sting that much more.

> **[Pull-quote / stat block — derived from the cost report + comparison pricing]**
>
> There are roughly **180,000** actively practicing PTs in the US. If even **half** of them
> subscribed to a $1,800/yr scribe, that's:
>
> **90,000 PTs × $1,800/yr ≈ $162M/year** flowing out of clinicians' pockets and into
> subscription revenue.
>
> And here's the kicker: the *transcription* that justifies all of that is cheap. If you sent
> every minute of every visit to a top cloud model (Deepgram Nova-3, the way a cloud SaaS
> does), the raw compute for **all 180,000 PTs** would run the provider about **$89M/year** —
> barely half the **$162M** they collect in subscriptions. And PTScribe doesn't even pay that,
> because its default transcript runs locally for **$0** (more on that in §2). The gap between
> what the transcription actually costs and what the subscription charges is the markup.
>
> *(Basis: $1,800/yr = $150/mo SaaS list price from the comparison scorecard; 180,000
> practicing PTs and ~$0.006/min Nova-3 transcription from the cost analysis. The $89M is a
> cloud-only counterfactual — Nova on every minute — not PTScribe's spend, which is far lower
> because local Whisper carries the default load. The $162M is a straightforward revenue
> estimate, not a claim about any one vendor's margins.)*


So it begs the question… could I build a **secure, local-first** clinical-note transcription
app that holds its own? How far could I get unpacking the real hard parts —

- securing patient data so it genuinely never leaves the device,
- living within the compute limits of a company-issued laptop (no one's got a 24 GB GPU
  under their desk),
- and still delivering an experience close to what the leading SaaS platforms ship today?

But if you scrolled this far, you probably just want the demo.

→ **[ Try the demo ]**

Want me to keep yabbering on? Then let me walk you through my thought process and what I built behind the scenes.

→ **[ Learn more — Features & Technical Architecture ]**

---

## Section 1 — Secure, local-first strategy

The whole posture of the app is one sentence: **your data stays on your device unless you
explicitly send something to the AI.** Everything else is in service of that promise. Three
layers enforce it.

### Everything lives on your machine, encrypted

There is no server-side database. Patients, sessions, notes, and templates live in your
browser's `localStorage`; the audio lives in IndexedDB. Every byte is encrypted at rest with
**AES-GCM**, behind a vault key that's unlocked once when you open the app and held only in
memory.

Now, I mainly didn't deploy a database because this MVP was focused on clinical transcription. But look closer at the code and you'll see the scaffolding is already there to add login and database connections... heck, maybe even a way to deploy this across your whole company. Idk. Maybe go check it out ;).


### The only thing that crosses the network is a thin proxy

AI calls (cloud transcription, note generation) go through a single Cloudflare Worker that
acts as a **proxy and nothing else** — the Cloudflare servers never store or log clinical data. The provider
credentials are server-side secrets; the browser never sees them. The Worker also enforces
the boundary in depth: it rejects requests with no `Origin`, gates on a hashed key, rate-limits
per IP and globally, and only accepts a short allowlist of model IDs.

The browser's Content-Security-Policy is the real local-first fence: `connect-src` is
locked to `'self'` plus HuggingFace (for model downloads). A single compromised dependency
*cannot* phone home to an attacker's server, because the browser won't let it open the
connection.



---

## Section 2 — Voice processing options (and what they cost)

More than anything, I wanted to find out what's actually possible *on a moderately powered
phone or laptop* when it comes to turning speech into text. It turns out there's a whole
spectrum, and PTScribe uses several paths depending on the moment.

### The options I explored

- **Local Whisper, in the browser.** This is the one I'm proudest of. `whisper-tiny.en`
  runs entirely on-device via WebAssembly (transformers.js in a Web Worker). The model
  downloads once, caches, and after that transcription is fully local — no audio ever
  leaves the machine. This is the **canonical transcript**.
- **Live captions while you record.** A best-effort live preview, either via the browser's
  built-in **Web Speech API** (zero network, opt-in) or a streaming cloud Whisper pass.
  It's the safety net — a running transcript captured *during* the visit.

I mainly added this so lower-powered devices or incompatible browsers can still capture a session.

- **Nova-3 for the best quality.** When you want diarization (clinician vs. patient) and the
  cleanest possible dictation, there's an explicit "Improve with AI" pass through Deepgram
  Nova-3. It's the best result — but it's the one that actually costs me money (please be gentle on my hosting bill... or just hire me so I can keep providing this for free!).

### …but the cloud costs add up fast


I wanted to explore the worst-case scenario. What if EVERY user needed the highest-quality transcription?

Nova-3 bills by the minute (~$0.006/min), and at any real scale that compounds fast. So before
a single second of audio goes to the cloud, I leaned on two tricks from my past life in audio
engineering: **silence removal** and **pitch-corrected speed-up**. Both run on-device (Boom!
Another local win! Up high! ✋) and shrink the audio before it ever leaves the machine.

> **[Stat block — from the cost analysis]**
>
> A typical PT session is unusually *silent*: patients doing exercise sets, hands-on manual
> therapy, repositioning, resting between sets. Roughly **half** of a 32-minute recording is
> dead air.
>
> | Optimization | What it does | Reduction |
> |---|---|---|
> | **Silence removal** | Trims sustained silent regions before transcription | **−50%** |
> | **1.5× speed-up** | Pitch-preserving time-stretch on the already-trimmed audio | **−33%** |
> | **Both, compounded** | 32 min → 16 min → ~10.7 min sent to Nova | **−67%** |
>
> Per clinician sending *every* session to Nova, that's the difference between **~$495/yr** of
> transcription at baseline and **~$165/yr** with both features on. At full US adoption
> (180,000 PTs), it's the difference between **~$89M/yr** and **~$30M/yr** — about
> **$59.5M/year** saved, just from not transcribing silence and gently compressing the rest.
>
> But that's the *cloud-only* picture. In PTScribe, Nova isn't the default path at all —
> local Whisper produces the transcript for free, and Nova is the capped, opt-in "Improve
> with AI" pass. So these optimizations apply to the *fraction* of audio you choose to send
> to the cloud, on top of a default that's already $0. The numbers above are what a
> Nova-for-everything service would pay; PTScribe's actual cloud bill is a sliver of even the
> optimized figure.
>
> *(Note: an earlier draft said "10% speed-up" — the implemented/analyzed default is
> actually 1.5×, which is where the 33% comes from. ASR models handle 1.5× speech cleanly
> with no accuracy loss.)*



### The Notes AI only ever sees what you approved

Now I must admit, I haven't found the best solution for processing notes locally (*for the average clinical user*). Generating clinical notes is complex, and the CPU-bound models small enough to run in a browser just aren't big enough for the job — especially when you throw a long transcript at them.

So this led me to the first "non-local feature" in the critical path. Ugh... I know... I hear your boos over the inter-webs!

When you generate a note, only two things are sent to Anthropic's Sonnet 4.6 model: the curated transcript and the formatting **modifiers** you define. But let's be honest about what that means — *everything* in that transcript goes with it, including any patient name or identifier that was spoken aloud during the visit and never edited out. So this leaves one more bit of friction on you, the clinician, to protect patient privacy: manually scrubbing PII before you hit generate (more on that below).

There is an option to do some of this note processing locally, but it leans heavily on having a capable GPU in your machine — which will almost never be the reality for most clinicians. There are some ideas further down the roadmap that may appeal to the small-to-medium PT practices out there.




### Scrubbing PII on-device — and the limits of the laptop

I also wanted patient identifiers stripped from the transcript *before* anything reaches the
AI — and I wanted that to happen locally too. This is where the hardware reality bit.

The ambitious version uses a large transformer — `openai/privacy-filter`, a ~875 MB
quantized model — to catch PII with real contextual understanding. Run it with WebGPU on a
machine with a discrete GPU and it's excellent. But I can't expect every clinician to have a
3090 with 24 GB of VRAM sitting under their desk. *(cue tears)*

So for now I've scaled back to a much lighter pairing: **`bert-base-NER`** (~90 MB, runs
comfortably in WASM on a normal laptop) plus a set of **regex patterns** for the
high-confidence structured stuff (phone numbers, dates, IDs). It's not as smart as the big
model, but it runs anywhere, and combined with the regex layer it does the job well enough to
be genuinely useful — with a clear path to the bigger model the day WebGPU and capable
hardware are a safe assumption.

That tension — *what's ideal* vs. *what runs on the machine the clinician was actually
issued* — is the throughline of the whole project.



## Down the road. Future plans

We still have the challenge of making this application genuinely HIPAA-compliant. But honestly,
the part I'm most excited about is bigger than a checkbox.

Right now, "local-first" means *your laptop*. Great for privacy — but it's also why the heavy
lifting (the big PII model, fully local note generation) keeps slamming into the "do you happen
to own a 24 GB GPU?" wall. Most clinicians don't, and never will.

So here's the idea: what if "local" didn't have to mean *your* machine — just a machine *inside
the building*?

Picture a single capable box sitting in the back office of a PT practice — call it the clinic's
brain. It has the GPU. It runs the heavyweight models: the big `openai/privacy-filter` for PII
scrubbing, and eventually note generation itself, fully on-prem. Every front-desk laptop and
every tablet in a treatment room talks to *that* box over the practice's own LAN — never the
public internet. This is the "fog computing" bit: pushing the compute out of the distant cloud
and down to the edge, but stopping one layer short of *every* device. The office becomes its own
tiny private cloud.

Suddenly the trade-offs flip:

- **Data never leaves the building.** Audio, transcripts, notes — all of it stays within the
  four walls of the practice. That's a much easier story to tell a compliance officer than
  "it's in a browser tab somewhere."
- **No per-seat GPU required.** One capable machine serves the whole clinic. The laptops stay
  cheap and dumb; the powerhouse in the back does the real work.
- **The cloud bill goes to zero — for real this time.** No Nova passes, no Anthropic calls in
  the critical path. The office owns its own compute, so the marginal cost per note is...
  electricity.
- **It scales to multi-office groups.** A regional PT group could run one box per location, or
  a beefier one at HQ that satellite offices reach over a VPN.

There's real network engineering to work out — service discovery so a laptop can find the box,
auth so only clinic-owned devices can reach it, and a graceful fallback for when the box is down
or someone's charting from home. But the bones are already there: the app is just a static
bundle talking to a proxy. Point that proxy at a box on the LAN instead of a Cloudflare Worker,
and... well. Maybe that's the v2. Or maybe that's where someone reading this comes in. ;)




---

## Open threads / TODO for the page build

- Decide format: dedicated `/architecture` route vs. modal vs. inline landing section.
- Confirm the $1,000 vs $1,800/yr framing (draft says $1,000; comparison scorecard uses
  $1,800/yr = $150/mo). Pick one number and use it consistently.
- The $162M "extraction" figure is derived (90k PTs × $1,800) — confirm we're comfortable
  publishing it and that the basis line stays attached.
- Consider whether the PII / hardware-limits beat deserves its own section vs. living under §2.
