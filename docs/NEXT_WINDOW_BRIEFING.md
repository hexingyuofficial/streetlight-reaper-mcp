# Next Window Briefing — 2026-06-30

Use this as the first read after a context reset. It is the current truth during
Slice 16.

## Snapshot

- Repo: `/Users/Zhuanz/Documents/streetlight-reaper-mcp`
- Remote: `https://github.com/hexingyuofficial/OpenReaper.git`
- Branch: `main`; latest pushed commit is Slice 14:
  `56c57cb kernel-hardening: slice 14 idempotency tokens`
- Local commits ahead of origin: Slice 15 (`39bf940 kernel-hardening:
  slice 15 render dedup`) and Slice 16 (`0996b5b kernel-hardening:
  slice 16 template authoring guide + lint`). A reviewer follow-up docs
  fix is currently uncommitted on top.
- Public name: OpenReaper. Internal code paths and bridge names still use
  Streetlight.
- Do not commit, push, reset, branch, or rewrite history unless the user
  explicitly asks. User preference (2026-06-29): local commits are okay as
  explicit save points, but avoid pushing during work hours unless the user
  explicitly makes an exception.
- Do not stage or touch the nested ignored `style-memory-mcp/` project.

## Latest Verified Commit

Slice 14 is the most recent pushed commit (`56c57cb`).

Slice 15 is locally committed at `39bf940` (live-smoked, not pushed). It
extended H4 to deferred `render_region`.

Slice 16 is locally committed at `0996b5b` (static-green, not pushed). It
added the H6 Phase 0 authoring guide and lint.

## Current Slice

Slice 16 implements **H6 Phase 0 — Template Authoring Guide + Authoring Lint**.

What landed:

- `docs/TEMPLATE_AUTHORING.md` — the author how-to. Walks the
  pre-flight checklist, file map, step-by-step, pitfalls catalogue
  (stale Lua chunks, INTERNAL_ERROR contract, zero-mutation-on-error,
  `selected:N` snapshot semantics, `expectedDelta` enforcement,
  `render_region` as the deferred artifact-path template,
  idempotency-key authority), how `examples[]` are consumed, and a
  forward-looking
  "Extending to a new entity_kind / new pack" section.
- `docs/TEMPLATE_SPEC.md` gains a one-line pointer back to AUTHORING; the
  spec stays as the protocol contract.
- `scripts/template-authoring-lint.mjs` — exports pure helpers and a CLI.
  Enforces (1) `examples[i].params` must `parse()` on the template's
  own Zod schema and (2) the TS file slug under
  `packages/mcp-server/src/templates/` must equal
  `definition.name.replace(/_/g, "-")` in both directions.
- `scripts/__tests__/template-authoring-lint.test.mjs` — 13 vitest
  cases: helper-level, positive fixture, multiple reverse fixtures,
  slug missing / orphan / clean, lintDefinitions concatenation, and
  the real-registry positive assertion across all 11 shipped templates.
- `package.json` — new script `"check:template-authoring": "npm run
  build --silent && node scripts/template-authoring-lint.mjs"`. Mirrors
  `check:manifest`: dist-based CLI, vitest may import src/ helpers
  directly.
- `docs/plans/KERNEL_HARDENING_PLAN.md` H6 — added a 2026-06-30 Slice 16
  note.
- `docs/plans/KERNEL_HARDENING_EXECUTION.md` H6 — added a 2026-06-30
  Slice 16 execution note.

Locked corrections in this slice:

- **S16-C1**: `check:template-authoring` runs `npm run build --silent`
  first, then `node scripts/template-authoring-lint.mjs`. The CLI loads
  the compiled `packages/core/dist/registry.js` and
  `packages/mcp-server/dist/templates/index.js`; vitest tests may
  continue to import TS source helpers because vitest is the
  workspace's TS-aware harness.
- **S16-C2**: `examples[]` is positive-only. No `@example-invalid` /
  skip marker. Negative / "should be rejected" fixtures live
  exclusively under `scripts/__tests__/`.

What did NOT change:

- No Lua runtime files.
- No `streetlight_bridge.lua`, `verify.lua`, `manifest.lua`, `refs.lua`,
  `undo.lua`, or any handler.
- No `expectedDelta` shape, no error codes, no wire fields, no MCP tool
  surface (still exactly five), no new templates.
- No bridge restart required.

Static status:

- `npm test`: **326/326** green (Slice 15 baseline 313/313 + 13 new
  lint tests).
- `npm run build`: clean.
- `npm run check:manifest`: 11 templates aligned.
- `npm run check:error-codes-fresh`: 22 codes fresh.
- `npm run check:template-authoring`: 11 templates ok.
- `git diff --check`: clean.

Reviewer + live smoke:

- Reviewer Locke found no runtime blockers and confirmed C1/C2 plus the
  no-REAPER-smoke decision. It did catch docs-only accuracy issues:
  risk levels must match `packages/core/src/risk.ts`, `check:manifest`
  must not be overstated as handler-symbol / `entity_buckets` static
  proof, and new pack loading must be described as future runtime work.
  The current uncommitted follow-up fixes those statements.
- Per S16-D5=a, **no REAPER live smoke**. Zero runtime delta means
  nothing the bridge can see has changed; static gates plus a
  TS/docs reviewer are sufficient.

## Workflow To Continue

1. Read:
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/HANDOFF.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/PROGRESS.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/SLICE_16_ARCHITECT_PLAN.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/TEMPLATE_AUTHORING.md`
2. Slice 16 already has a local save-point commit. The current
   uncommitted follow-up is docs-only and should be committed locally
   after static gates pass. Do not push during the work-hours no-push
   window unless the user explicitly makes an exception.
3. If the user asks for the next hardening step (H6 Phase 1 = Slice 17
   candidate, TS-side `defineTemplate({ ... })` helper; Phase 2 =
   Slice 18 candidate, scaffolder CLI), wait for or request the next
   Architect packet before coding.
4. Commit only after the user explicitly asks. Push only if the user
   explicitly asks and it is not inside their work-hours no-push window,
   unless they make a clear exception.

Keep the invariant sharp: each slice must make the kernel more reliable,
more testable, or harder to misuse, with a concrete local test (and a
live REAPER smoke when runtime is affected).
