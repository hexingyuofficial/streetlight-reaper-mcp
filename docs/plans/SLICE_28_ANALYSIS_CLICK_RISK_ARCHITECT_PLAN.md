# Slice 28 Architect Plan Packet — Phase 3D Analysis Click-Risk MVP

Date: 2026-07-01

Status: accepted for implementation.

## Goal

Extend the opt-in `analysis` pack's `item_audio_analyze` template with
one explicit opt-in feature:

```json
"features": ["click_risk"]
```

The feature scores one item-local loop boundary for click/discontinuity
risk and writes the result into the existing analysis JSON artifact:

```text
artifact:analysis:analysis:<id>
```

The call envelope remains locked and returns only the artifact ref in
`changed_ids`. Analysis artifacts still do not update item / track /
region `LAST_RESULT`.

## Non-Goals

- No seamless-loop guarantee.
- No trim, fade, take-loop setting, render, recipe, scene, MIDI,
  OpenAudio, AI generation, or external analyzer.
- No new MCP tool.
- No `get_state(scope:"analysis")`.
- No broad `loop_qa` report.
- No user-tunable click-risk window parameters in v1.
- No new error code.
- No core parking.

## User-Facing Contract

The supported feature enum becomes:

```json
[
  "loudness",
  "peaks",
  "silence",
  "transients",
  "loop_candidates",
  "click_risk"
]
```

Defaults remain:

```json
["loudness", "peaks", "silence"]
```

Standalone `click_risk` requires an explicit item-local `loop_window`:

```json
{
  "item_id": "selected:0",
  "features": ["click_risk"],
  "loop_window": { "start": 0.2, "end": 1.2 }
}
```

If the same call also requests `loop_candidates`, `click_risk` may omit
`loop_window` and use the best same-call candidate:

```json
{
  "item_id": "selected:0",
  "features": ["loop_candidates", "click_risk"]
}
```

This does not read a previous artifact and does not create cross-artifact
state. It is same-call only.

## Artifact Shape

Schema remains:

```text
openreaper.analysis.item_audio.v1
```

`payload.click_risk`:

```json
{
  "type": "loop_boundary_click_risk",
  "algorithm_version": "click_risk_v1",
  "loop_window": {
    "start": 0.2,
    "end": 1.2,
    "duration": 1.0,
    "source": "user"
  },
  "risk_score": 0.72,
  "risk_label": "high",
  "metrics": {
    "start_end_sample_delta": 0.41,
    "boundary_peak_delta": 0.36,
    "boundary_rms_delta_db": 14.2,
    "zero_crossing_distance_start_ms": 1.8,
    "zero_crossing_distance_end_ms": 7.4
  },
  "limits": {
    "window_ms": 12,
    "max_boundary_windows": 2,
    "min_loop_duration_seconds": 0.05,
    "max_loop_duration_seconds": 8.0,
    "score_direction": "higher_is_more_dangerous"
  },
  "warnings": []
}
```

`summary` gains:

- `click_risk_score`
- `click_risk_label`
- `click_risk_loop_start`
- `click_risk_loop_end`
- `click_risk_window_source`

`risk_score` is `0..1`; higher means more dangerous. `risk_label` is
only `low`, `medium`, or `high`.

## Algorithm

Deterministic v1 heuristic:

1. Validate `loop_window` in item-local seconds and within the analysis
   `time_range`.
2. Read short boundary windows around start and end.
3. Compute:
   - wrap-point sample delta
   - boundary peak delta
   - boundary RMS delta in dB
   - nearest zero-crossing distance around each boundary
4. Normalize metrics to `0..1`.
5. Weighted score:
   - sample delta 40%
   - peak delta 25%
   - RMS delta 25%
   - zero-crossing distance 10%
6. A hard wrap discontinuity (`start_end_sample_delta >= 0.5`) floors
   the score into the high-risk band. This keeps obvious sample jumps
   from being diluted to `medium` when peak and RMS happen to match on
   both sides of the loop.
7. Labels:
   - `low` when `< 0.33`
   - `medium` when `< 0.66`
   - `high` otherwise

Caps are fixed:

- `CLICK_RISK_WINDOW_MS=12`
- exactly two boundary windows
- min loop duration `0.05s`
- max loop duration `8.0s`
- hard discontinuity floor `0.5`
- existing max analysis range `120s`
- existing write-side artifact cap `49152` bytes

## Implementation Notes

