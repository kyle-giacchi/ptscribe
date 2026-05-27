---
status: accepted
---

# Documentation taxonomy: glossary hub, sparing technical branches, isolated analysis

## Context

PTScribe's `docs/` tree had grown organically into a flat pile of overlapping files:
`architecture.md`, `architecture-primer.md`, `clinical-model.md`, `models.md`, `personas.md`,
`future-concerns.md`, `transcription.md`, `workflows.md`, plus an `INDEX.md` nav hub. Several
problems compounded:

- **Overlap and drift.** `architecture-primer.md` and `architecture.md` covered the same ground at
  different depths; `clinical-model.md` and `workflows.md` both described the session lifecycle;
  `models.md` duplicated catalog facts that also lived in the architecture doc. When code changed,
  the same fact had to be updated in several places — and usually wasn't (the restructure found
  stale 3-minute chunk sizes, fictional hook names, and a reference to a deleted `useTranscriptionFlow.ts`).
- **No home for point-in-time work.** One-off analyses (cost comparisons, narrative drafts for the
  architecture page) lived next to evergreen reference docs with no signal that they were snapshots,
  not maintained truth. A reader couldn't tell which docs to trust as current.
- **Punted risks rotted in prose.** `future-concerns.md` was a list of "we should eventually…"
  items, some of which had already shipped (rate limiting), with no lifecycle — nothing closed them
  or turned them into trackable work.
- **`CONTEXT.md` was being treated as a spec.** The intent (per `/grill-with-docs`) is for it to be
  a pure glossary, but core facts kept getting pulled into it.

## Decision

Adopt a four-rule taxonomy for everything under `docs/` and `CONTEXT.md`:

1. **`CONTEXT.md` is a pure glossary — nothing else.** It defines the shared vocabulary for the
   core workflow (Capture → Curate → Generate → Finalize) and the canonical names for
   clinician-facing concepts. No implementation detail, no spec content, no scratch notes. When a
   term is resolved, it is captured there inline.

2. **Branch into separate technical-reference docs sparingly.** The maintained reference set is kept
   deliberately small: `architecture.md` (provider tree, data flow, storage, AI services, model
   catalog, security), `invariants.md` (non-obvious cross-cutting rules — explicitly preserved),
   `transcription.md` (the transcription pipeline), `workflows.md` (domain model **and**
   end-to-end workflows, merged), and `style-guide.md`. A new branch doc must earn its existence;
   the default is to fold content into one of these.

3. **Point-in-time work is isolated in `docs/analysis/`, date-stamped.** Any one-off analysis,
   narrative draft, or cost study lives under `docs/analysis/<topic>-<YYYY-MM-DD>.md` and never in
   the maintained reference set. `docs/analysis/README.md` states the rule: these are snapshots,
   never updated to stay current, and evergreen facts never belong here.

4. **Punted risks become tracked issues, not prose.** Forward-looking "we should eventually" items
   go through the local issue tracker (`.scratch/<feature-slug>/` PRD + `issues/`), with a triage
   `Status:` line — not a standing markdown list. Already-shipped items are recorded as resolved,
   not re-filed.

`INDEX.md` is retired. With the reference set small and named by purpose, a nav-hub file is
redundant maintenance surface; `CLAUDE.md`'s Quick lookup table and Documentation section serve as
the entry point.

## Considered alternatives

- **Keep `INDEX.md` and a larger doc set.** Rejected — the index existed precisely because the doc
  set was too large to navigate by name. Shrinking the set removes the need for the index rather
  than perpetuating both.
- **Put core facts in `CONTEXT.md` (treat it as the single source of truth).** Rejected — this is
  the drift trap the `/grill-with-docs` model is designed to avoid. A glossary that also carries
  implementation detail becomes a second spec that silently diverges from code.
- **Tag analysis files inline (e.g. an "ARCHIVED" banner) but leave them in `docs/`.** Rejected —
  proximity to maintained docs still implies currency. Physical isolation in `docs/analysis/` is a
  clearer, harder-to-miss signal.

## Consequences

- Deleted: `architecture-primer.md`, `clinical-model.md` (merged into `workflows.md`), `models.md`
  (catalog folded into `architecture.md`), `personas.md` (folded into `PRODUCT.md`),
  `future-concerns.md` (migrated to `.scratch/hosted-worker-rollout/` issues), and `INDEX.md`.
- The maintained `docs/` reference set is now exactly: `architecture.md`, `invariants.md`,
  `style-guide.md`, `transcription.md`, `workflows.md`.
- ADRs (`docs/adr/`) and agent docs (`docs/agents/`) are unaffected — they already have clear,
  bounded purposes.
- New contributors must learn the placement rules (this ADR + `docs/analysis/README.md` + the
  `CLAUDE.md` Documentation section codify them). The cost is a one-time convention to internalize;
  the benefit is that "where does this go?" has a deterministic answer.
- Maintenance discipline shifts left: the temptation to drop a new `.md` into `docs/` must be
  resisted in favor of folding into an existing reference doc or filing analysis/issues.
