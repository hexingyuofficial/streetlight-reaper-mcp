# Slice 15 Architect Plan — H4 Phase 2: render_region Deferred Dedup

Date: 2026-06-30

Source baseline: `56c57cb kernel-hardening: slice 14 idempotency tokens`.
User approved the packet by saying to continue; decisions S15-D1 through S15-D9
are treated as the recommended `a` values.

## Goal

Lift the `render_region` carve-out from H4 so a same-key retry of a completed
deferred render replays the stored terminal inner envelope instead of kicking a
second render.

## Non-Goals

- No new MCP tool.
- No schema change; reuse Slice 14 `idempotency_key`.
- No new error codes.
- No DEDUP persistence across bridge reload / REAPER restart.
- No key/param conflict detection.
- No auto-generated keys.
- No change to the single-slot deferred model.
- No re-validation of the WAV path on replay.

## Locked Decisions

- S15-D1=a: lift the `render_region` exclusion from `dedup_eligible`.
- S15-D2=a: replay does not update `LAST_RESULT.renders`.
- S15-D3=a: store successes and typed errors; do not store `INTERNAL_ERROR`.
- S15-D4=a: replay must never re-enter `DEFERRED`.
- S15-D5=a: stale-WAV semantics are accepted and documented.
- S15-D6=a: keep one shared `DEDUP` table and cap 256.
- S15-D7=a: stale `RUNNING/` sweep behavior unchanged.
- S15-D8=a: no special mid-flight same-key handling; single-slot serialization is enough.
- S15-D9=a: keep `render_region.idempotent = false`; DEDUP is transport-level.

## Runtime Semantics

- First keyed `render_region` call behaves normally: it renders, waits through
  the deferred slot, deletes sidecars, finalizes `LAST_RESULT.renders`, writes
  the done envelope, and stores the terminal inner envelope.
- Later same-key calls replay the stored inner envelope before dispatch. They do
  not call the handler, re-open render settings, enter `DEFERRED`, delete
  sidecars, or update `LAST_RESULT`.
- Typed render errors such as `OUTPUT_DIR_MISSING`, `OUTPUT_FILE_EXISTS`,
  `REGION_NOT_FOUND`, `RENDER_TIMEOUT`, and `RENDER_FILE_EMPTY` are stored and
  replayed.
- `INTERNAL_ERROR` is skipped, so a later same-key retry re-executes.
- If the WAV is deleted after the first success, replay still returns the
  stored path. A fresh attempt requires a fresh key.

## Files

Expected code changes:

- `reaper/streetlight_bridge.lua`
- `packages/mcp-server/src/tools/call-template.ts`
- `packages/mcp-server/src/index.ts`
- `packages/mcp-server/src/transport/__tests__/fake-bridge.ts`
- `packages/mcp-server/src/tools/__tests__/call-template.test.ts`
- `packages/mcp-server/src/tools/__tests__/render-region.test.ts`
- `scripts/__tests__/lua-structure.test.mjs`
- docs listed in this slice's PROGRESS entry

## Verification Plan

Static:

- focused tests for call-template, render-region, lua-structure, mcp-index
- `npm test`
- `npm run build`
- `npm run check:manifest`
- `npm run check:error-codes-fresh`
- `git diff --check`

Live REAPER smoke:

- full REAPER quit/reopen and current `start_bridge.lua`
- baseline ping/list_templates
- synchronous dedup regression from Slice 14
- first keyed render success then same-key replay without re-render
- typed render error replay
- `OUTPUT_FILE_EXISTS` terminal lock with same key, fresh attempt with new key
- `LAST_RESULT.renders` not polluted by replay
- reload clears DEDUP
- representative Slice 06-14 regressions

## Rollback

Revert the slice commit to restore Slice 14 behavior. As a narrow hotfix, re-add
`cmd.name ~= "render_region"` to `dedup_eligible`.
