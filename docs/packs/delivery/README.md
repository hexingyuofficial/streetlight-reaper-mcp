# Delivery Pack

The `delivery` pack is opt-in:

```sh
STREETLIGHT_ENABLED_PACKS=core,cleanup,delivery
```

It closes the smallest deliverable loop without adding a new renderer:

1. `delivery_plan` writes `artifact:delivery:plan:<id>` describing one
   region's expected WAV path.
2. The agent calls existing `render_region`.
3. `delivery_report` reads the plan payload and writes
   `artifact:delivery:report:<id>` with pass/fail file checks.

Both templates are read-only with respect to the REAPER project. They
write JSON artifacts only and do not update item/track/region
`LAST_RESULT`.

## Templates

`delivery_plan`

- params: `{ region_id, output_dir, cleanup_plan_ref?, cleanup_fingerprint? }`
- schema: `openreaper.delivery_plan.v1`
- rejects bad region names using the shared region-name rule
- preflights `output_dir` with `OUTPUT_DIR_MISSING` /
  `OUTPUT_DIR_NOT_WRITABLE`

`delivery_report`

- params: `{ delivery_plan_ref }`
- schema: `openreaper.delivery_report.v1`
- reads the plan through `get_state` artifact storage semantics
- validates: expected file exists, non-empty, `.wav`, expected path/name,
  no `.RPP` / `.RPP-bak`, and RIFF/WAVE header
- writes fail reports for validation failures such as missing output WAV
- propagates missing/corrupt/oversized plan artifacts as typed call
  errors

## Explicitly Deferred

No mastering, loudness correction, multi-format packaging, upload,
delivery presets, destructive cleanup, MIDI, audio analysis, or
`render_region` JSON migration lives here.
