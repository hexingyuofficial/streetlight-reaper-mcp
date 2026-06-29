# Architect Plan Packet — Slice 03

Source: `docs/plans/KERNEL_HARDENING_PLAN.md` H5, `docs/plans/KERNEL_HARDENING_EXECUTION.md` H5, and Slice 01/02 packets.

Slice 01 and Slice 02 are committed and pushed (`baa13bd`, `e93d39e`). H1 data-driven entity routing and H3 readonly state plus `get_state(tracks, include:["fx"])` are closed. Slice 03 is the H5 minimum slice: capability descriptor enrichment, TS/Lua manifest alignment, error-code generation/audit, and richer `list_templates` metadata.

## Goal

Prepare the ground for H2 verification and H6 template scaffolding by making TypeScript capability descriptors the metadata authority and adding CI-style checks that catch TS/Lua drift.

Deliver:

- `CapabilityDefinition` requires `entity_kind`, `undo_flags`, and `examples`.
- Optional placeholder fields exist for later H2/H6: `expectedDelta`, `reads`, and `writes`.
- Static TS descriptor ↔ Lua manifest alignment check for `entity_kind`, `undoable`, and `undo_flags`.
- Generated `reaper/packs/core/error_codes.lua` from `packages/core/src/errors.ts`.
- Lua error-code literal audit, including `raise(...)`, `code = ...`,
  and resolver `return nil, "CODE", ...` forms.
- `list_templates` returns the enriched metadata.

## Non-Goals

- No H2 runtime verification.
- No before/after snapshots.
- No `VERIFY_FAILED`.
- No H6 scaffold/template factory.
- No changes to `manifest.lua`, bridge, refs, undo, entity buckets, or any Lua template handler.
- No migration of Lua handler error literals to `errs.FOO` references.
- No new MCP tools, get_state scopes, include values, or runtime behavior.

## User-Facing Behavior

- `call_template`, `get_state`, `ping`, and `list_recipes` behavior is unchanged.
- `list_templates` adds descriptor metadata:
  - required: `entity_kind`, `undo_flags`, `examples`;
  - optional when declared: `expectedDelta`, `reads`, `writes`.
- Existing clients can ignore the new fields.
- No new runtime error codes.

## Locked Decisions

- D-A: Required descriptor fields are `entity_kind`, `undo_flags`, and `examples`; `expectedDelta`, `reads`, and `writes` are optional placeholders.
- D-B: Each template must provide at least one example.
- D-C: `undo_flags` is a symbol array such as `["ITEMS","TRACKCFG"]`; numeric undo bitmasks stay internal.
- D-D: Generate `error_codes.lua` and audit Lua error-code literals, but do not rewrite handlers yet.
- D-E: `undoable:false` templates use `undo_flags: []`.
- D-F: Optional placeholders are omitted from metadata when absent, never `null`.
- D-G: Bridge does not `dofile` `error_codes.lua` in this slice.
- D-H: Manifest/error-code checks are part of the normal test/check gate.
- D-I: `manifest.lua` keeps single-line `undo_flags` expressions; parser fails loudly on unsupported multi-line forms.

## Files

Core:

- `packages/core/src/registry.ts`
- `packages/core/src/__tests__/registry.test.ts`

Templates:

- All 11 `packages/mcp-server/src/templates/*.ts` capability definitions.

Tools/tests:

- `packages/mcp-server/src/tools/list-templates.ts`
- `packages/mcp-server/src/tools/__tests__/list-templates.test.ts`

Scripts:

- `scripts/manifest-alignment.mjs`
- `scripts/error-codes.mjs`
- `scripts/__tests__/manifest-alignment.test.mjs`
- `scripts/__tests__/error-codes.test.mjs`

Generated artifact:

- `reaper/packs/core/error_codes.lua`

Docs:

- `docs/HANDOFF.md`
- `docs/PROGRESS.md`
- `docs/RESPONSE_BUDGET.md`
- `docs/ROADMAP.md`

## Acceptance

M0:

- `npm test`
- `npm run build`
- `npm run check:manifest`
- `npm run check:error-codes-fresh`
- `git diff --check`

M1:

- Fully restart REAPER.
- Run current `start_bridge.lua`.
- Console should show `bridge ready (generation 1)` with the same 11 templates.

M2:

- Call `list_templates`.
- Confirm 11 templates.
- Every template includes `entity_kind`, `undo_flags`, and `examples`.
- `render_region.undoable === false` and `render_region.undo_flags === []`.

M3:

- Run one existing old template, for example `track_create name:"smoke03-meta"`.
- Confirm the locked call_template envelope and undo behavior are unchanged.

Optional probes:

- Temporarily break TS `entity_kind` and confirm `check:manifest`/tests fail with `FIELD_MISMATCH`.
- Temporarily change `errors.ts` and confirm `check:error-codes-fresh` fails until regeneration.
