# Next Window Briefing — 2026-06-30

Use this as the first read after a context reset. It is the current truth
after Slice 18.

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
  - Slice 17: `05f297c kernel-hardening: slice 17 define template helper`
  - Slice 17 reviewer follow-up: `8f0b505 docs: follow up slice 17 review`
- Slice 18 is the current uncommitted working tree. It is code-done and
  static-green, but not committed yet.
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

Slice 17 is locally committed at `05f297c` with reviewer follow-up at
`8f0b505` (static-green, not pushed). It added the H6 Phase 1
`defineTemplate({ ... })` helper and migrated two pilot templates.

Slice 18 is not committed yet. It is the current working tree.

## Current Slice

Slice 18 implements **H6 Phase 2 — Dry-Run Template Scaffolder**.

What landed:

- `scripts/scaffold-template.mjs` exports pure helpers and a CLI entry.
- `package.json` adds `npm run scaffold:template`.
- The CLI requires `--dry-run`, reads existing template source slugs, and
  refuses collisions before printing a plan.
- Supported descriptor surface is deliberately narrow:
  - `--pack core` only;
  - `--entity-kind item|track|region`;
  - `--risk read|write_safe|filesystem`;
  - explicit `--undoable`;
  - explicit `--idempotent`;
  - `--undo-flags` required when `--undoable true` and rejected when
    `--undoable false`.
- Unsupported this slice: render templates, non-core packs,
  destructive/unsafe_eval risk, JSON machine output, overwrite/write mode,
  or any real template generation.
- The formatted plan prints normalized metadata, would-create paths,
  manual-modify paths, TS skeleton using `defineTemplate(...)`, Lua handler
  TODO, `manifest.lua` TODO, registry TODO, and MCP-server test TODO.
- The output warns that no files were written and TODO skeletons are not
  lint-clean until filled.
- `scripts/__tests__/scaffold-template.test.mjs` adds 19 tests around
  parsing, validation, output shape, deterministic paths, manifest bitmask
  snippets, and unsupported cases.
- `docs/TEMPLATE_AUTHORING.md` documents the dry-run workflow.
- `docs/plans/SLICE_18_ARCHITECT_PLAN.md`, H6 master plan, and execution
  notes record the slice.

What did NOT change:

- No Lua runtime behavior.
- No `streetlight_bridge.lua`, `verify.lua`, `manifest.lua` runtime entry,
  `refs.lua`, `undo.lua`, or handler implementation.
- No registry registration for a new template.
- No MCP tool surface change.
- No `CapabilityDefinition` contract change.
- No error codes, wire fields, or template count change.
- No bridge restart required.

Static status:

- `npm test`: **348/348** green (Slice 17 baseline 329/329 + 19
  scaffolder tests).
- `npm run build`: clean.
- `npm run check:manifest`: 11 templates aligned.
- `npm run check:error-codes-fresh`: 22 codes fresh.
- `npm run check:template-authoring`: 11 templates ok.
- `git diff --check`: clean.

Live smoke:

- Per S18-D8=a, **no REAPER live smoke**. This is CLI/docs-only and
  bridge-invisible.

## Workflow To Continue

1. Read:
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/HANDOFF.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/PROGRESS.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/SLICE_18_ARCHITECT_PLAN.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/TEMPLATE_AUTHORING.md`
2. If reviewer/static-smoke for Slice 18 has not run yet, run it before
   committing.
3. Commit only after the user explicitly asks. Push only if the user
   explicitly asks and it is not inside their work-hours no-push window,
   unless they make a clear exception.
4. Natural next step after Slice 18 closes: Slice 19, using the scaffolder
   to land a real low-risk template (likely `track_color`). Slice 19 will
   require runtime edits and therefore REAPER live smoke.

Keep the invariant sharp: each slice must make the kernel more reliable,
more testable, or harder to misuse, with a concrete local test (and a live
REAPER smoke when runtime is affected).
