# Delivery Closure Smoke

This smoke verifies Slice 24 with a real REAPER bridge.

## Preconditions

Fully quit and reopen REAPER, then load:

```lua
_G.STREETLIGHT_ENABLED_PACKS = "core,cleanup,delivery"
dofile("/Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/streetlight_bridge.lua")
```

The ready line should include `delivery_plan` and `delivery_report`.

## Recipe

1. `ping` and confirm `bridge:connected`.
2. `list_templates`; assert both delivery templates have `pack:"delivery"`
   and JSON artifact metadata.
3. Create a fresh output directory under `/tmp`.
4. Create a safe region, for example `S24 Delivery <stamp>`.
5. Optional provenance: run `cleanup_plan`, read its payload, and pass
   `cleanup_plan_ref` / `cleanup_fingerprint` into `delivery_plan`.
6. Call `delivery_plan` with the region and output directory.
7. Read plan payload via `get_state(scope:"artifact", view:"payload")`;
   expected filename must be `<region_name>.wav`.
8. Anchor a track in `LAST_RESULT`, call `delivery_plan`, then
   `track_rename last_result:track:0`; it should still hit the track.
9. Call existing `render_region` for the same region/output_dir.
10. Call `delivery_report` with the original `delivery_plan_ref`.
11. Read report payload. Expected:
    - `overall_status:"pass"`
    - file exists and size > 0
    - extension `.wav`
    - planned filename/path match
    - zero `.RPP` / `.RPP-bak`
    - WAV header check passes
    - stale check passes
12. Anchor a track again, call `delivery_report`, then
    `track_rename last_result:track:0`; it should still hit the track.
13. Negative: create another plan but do not render. `delivery_report`
    should succeed as a call and write a report artifact with
    `overall_status:"fail"`.
14. Negative stale: create a plan, change the planned region/project, then
    report the old plan. The report should be `overall_status:"fail"`.
15. Confirm queue directories end clean: `pending=0`, `running=0`,
    `done=0`.