Mid-smoke fixes landed during Slice 28:

1. REAPER PCM accessors read take/item-local time, not project time.
   The payload still exposes project-time metadata by adding the item
   position after the read.
2. Strong wrap discontinuities floor into the high-risk label. Without
   this, a pure `+0.8 -> -0.8` sample jump could be diluted to `medium`
   because peak and RMS are identical on both sides.

## Error Semantics

- `PARAMS_INVALID`: unknown / duplicate feature, invalid or missing
  `loop_window`, window outside item/time_range, duration bounds failure,
  or same-call `loop_candidates + click_risk` has no usable candidate.
- `AUDIO_SOURCE_OFFLINE`: no active take, offline/missing source, or
  accessor returns unavailable boundary data.
- `ANALYSIS_FAILED`: PCM accessor API missing or unexpected internal
  invariant failure.
- `RESPONSE_TOO_LARGE`: artifact JSON preflight exceeds `49152`.

No new error code.

## User Decisions

All locked as recommended:

- S28-D1: feature name is `click_risk`, not `loop_qa`.
- S28-D2: `risk_score` means higher is more dangerous.
- S28-D3: standalone `click_risk` requires `loop_window`.
- S28-D4: same-call `loop_candidates + click_risk` may use the best
  candidate when `loop_window` is omitted.
- S28-D5: fixed caps, no user-tunable `window_ms`.
- S28-D6: no new error code.

Additional user constraints:

- `click_risk` does not output transients unless `transients` is
  explicitly requested.
- `zero usable candidate / missing window source` is `PARAMS_INVALID`,
  not a fabricated score.
- Keep old flow: static gates → reviewer → REAPER full restart + live
  smoke → docs sync → wait for user commit authorization.

## Static Tests

- TS schema accepts `click_risk`.
- Standalone `click_risk` requires finite valid `loop_window`.
- `loop_window` is invalid unless `features` includes `click_risk`.
- Same-call `loop_candidates + click_risk` can omit `loop_window`.
- Default features still exclude `transients`, `loop_candidates`, and
  `click_risk`.
- Locked envelope still contains only artifact refs.
- `list_templates` exposes analysis artifact metadata and examples.
- Lua structure locks constants, `algorithm_version="click_risk_v1"`,
  label thresholds, score direction, no render/mutation APIs, and no
  `scope="click_risk"`.

## REAPER Live Smoke

Load:

```lua
_G.STREETLIGHT_ENABLED_PACKS = "core,analysis"
dofile("/Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/streetlight_bridge.lua")
```

Smoke:

1. `ping`.
2. `list_templates`; confirm `item_audio_analyze` artifact metadata and
   `click_risk` example.
3. Generate/import a short low-risk loopable WAV.
4. Call `features:["click_risk"]` with explicit `loop_window`; read
   summary/payload; expect `risk_label:"low"` or at least a low score
   relative to the high-risk fixture.
5. Generate/import or use a high-risk boundary window with abrupt
   discontinuity; expect a clearly higher score and `risk_label:"high"`.
6. Call `features:["loop_candidates","click_risk"]` without
   `loop_window`; expect source `best_loop_candidate` or typed
   `PARAMS_INVALID` if no candidates exist.
7. Call `features:["click_risk"]` without `loop_window`; expect
   `PARAMS_INVALID`.
8. Verify default analysis and loop-only regressions.
9. Verify LAST_RESULT preservation.
10. Verify source unavailable returns `AUDIO_SOURCE_OFFLINE`.
11. Verify `get_state(scope:"analysis")` remains invalid/unimplemented.
12. Queue ends clean.

The source-offline negative can be REAPER-preference dependent when
`media_import` copies source media into the project media directory. The
stable Slice 28 negative is missing standalone `loop_window`; source
offline remains covered by Slice 25/26 live smoke and manual
no-active-take setup.

## Reviewer Focus

- Name is narrow and honest: `click_risk`, not `loop_qa`.
- No default drift.
- No call-template payload leakage.
- `risk_score` direction is clear.
- `loop_window` is item-local.
- Same-call best-candidate path does not leak transients.
- No mutation/render/recipe/seamless-loop claims.
- Artifact cap and bounds are real.

## Rollback

Revert only Slice 28 files:

- TS analysis definition/tests
- Lua analysis template click-risk additions
- docs and smoke text

Slice 25-27 behavior should remain intact: default analysis,
transients, loop candidates, artifact refs, and LAST_RESULT isolation.
