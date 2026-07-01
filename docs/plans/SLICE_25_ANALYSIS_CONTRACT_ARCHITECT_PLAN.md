# Slice 25 Architect Plan — Phase 3 Analysis Contract Foundation

Date: 2026-07-01

Status: implemented, static-green, and REAPER live-smoked.

## Goal

Give OpenReaper a bounded, factual "ear" for in-project audio items by
adding an opt-in `analysis` pack with one template:
`item_audio_analyze`.

The template analyzes one resolved item/take using REAPER's PCM accessor
APIs and writes a JSON artifact. The call result stays the locked
`call_template` envelope; rich analysis is read through
`get_state(scope:"artifact")`.

## Locked Decisions

- S25-D1: pack id is `analysis`.
- S25-D2: first slice feature set is `loudness + peaks + silence`.
- S25-D3: artifact ref grammar is
  `artifact:analysis:analysis:<id>`, matching the Slice 21 artifact
  contract even though the repeated `analysis` is a little plain.
- S25-D4: do not implement `get_state(scope:"analysis")` in this slice.
  Use existing artifact summary/payload reads.
- S25-D5: caps are 120 seconds max range, 200 silence segments, and a
  49152 byte write-side artifact JSON preflight.
- S25-D6: loudness v1 means RMS dBFS, not EBU LUFS. Peaks are sample
  peaks, not true peaks.

## Contract

`item_audio_analyze`

- pack: `analysis`
- risk: `filesystem`
- mutates: `false`
- undoable: `false`
- entity_kind: `artifact`
- artifact ref: `artifact:analysis:analysis:<id>`
- schema: `openreaper.analysis.item_audio.v1`
- params:
  `{ item_id, features?: ("loudness"|"peaks"|"silence")[], time_range?: { start, end } }`

Default `features` is all three Slice 25 features. `time_range` is
item-local seconds and must fit inside the item.

The artifact payload contains:

- `source`: item ref, take name, and source filename when available.
- `time_range`: local and project-time bounds.
- `features`: computed feature list.
- `limits`: Slice 25 caps and accessor scan settings.
- `loudness`: RMS linear + RMS dBFS.
- `peaks`: sample peak linear/dBFS and signed peak values.
- `silence`: threshold, total silence, capped segment list, and
  truncation flag.
- `warnings`: small reminders that LUFS, true peak, transients, and
  loop candidates are not implemented in this slice.

## Non-Goals

- No external sample-library search.
- No embedding service.
- No AI audio generation.
- No loop factory scene.
- No arbitrary Lua analyzer from agent input.
- No OpenAudio integration.
- No transients or loop candidates.
- No MIDI, FX, routing, render migration, or new MCP tool.
- No analysis capability parked in `core`.

## Files

- `packages/mcp-server/src/packs/analysis/index.ts`
- `packages/mcp-server/src/packs/analysis/item-audio-analyze.ts`
- `packages/mcp-server/src/templates/index.ts`
- `reaper/packs/analysis/manifest.lua`
- `reaper/packs/analysis/templates/analysis.lua`
- `packages/core/src/errors.ts`
- `reaper/packs/core/error_codes.lua`
- `reaper/streetlight_bridge.lua`
- `scripts/template-authoring-lint.mjs`
- `scripts/__tests__/manifest-alignment.test.mjs`
- `scripts/__tests__/template-authoring-lint.test.mjs`
- `scripts/__tests__/lua-structure.test.mjs`
- `packages/mcp-server/src/tools/__tests__/call-template.test.ts`
- `packages/mcp-server/src/tools/__tests__/list-templates.test.ts`
- `docs/packs/analysis/README.md`
- `docs/smokes/analysis_contract.md`

## Static Tests

Required:

- `npm run build`
- `npm test`
- `npm run check:error-codes-fresh`
- default `npm run check:manifest`
- `STREETLIGHT_ENABLED_PACKS=core,analysis npm run check:manifest`
- `STREETLIGHT_ENABLED_PACKS=core,analysis npm run check:template-authoring`
- all-pack manifest/lint checks including `analysis`
- `git diff --check`

