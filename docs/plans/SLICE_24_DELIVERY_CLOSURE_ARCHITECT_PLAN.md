# Slice 24 Architect Plan — Phase 2.5 Delivery Closure MVP

Date: 2026-07-01

Status: implemented, static-green, and REAPER live-smoked. Do not push
without an explicit user ask.

## Goal

Implement the minimum delivery closure loop:

1. `delivery_plan` writes a JSON artifact describing one region's
   expected WAV deliverable.
2. The agent renders with existing `render_region`.
3. `delivery_report` reads the plan artifact and writes a pass/fail JSON
   report artifact about the expected file.

This slice proves planned output -> existing render -> validated
deliverable. It does not render, master, upload, or mutate REAPER.

## Locked Decisions

- S24-D1: use `delivery_plan + delivery_report`, not report-only.
- S24-D2: new opt-in pack id is `delivery`; do not put delivery in
  `core` or `cleanup`.
- S24-D3: validation failures write a fail report artifact; they are not
  successful call payloads and not typed call errors.
- S24-D4: WAV evidence is Lua header sniff only (`RIFF....WAVE`); no
  `afinfo` or shell dependency in product logic.
- S24-D5: optional cleanup provenance is copied only; no cleanup artifact
  dereference in this slice.
- S24-D6: stale fingerprint mismatch conservatively makes the report
  fail.
- S24-D7: delivery remains opt-in via `STREETLIGHT_ENABLED_PACKS`; it is
  not default enabled.
- S24-D8: `delivery_report` reads plan payload through
  `ctx.artifacts:read(plan_ref, "payload")` or an equivalent helper and
  strictly unwraps it. `ARTIFACT_NOT_FOUND`, `ARTIFACT_INVALID`, and
  `RESPONSE_TOO_LARGE` propagate as typed call errors; they are not
  swallowed into a fail report.
