# Slice 16 Architect Plan — H6 Phase 0: Template Authoring Guide + Authoring Lint

Date: 2026-06-30

Source baseline: `39bf940 kernel-hardening: slice 15 render dedup` (local;
Slice 15 is code-done / static-green / live-smoked / uncommitted-on-origin).
User approved the packet by saying to continue; decisions S16-D1 through
S16-D7 are treated as the recommended `a` values, with two corrections
locked into the plan body.

This is the thinnest possible first H6 cut: docs + static lint, zero
runtime change. The TS-side `defineTemplate({ ... })` helper and the
full-stack scaffolder CLI are deferred to Slice 17 / Slice 18.

## Goal

Sediment the "how do I add an OpenReaper template" path from oral
tradition / scattered PROGRESS notes into one authoritative document plus
one or two static drift-prevention gates. So that:

1. The OpenReaper kernel is a stable surface for adding new templates —
   each addition is more mechanical, less duplication-prone, less likely to
   silently miss verify / expectedDelta / docs / tests.
2. Future authors (the user, future Claude/Codex sessions, external
   contributors) get a single readable entry point describing how to
   extend OpenReaper's capability surface (including for MIDI / routing /
   FX / automation packs once the kernel hardening admits them).

Concrete landings:

- `docs/TEMPLATE_AUTHORING.md` — new how-to guide (D1=a).
- `scripts/template-authoring-lint.mjs` + `npm run check:template-authoring`
  — new independent static lint script (D3=a). It enforces two author
  contracts that today only get caught at reviewer time:
  - **examples-against-Zod**: every `definition.examples[i].params` must
    `parse` against that template's TS Zod schema (S16-C2: positive-only
    examples — no `@example-invalid` marker, see Locked Corrections).
  - **slug parity**: `<name>.ts` in
    `packages/mcp-server/src/templates/` must equal
    `definition.name.replace(/_/g, "-")` (both directions: every
    registered template must have a file, every non-helper file must have
    a registered template).
- The new npm script must build first (S16-C1: dist-based CLI, see
  Locked Corrections), matching `check:manifest` pattern.

## Non-Goals

Explicitly excluded — do not let scope drift in here:

- No scaffolder CLI (`scripts/scaffold-template.mjs`). Slice 17/18.
- No `defineTemplate({ ... })` TS helper. Slice 17.
- No new MCP tool (I1).
- No new error codes.
- No new template, new entity_kind, new field scope, new pack.
- No change to `reaper/streetlight_bridge.lua`, `verify.lua`,
  `manifest.lua`, `refs.lua`, `undo.lua`, or any Lua handler.
- No change to `expectedDelta` wire shape, locked envelope (I3), or
  wire-level JSON shapes.
- No change to the protocol contract in `docs/TEMPLATE_SPEC.md` (only a
  one-line pointer is added at the top so readers find the new author
  guide).
- No MIDI / routing / FX / automation work — those depend on the full H6
  ladder being in place.
- No refactor of `scripts/manifest-alignment.mjs` — Slice 16 ships an
  independent script (D3=a).
- No `@example-invalid` / skip marker in the lint. See S16-C2.

## Locked Decisions

- S16-D1=a: `docs/TEMPLATE_AUTHORING.md` is the how-to. `TEMPLATE_SPEC.md`
  remains the protocol contract. Two files, mutual cross-links, no
  duplication.
- S16-D2=a: lint coverage is exactly two checks — examples-against-Zod
  and filename-slug parity. No Lua handler-existence check in this slice.
- S16-D3=a: new independent script `scripts/template-authoring-lint.mjs`
  with its own `npm run check:template-authoring`. Does not extend
  `manifest-alignment.mjs`.
- S16-D4=a: the authoring guide includes a forward-looking "Future"
  section sketching how to extend to a new `entity_kind` or a new pack
  (e.g. `packs/midi/`), labelled as v0.1 non-binding guidance.
- S16-D5=a: no REAPER live smoke. Zero Lua, zero runtime, zero wire
  change. Reviewer + static gates are sufficient.
- S16-D6=a: one TS/docs-focused reviewer pass on (i) the authoring guide
  matches current code, (ii) the lint catches real failure modes not
  ceremony, (iii) lint failure messages are human-readable. No P1/P2
  severity tagging; P3 doc-accuracy is fine.
- S16-D7=a: local commit as a save point when green; no push during the
  user's work-hours no-push window.

