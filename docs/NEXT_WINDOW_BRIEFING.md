# Next Window Briefing — 2026-06-30

Use this as the first read after a context reset. It is the current truth after
Slice 17.

## Snapshot

- Repo: `/Users/Zhuanz/Documents/streetlight-reaper-mcp`
- Remote: `https://github.com/hexingyuofficial/OpenReaper.git`
- Branch: `main`; latest pushed commit is Slice 14:
  `56c57cb kernel-hardening: slice 14 idempotency tokens`
- Local commits ahead of origin:
  - Slice 15: `39bf940 kernel-hardening: slice 15 render dedup`
  - Slice 16: `0996b5b kernel-hardening: slice 16 template authoring
    guide + lint`
  - Slice 16 reviewer follow-up: `45e0193 docs: follow up slice 16
    authoring review`
  - Slice 17: local save point `kernel-hardening: slice 17 define
    template helper`
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

Slice 16 is locally committed at `0996b5b` and its docs follow-up at
`45e0193` (static-green, not pushed). It added the H6 Phase 0 authoring
guide and lint.

Slice 17 is a local static-green save point (not pushed). It added the
H6 Phase 1 `defineTemplate({ ... })` helper and migrated two pilot
templates.

## Current Slice

Slice 17 implements **H6 Phase 1 — TS-side `defineTemplate` Helper**.

What landed:

- `packages/mcp-server/src/templates/_shared.ts` exports
  `defineTemplate(...)`. It is pure identity: no clone, no defaults, no
  normalization, no result-schema generation, no runtime behavior.
- `item_pitch` and `track_rename` migrated as the only pilots. Both keep
  explicit `callTemplateResultSchema(name)` constants.
- `packages/mcp-server/src/templates/__tests__/define-template.test.ts`
  adds three tests: identity, `CapabilityRegistry.list()` metadata
  regression, and `list_templates` metadata regression. The regression
  covers name, risk, mutates, undoable, entity_kind, undo_flags,
  idempotent, expectedDelta, examples, params JSON Schema key fields,
  and the locked result-envelope JSON Schema for both pilots.
- `docs/TEMPLATE_AUTHORING.md` now recommends `defineTemplate({ ... })`
  while explicitly keeping result schemas manual/visible.
- `docs/plans/SLICE_17_ARCHITECT_PLAN.md` records the locked S17
  decisions; H6 master plan and execution notes now include Slice 17.

Locked decisions in this slice:

- S17-D1..S17-D8 all use recommended `a`: helper in `_shared.ts`,
  identity/type-level only, no generated result schema, migrate only
  `item_pitch` + `track_rename`, update authoring docs, no lint change,
  no REAPER live smoke, local commit only / no push.

What did NOT change:

- No Lua runtime files.
- No `streetlight_bridge.lua`, `verify.lua`, `manifest.lua`, `refs.lua`,
  `undo.lua`, or any handler.
- No `expectedDelta` shape, no error codes, no wire fields, no MCP tool
  surface (still exactly five), no new templates, no
  `CapabilityDefinition` public contract change.
- No bridge restart required.

Static status:

- `npm test`: **329/329** green (Slice 16 baseline 326/326 + 3 new
  helper/metadata regression tests).
- `npm run build`: clean.
- `npm run check:manifest`: 11 templates aligned.
- `npm run check:error-codes-fresh`: 22 codes fresh.
- `npm run check:template-authoring`: 11 templates ok.
- `git diff --check`: clean.

Live smoke:

- Per S17-D7=a, **no REAPER live smoke**. This is TS/docs-only and
  bridge-invisible.

## Workflow To Continue

1. Read:
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/HANDOFF.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/PROGRESS.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/SLICE_17_ARCHITECT_PLAN.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/TEMPLATE_AUTHORING.md`
2. Slice 17 is static-green and local-only. Do not push during the
   work-hours no-push window unless the user explicitly makes an
   exception.
3. Natural next step is H6 Phase 2 / Slice 18 candidate:
   `scripts/scaffold-template.mjs`. It should get its own architect
   packet before coding.
4. Commit only after the user explicitly asks. Push only if the user
   explicitly asks and it is not inside their work-hours no-push window,
   unless they make a clear exception.

Keep the invariant sharp: each slice must make the kernel more reliable,
more testable, or harder to misuse, with a concrete local test (and a
live REAPER smoke when runtime is affected).