- S24-D9: `delivery_plan` reuses the existing region-name rules before
  deriving an expected filename. Hand-built bad region names (`/`, `\`,
  NUL, `$`) return `REGION_NAME_INVALID` and generate no artifact.
- S24-D10: `delivery_plan` does minimal `output_dir` preflight.
  Missing/unwritable directories use existing `OUTPUT_DIR_MISSING` /
  `OUTPUT_DIR_NOT_WRITABLE`. `delivery_report` treats a missing expected
  WAV as a fail report artifact.

## Contract

`delivery_plan`

- pack: `delivery`
- risk: `filesystem`
- mutates: `false`
- undoable: `false`
- entity_kind: `artifact`
- artifact ref: `artifact:delivery:plan:<id>`
- schema: `openreaper.delivery_plan.v1`
- params:
  `{ region_id, output_dir, cleanup_plan_ref?, cleanup_fingerprint? }`

`delivery_report`

- pack: `delivery`
- risk: `filesystem`
- mutates: `false`
- undoable: `false`
- entity_kind: `artifact`
- artifact ref: `artifact:delivery:report:<id>`
- schema: `openreaper.delivery_report.v1`
- params: `{ delivery_plan_ref }`

Both templates return the locked `call_template` envelope only:
`changed_ids` contains the artifact ref; rich details are read with
`get_state(scope:"artifact")`.

`render_region` stays the legacy absolute-WAV-path carve-out. This slice
must not migrate it to JSON artifacts.

## Non-Goals

- No new MCP tool.
- No mastering, loudness correction, multi-format package, platform
  presets, upload, or delivery network integration.
- No `cleanup_apply_safe` and no destructive cleanup.
- No MIDI, loop analysis, audio content analysis, routing repair, or FX
  repair.
- No render/export template beyond existing `render_region`.
- No `render_region` JSON artifact migration.
- No delivery code parked in `core`.

## Files

Likely implementation files:

- `packages/mcp-server/src/packs/delivery/index.ts`
- `packages/mcp-server/src/packs/delivery/delivery-plan.ts`
- `packages/mcp-server/src/packs/delivery/delivery-report.ts`
- `packages/mcp-server/src/templates/index.ts`
- `reaper/packs/delivery/manifest.lua`
- `reaper/packs/delivery/templates/delivery.lua`
- `scripts/template-authoring-lint.mjs`
- `scripts/__tests__/manifest-alignment.test.mjs`
- `scripts/__tests__/template-authoring-lint.test.mjs`
- `scripts/__tests__/lua-structure.test.mjs`
- `packages/mcp-server/src/tools/__tests__/call-template.test.ts`
- `packages/mcp-server/src/tools/__tests__/list-templates.test.ts`
- `docs/packs/delivery/README.md`
- `docs/smokes/delivery_closure.md`

## Static Tests

Required:

- `npm run build`
- `npm test`
- `npm run check:error-codes-fresh`
- default `npm run check:manifest`
- `STREETLIGHT_ENABLED_PACKS=core,delivery npm run check:manifest`
- `STREETLIGHT_ENABLED_PACKS=core,cleanup,delivery npm run check:manifest`
- `STREETLIGHT_ENABLED_PACKS=core,cleanup,delivery,pack_contract_fixture npm run check:manifest`
- default `npm run check:template-authoring`
- `STREETLIGHT_ENABLED_PACKS=core,delivery npm run check:template-authoring`
- `STREETLIGHT_ENABLED_PACKS=core,cleanup,delivery npm run check:template-authoring`
- `STREETLIGHT_ENABLED_PACKS=core,cleanup,delivery,pack_contract_fixture npm run check:template-authoring`
- `git diff --check`

Specific assertions:

- Default core-only registry still has 12 templates; delivery absent.
- `core,delivery` has +2 templates.
- `list_templates` exposes compact artifact metadata for both templates.
- Fake bridge success result remains locked envelope only.
- Disabled delivery returns `TEMPLATE_NOT_FOUND` before queue write.
- Invalid params return `PARAMS_INVALID` before queue write.
- Manifest alignment covers `core,delivery`.
- Authoring lint scans delivery only when enabled.
- Lua structure has no render command, shell dependency, project mutation
  APIs, destructive cleanup, or `afinfo`.

## REAPER Live Smoke Recipe

Preconditions:

1. Fully quit/reopen REAPER.
2. Load bridge with:

```lua
_G.STREETLIGHT_ENABLED_PACKS = "core,cleanup,delivery"
dofile("/Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/streetlight_bridge.lua")
```

Smoke:

1. `ping` reaches REAPER.
2. `list_templates` includes `delivery_plan` and `delivery_report`, both
   owned by pack `delivery`.
3. Create a fresh output directory under `/tmp`.
4. Create one safe region such as `S24 Delivery <stamp>`.
5. Optionally run `cleanup_plan` and pass its ref/fingerprint as
   provenance.
6. Call `delivery_plan` with the region and output directory.
7. Read the plan artifact payload; expected filename is
   `<region_name>.wav`.
8. Anchor `LAST_RESULT.tracks`; call `delivery_plan`; then
   `track_rename last_result:track:0` to prove plan artifacts do not
   pollute track LAST_RESULT.
9. Call `render_region` with the same region/output_dir; expect the
   absolute WAV path matching the plan.
10. Call `delivery_report` with `delivery_plan_ref`.
11. Read report artifact payload; expect `overall_status:"pass"`,
    file exists, size > 0, extension `.wav`, expected path/filename
    match, no `.RPP` / `.RPP-bak`, WAV header ok, and stale check fresh.
12. Anchor `LAST_RESULT.tracks` again; call `delivery_report`; then
    `track_rename last_result:track:0` to prove report artifacts do not
    pollute track LAST_RESULT.
13. Negative: create a second plan without rendering; report writes
    `overall_status:"fail"` with a missing-file check.
14. Negative stale: mutate the region/project after plan creation; report
    the old plan and expect `overall_status:"fail"` due to stale mismatch.
15. Queue ends `pending=0`, `running=0`, `done=0`.

## Live Smoke Evidence

Passed on 2026-07-01 against REAPER `7.71/macOS-arm64` with bridge packs
`core,cleanup,delivery`.

- Smoke stamp: `s24-live-1782906947707`; queue:
  `/Users/Zhuanz/Library/Application Support/Streetlight/queue`.
- `ping` returned `bridge:"connected"`; `list_templates` returned 15
  templates and exposed `delivery_plan` / `delivery_report` as pack
  `delivery` JSON artifact producers with `updates_last_result:false`.
- Main region: `s24-live-1782906947707-main`; output dir:
  `/tmp/s24-live-1782906947707-render`.
- Plan ref:
  `artifact:delivery:plan:art_20260701115550245_006_dcdce6`; payload
  expected `s24-live-1782906947707-main.wav` at
  `/tmp/s24-live-1782906947707-render/s24-live-1782906947707-main.wav`.
- `render_region` wrote the exact planned absolute WAV path; file size
  was `216736` bytes, header bytes were `RIFF` / `WAVE`, and there were
  no `.RPP` / `.RPP-bak` sidecars.
- Report ref:
  `artifact:delivery:report:art_20260701115552923_010_a44ee5`; payload
  had `overall_status:"pass"` and all 7 checks passed:
  `plan_fresh`, file exists, nonempty, filename/path match, `.wav`,
  WAV header, and no sidecars.
- Track anchor `guid:{7228A0ED-E948-BC4D-9C44-866567FDD18D}` remained
  resolvable through `last_result:track:0` after both `delivery_plan`
  and `delivery_report`, proving JSON delivery artifacts did not
  pollute track LAST_RESULT.
- Missing-WAV negative wrote fail report
  `artifact:delivery:report:art_20260701115556554_017_510ca6` without a
  call error.
- Stale-project negative wrote fail report
  `artifact:delivery:report:art_20260701115600666_023_4fa866` with
  `plan_fresh:false`.
- Queue ended `pending=0`, `running=0`, `done=0`.

## Risks And Regression Points

- Do not hide file facts in the `call_template` success result.
- Do not convert missing/corrupt plan artifact errors into fail reports.
- Do not make delivery depend on cleanup.
- Do not use `afinfo` or shell commands.
- Do not migrate `render_region`.
- JSON artifacts must not update item/track/region LAST_RESULT.
- Delivery pack must stay opt-in and non-core.