## Locked Corrections (User-Specified)

- **S16-C1**: `check:template-authoring` must build first.
  Exact script value: `"npm run build --silent && node scripts/template-authoring-lint.mjs"`.
  Rationale: `node *.mjs` cannot directly import TS sources; the CLI must
  load the compiled dist outputs (`packages/core/dist/registry.js` and
  `packages/mcp-server/dist/templates/index.js`). Vitest tests may
  continue to import TS source helpers under `packages/*/src/` because
  vitest is the workspace's TS-aware harness.
- **S16-C2**: no `@example-invalid` / skip marker. `examples[]` is a
  positive-only contract: every example must be a parseable, agent-usable
  call. Negative / "this should be rejected" fixtures live exclusively in
  the lint's own tests under `scripts/__tests__/`. Author intent is now
  unambiguous: if `examples[]` carries it, an agent can run it.

## Runtime Semantics

There is no runtime delta. Specifically:

- `ping`, `get_state`, `call_template`, `list_templates`, `list_recipes`
  return byte-identical envelopes vs the Slice 15 baseline.
- `expectedDelta` wire and bridge verify behavior unchanged.
- `idempotency_key` (Slice 14/15) behavior unchanged.
- DEDUP behavior unchanged.
- Error codes unchanged. `errors.ts` and `error_codes.lua` not touched.
- No new MCP tool. The MCP tool surface stays exactly five (I1).
- No new entity_kind. `entity_buckets` unchanged.

## Files

Expected code changes:

- New: `docs/TEMPLATE_AUTHORING.md` — authoring how-to guide.
- New: `docs/plans/SLICE_16_ARCHITECT_PLAN.md` — this packet.
- New: `scripts/template-authoring-lint.mjs` — lint with exported helpers
  + CLI entry.
- New: `scripts/__tests__/template-authoring-lint.test.mjs` — positive
  whole-registry assertion plus reverse-fixture coverage of
  examples-against-Zod and slug parity.
- Modify: `package.json` — add `check:template-authoring` script per
  S16-C1.
- Modify: `docs/TEMPLATE_SPEC.md` — single-line pointer to
  `docs/TEMPLATE_AUTHORING.md`.
- Modify: `docs/plans/KERNEL_HARDENING_PLAN.md` — H6 section: 2026-06-30
  Slice 16 note.
- Modify: `docs/plans/KERNEL_HARDENING_EXECUTION.md` — H6 section:
  Slice 16 execution note (TS/docs-only, no restart).

Doc syncs at end-of-slice (not in scope of this packet, but called out
for completeness):

- `docs/HANDOFF.md` — Slice 16 entry with static-gate counts.
- `docs/PROGRESS.md` — Slice 16 log entry.
- `docs/NEXT_WINDOW_BRIEFING.md` — promote Slice 16 to "current".

Not touched:

- `packages/core/**` (lint only imports from `packages/core/dist/`).
- `packages/mcp-server/**` (lint only imports from
  `packages/mcp-server/dist/templates/`).
- `reaper/**` — zero Lua changes.

## Contract / Schema / Error-Code Changes

- No schema change.
- No error code added, removed, or renamed.
- No wire-shape change.
- No `CapabilityDefinition` field added or removed.
- Soft → hard contract promotion (author-level only, static gate):
  - `examples[].params` must parse on the template's own Zod schema.
  - TS file slug must equal `definition.name.replace(/_/g, "-")`.

## Verification Plan

### Static gates (all must be green before commit)

- `npm run build` — clean.
- `npm test` — full suite. Slice 15 baseline was 313/313. Slice 16 adds
  approximately 3–5 new unit tests under
  `scripts/__tests__/template-authoring-lint.test.mjs`. Target: 316+/316+
  green.
- `npm run check:manifest` — 11 templates aligned (unchanged).
- `npm run check:error-codes-fresh` — 22 codes fresh (unchanged).
- `npm run check:template-authoring` — 11 templates ok (new gate).
- `git diff --check` — clean.

### Lint test fixtures (kept in `scripts/__tests__/`)

- Positive: real registry → `[]`.
- Negative — example schema mismatch: synthetic def with
  `examples[0].params.semitones = 99` against an `item_pitch`-style Zod
  schema → emits `EXAMPLE_REJECTED_BY_SCHEMA:<name>:examples[0]: ...`
  with the Zod issue path and message.
