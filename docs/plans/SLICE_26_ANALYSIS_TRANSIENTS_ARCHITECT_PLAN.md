# Slice 26 Architect Plan — Analysis Transients MVP

Status: implemented, static-green, and REAPER live-smoked.

## Goal

Extend the opt-in `analysis` pack from Slice 25 with one new explicit
feature for `item_audio_analyze`: `transients`.

The feature produces bounded heuristic onset candidates inside the same
JSON artifact contract:

```text
artifact:analysis:analysis:<id>
```

The `call_template` envelope still returns only the artifact ref. Rich
arrays stay in artifact payloads and are read through
`get_state(scope:"artifact")`.

## Locked Decisions

- S26-D1: default features stay `loudness`, `peaks`, and `silence`.
  `transients` is explicit opt-in.
- S26-D2: schema stays `openreaper.analysis.item_audio.v1`; transient
  fields are optional additions.
- S26-D3: no user-tunable threshold / min-gap / max-transients params in
  this slice.
- S26-D4: constants are `MAX_TRANSIENTS=200`,
  `TRANSIENT_MIN_GAP_SECONDS=0.05`, `TRANSIENT_RISE_THRESHOLD_DB=10`,
  and `TRANSIENT_THRESHOLD_FLOOR_DBFS=-60`.
- S26-D5: summary includes first/last transient times.

Additional user constraint: payload must distinguish actual
`threshold_dbfs` from the floor in
`limits.transient_threshold_floor_dbfs`; do not hard-code the example
`-42`.

## Contract

`features` accepts:

```json
["loudness", "peaks", "silence", "transients"]
```

Default remains:

```json
["loudness", "peaks", "silence"]
```

`payload.transients`:

```json
{
  "type": "energy_envelope_onsets",
  "algorithm_version": "transients_v1",
  "events": [
    {
      "time": 0.502,
      "project_time": 12.502,
      "peak_linear": 0.71,
      "peak_dbfs": -2.97,
      "score_db": 18.4
    }
  ],
  "event_count": 5,
  "total_detected": 5,
  "truncated": false,
  "cap": 200,
  "min_gap_seconds": 0.05,
  "threshold_dbfs": -42,
  "threshold_linear": 0.007943,
  "threshold_floor_dbfs": -60,
  "rise_threshold_db": 10,
  "frame_samples": 512
}
```

`summary` may add:

- `transient_count`
- `transient_total_detected`
- `transients_truncated`
- `first_transient_time`
- `last_transient_time`

`payload.limits` adds:

- `max_transients`
- `transient_min_gap_seconds`
- `transient_frame_samples`
- `transient_rise_threshold_db`
- `transient_threshold_floor_dbfs`

## Algorithm

- Use the existing REAPER PCM accessor scan.
- Use `DEFAULT_SAMPLE_RATE=44100`, 2 channels, pre-FX item/take audio.
- Build a frame peak envelope with `TRANSIENT_FRAME_SAMPLES=512`.
- A candidate transient must:
  - exceed `threshold_dbfs = max(-60, global_peak_dbfs - 36)`;
  - rise at least `10 dB` over the smoothed previous envelope;
  - be at least `0.05s` from the previous accepted event.
- Within one min-gap window, keep the stronger event.
- Output sorted item-local event times with matching project times.
- Cap events at 200 and set `truncated:true` if more are detected.

## Non-Goals

- No `loop_candidates`.
- No click-risk.
- No seamless loop.
- No recipe or scene contract.
- No MIDI.
- No external analyzer, OpenAudio, AI generation, or arbitrary Lua.
- No `get_state(scope:"analysis")`.
- No new MCP tool.
- No core capability.

## Static Gates

- `npm run build`
- `npm test`
- `npm run check:error-codes-fresh`
- default `npm run check:manifest`
- `STREETLIGHT_ENABLED_PACKS=core,analysis npm run check:manifest`
- `STREETLIGHT_ENABLED_PACKS=core,analysis npm run check:template-authoring`
- all-pack manifest/template-authoring sweep including `analysis`
- `git diff --check`

## REAPER Live Smoke

Fully quit/reopen REAPER, then load:

```lua
_G.STREETLIGHT_ENABLED_PACKS = "core,analysis"
dofile("/Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/streetlight_bridge.lua")
```

Smoke:

1. `ping` connected.
2. `list_templates` returns 13 templates and exposes
   `item_audio_analyze`.
3. Generate a short WAV fixture with 4-6 obvious decaying hits.
4. Import/select the item.
5. Call `item_audio_analyze` with `features:["transients"]`.
6. Read artifact summary/payload.
7. Assert `computed_features:["transients"]`, count near fixture hit
   count, event times near known hits, and `transients_truncated:false`.
8. Call all four features and assert Slice 25 fields still sane.
9. Re-run LAST_RESULT anchor preservation.
10. Negative: empty/no-active-take item returns `AUDIO_SOURCE_OFFLINE`.
11. `get_state(scope:"analysis")` remains invalid/unimplemented.
12. Queue ends clean.

## Live Smoke Evidence

Verified on REAPER `7.71/macOS-arm64` with bridge `core,analysis`.

- Smoke stamp: `s26-live-1782918106518`
- Evidence file:
  `/var/folders/n5/dxh3rm291xq9js6hqjdhn1br0000gn/T/s26-live-1782918106518/evidence.json`
- Main transient ref:
  `artifact:analysis:analysis:art_20260701150148387_004_32fd49`
- All-feature ref:
  `artifact:analysis:analysis:art_20260701150150039_007_902d41`
- Track anchor:
  `guid:{1ACB4A98-FEC9-B440-90BC-42A5B6E8E445}`
- Analyzed item:
  `guid:{1CF4198D-B511-0548-8FF3-BA13AB42DD25}`
- Detected event times:
  `0.19737, 0.499229, 0.847528, 1.195828, 1.648617`
- `transient_count:5`, `transient_total_detected:10`,
  `transients_truncated:false`
- Actual `threshold_dbfs:-37.859`; floor `-60` exposed separately in
  payload and limits.
- Default analysis still omits `transients`.
- All-feature regression returned `loudness`, `peaks`, `silence`, and
  `transients`.
- Deleting the copied media source returned `AUDIO_SOURCE_OFFLINE`.
- Queue ended `pending=0`, `running=0`, `done=0`.

## Reviewer Focus

- Default behavior must not include transients.
- Artifact arrays must not leak into `call_template`.
- Events are bounded and JSON preflight remains enforced.
- Accessor cleanup still happens on success/error paths.
- Event `time` is item-local; `project_time` is explicit.
- No loop-candidate, click-risk, external analyzer, or core parking.