## Live Smoke

Full quit/reopen REAPER, then load:

```lua
_G.STREETLIGHT_ENABLED_PACKS = "core,analysis"
dofile("/Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/streetlight_bridge.lua")
```

Smoke:

1. Generate or import a short WAV with a known silence + tone shape.
2. `ping`; expect connected.
3. `list_templates`; expect 13 templates and `item_audio_analyze` owned
   by pack `analysis` with JSON artifact metadata.
4. Create a track/item and select the item.
5. Call `item_audio_analyze { item_id:"selected:0" }`.
6. Assert `changed_ids[0]` is `artifact:analysis:analysis:<id>`.
7. Read artifact summary and payload with `get_state(scope:"artifact")`.
8. Verify RMS/peak are finite, silence segments are bounded, and
   `response_bytes` stays under the cap.
9. Anchor a track in `LAST_RESULT`, call analysis, then
   `track_rename last_result:track:0` to prove artifact calls do not
   pollute item/track/region `LAST_RESULT`.
10. Delete or make the source unavailable if practical and confirm
    `AUDIO_SOURCE_OFFLINE`. If REAPER does not expose a stable offline
    path on the smoke machine, use the minimal source-unavailable path
    such as an item with no active take.
11. Queue ends clean: `pending=0`, `running=0`, `done=0`.

Result (2026-07-01): passed on REAPER `7.71/macOS-arm64` with bridge
`core,analysis`. Initial attempt against `core,cleanup,delivery`
returned `TEMPLATE_NOT_FOUND`; the required reload is:

```lua
_G.STREETLIGHT_ENABLED_PACKS = "core,analysis"
dofile("/Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/streetlight_bridge.lua")
```

Ready output showed `loaded error_codes (26 codes)`, core
`(12 templates)`, analysis `(1 templates)`, and templates including
`item_audio_analyze`. Smoke stamp `s25-live-1782914754219`; queue
`/Users/Zhuanz/Library/Application Support/Streetlight/queue`; start and
end queue status were `pending=0`, `running=0`, `done=0`.
`list_templates` returned 13 templates and exposed `item_audio_analyze`
as pack `analysis`, entity kind `artifact`, ref prefix
`artifact:analysis:analysis:`, schema
`openreaper.analysis.item_audio.v1`, and
`updates_last_result:false`.

Fixture WAV:
`/tmp/s25-live-1782914754219-silence-tone.wav`; selected imported item:
`guid:{77C33FC5-20F7-9B4A-83C0-1704F568AA25}`. Main analysis artifact:
`artifact:analysis:analysis:art_20260701140556948_005_4b21d8`.
Summary/payload evidence: computed features `loudness`, `peaks`,
`silence`; `rms_dbfs=-10.792`; `peak_dbfs=-6.021`; silence
`0.385443s`, `segment_count=2`, `truncated=false`; response bytes
`639` summary / `1918` payload; warnings included RMS-not-LUFS and
sample-peak-not-true-peak.

LAST_RESULT isolation passed: anchor
`guid:{53A9DB6E-F79C-A947-9EB4-30DB6C60F4BB}` survived analysis, then
`track_rename last_result:track:0` hit the same GUID after artifact
`artifact:analysis:analysis:art_20260701140559453_009_c1f158`.
Source-unavailable negative used an empty/no-active-take item and
returned `AUDIO_SOURCE_OFFLINE` with `Item has no active take to
analyze`. Direct `get_state(scope:"analysis")` returned
`PARAMS_INVALID`.

## Risks And Regression Notes

- PCM accessor behavior is REAPER-version-sensitive. Always destroy the
  accessor on every success/error path.
- `CreateTakeAudioAccessor` reads pre-FX audio; this is factual item
  analysis, not post-FX loudness.
- RMS dBFS can be misunderstood as LUFS; docs and payload warnings must
  keep that distinction clear.
- Empty/silent material must not crash on log(0); floor values at
  `-120 dBFS`.
- Large silence lists must stay capped and marked truncated.
- JSON artifact producers must not update LAST_RESULT; the manifest
  `updates_last_result=false` is the hard guard.