- Negative — slug missing: registered template `foo_bar` with no
  `foo-bar.ts` file in fixture file list → emits
  `SLUG_MISSING_FILE:foo_bar: expected file foo-bar.ts`.
- Negative — slug orphan: file list contains `quux.ts` with no matching
  registered template → emits `SLUG_ORPHAN_FILE:quux.ts: ...`.
- Negative — strictness check: a Zod issue from a `.strict()` schema
  surfaces with the unknown key in the message (so authors can pinpoint
  the bad field).

### Reviewer pass

Per D6=a, run one TS/docs reviewer focused on:

- `docs/TEMPLATE_AUTHORING.md` accurately describes the current 11
  templates, the current error-code workflow (`ctx.errs.*` /
  `gen:error-codes` / `check:error-codes-fresh`), the current verify
  semantics (`expectedDelta` shapes incl. Slice 13 region bounds,
  `optional` / `nullable` rules), the current idempotency contract
  (Slice 14 + 15), and the current pitfalls catalog (Lua chunk reload
  protocol, `bridge_owner` guard, INTERNAL_ERROR contract). No fictional
  API.
- The lint catches the right things and the failure messages are
  pinpoint-actionable.
- No accidental tightening that would reject any of the 11 currently
  shipped templates.

## Live Smoke Plan

**Skip.** Per S16-D5=a:

- Zero Lua runtime change → no `bridge ready (generation N)` shift.
- Zero TS runtime change → identical wire shapes, identical envelopes,
  identical metadata over `list_templates`.
- The new lint runs at build / CI time, not in the bridge.
- The only way the new lint can surface anywhere is at `npm` invocation,
  not at agent invocation.

If a future reviewer pass insists on a baseline confidence check, the
agreed minimal smoke would be `ping` + `list_templates` after build, to
confirm metadata field set is byte-identical to Slice 15. That is
optional, not required.

## Rollback

If Slice 16 needs to be reverted, revert the single Slice 16 commit. The
authoring guide and lint are additive: deleting the new files and
removing the new `package.json` entry returns the repo to the Slice 15
baseline. No bridge or manifest state survives the revert — the lint
exists only at build time.

## Commit / Push Policy Reminder

- Per the user's 2026-06-29 work-hours no-push rule:
  - When all static gates and the reviewer pass are green, take a **local
    commit** as a save point with message:
    `kernel-hardening: slice 16 template authoring guide + lint`.
  - **Do not push** during the work-hours window. Slice 15 already has a
    local commit ahead of `origin/main`; Slice 16 will add a second local
    commit ahead. Both wait for an explicit user-approved push window.
- No `--no-verify`, no `--amend`, no `git reset --hard`, no `git push
  --force`, no `git branch -D`. None of those are authorized by this
  packet.
- Do not stage or touch the nested ignored `style-memory-mcp/`
  subproject.

## Why This Slice Is So Thin (Strategic Note)

H6 ("template factory") is the broadest hardening category in
`docs/plans/KERNEL_HARDENING_PLAN.md`. It splits naturally into four
sub-slices:

1. Slice 16 (this packet): single-source-of-truth author contract +
   static lint + author guide. Zero runtime change.
2. Slice 17 (candidate): TS-side `defineTemplate({ ... })` helper that
   collapses the per-template `CapabilityDefinition` shape into a single
   declarative call and lets the lint enforce more invariants
   declaratively.
3. Slice 18 (candidate): full-stack scaffolder CLI
   (`scripts/scaffold-template.mjs`) that emits TS template, Lua handler
   skeleton, vitest suite, and a manifest entry fragment from a single
   descriptor.
4. Slice 19 (later completed): use the scaffolder workflow to land
   `track_color` as an end-to-end proof, including REAPER live smoke.

Slice 16 is split out first because:

- The scaffolder's correctness criterion is "its output passes the
  authoring lint." We need the lint defined first.
- Writing the authoring guide forces clarity about exactly what is
  repetitive across the 11 current templates, which becomes the
  requirements doc for the Slice 17 helper.
- Failure cost is the lowest of the four: docs + lint are both
  reversible, both runtime-free, and contained in two new files plus
  small doc edits.

The future MIDI / routing / FX / automation / fx_inventory / render
analysis capability packs all depend on the full H6 ladder being in
place. This slice keeps the discipline of "kernel hardening before
breadth."
