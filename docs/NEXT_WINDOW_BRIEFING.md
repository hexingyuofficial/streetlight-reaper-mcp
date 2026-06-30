# Next Window Briefing — 2026-07-01

Use this as the first read after a context reset. It is the current truth
after Slice 19 live smoke.

## Snapshot

- Repo: `/Users/Zhuanz/Documents/streetlight-reaper-mcp`
- Remote: `https://github.com/hexingyuofficial/OpenReaper.git`
- Branch: `main`; latest pushed checkpoint in this local view is Slice
  18: `88b0edf kernel-hardening: slice 18 dry-run template scaffolder`
- Slice 19 is the current uncommitted working tree. It is static-green
  and live-smoked on REAPER `7.71/macOS-arm64`; H6's basic loop is
  closed. Do not commit or push until the user explicitly asks.
- Public name: OpenReaper. Internal code paths and bridge names still use
  Streetlight.
- Do not commit, push, reset, branch, or rewrite history unless the user
  explicitly asks. User preference (2026-06-29): local commits are okay as
  explicit save points, but avoid pushing during work hours unless the user
  explicitly makes an exception.
- Do not stage or touch the nested ignored `style-memory-mcp/` project.

## Current Slice

Slice 19 implements **H6 closure — first real template from the
scaffolder workflow**.

What landed:

- New template: `track_color`
- New file:
  `packages/mcp-server/src/templates/track-color.ts`
- Registered in:
  `packages/mcp-server/src/templates/index.ts`
- New test file:
  `packages/mcp-server/src/tools/__tests__/track-color.test.ts`
- Runtime handler added in:
  `reaper/packs/core/templates/track.lua`
- Manifest entry added in:
  `reaper/packs/core/manifest.lua`
- Verify reader added in:
  `reaper/packs/core/verify.lua`
- Metadata/list regression updated in:
  `packages/mcp-server/src/tools/__tests__/list-templates.test.ts`
- Lua structure regression updated in:
  `scripts/__tests__/lua-structure.test.mjs`

`track_color` contract:

- `entity_kind: "track"`
- `risk: "write_safe"`
- `undoable: true`
- `undo_flags: ["TRACKCFG"]`
- `idempotent: true`
- params: `{ track_id: string, color: "#RRGGBB" | null }`
- `color:null` clears custom color.
- `"#000000"` is black, not clear.
- TS schema accepts uppercase hex only to keep field verification's
  string comparison stable.

Runtime behavior:

- Resolves the track before mutation.
- Parses hex before mutation.
- Sets custom color using:
  `SetMediaTrackInfo_Value(track, "I_CUSTOMCOLOR", ColorToNative(r,g,b) | 0x1000000)`
- Clears using `I_CUSTOMCOLOR = 0`.
- Returns the changed track GUID.

Verify behavior:

- Adds one narrow synthetic field: `I_CUSTOMCOLOR_HEX`.
- `I_CUSTOMCOLOR == 0` or missing enabled bit returns `0`.
- Enabled colors mask off `0x1000000`, use `ColorFromNative`, and return
  uppercase `#RRGGBB`.
- This is intentionally not a general transform DSL.

Static status:

- `npm test`: **357/357** green.
- `npm run build`: clean.
- `npm run check:manifest`: 12 templates aligned.
- `npm run check:error-codes-fresh`: 22 codes fresh.
- `npm run check:template-authoring`: 12 templates ok.
- `git diff --check`: clean.

Live smoke:

- Passed after a full REAPER quit/reopen and current `start_bridge.lua`
  load. Console showed generation 1, loaded error codes, and ready line
  with `track_color`.
- Smoke stamp: `1782840178741`.
- Track GUID: `guid:{016B7CED-64A7-1645-9AE2-E6E1547CA447}`.
- `track_create` created the smoke track; `track_color` succeeded for
  `#2D9CDB`, `#000000`, and `null`; `track_rename
  last_result:track:0` hit the same GUID; missing track returned typed
  `TRACK_NOT_FOUND`.
- Queue cleanup ended `pending=0`, `running=0`, `done=0`.

## Live Smoke Recipe Already Verified

Precondition:

1. Fully quit REAPER.
2. Reopen REAPER.
3. Run current `start_bridge.lua`.
4. Confirm console shows generation 1, loaded error codes, and ready line
   with `track_color` in templates.

Smoke recipe:

1. `ping` -> connected.
2. `list_templates` -> 12 templates; `track_color` has `write_safe`,
   `track`, `TRACKCFG`, `idempotent:true`, and expectedDelta field
   `track.I_CUSTOMCOLOR_HEX <- color`.
3. `track_create` `{ name:"S19 Track Color Smoke", reuse_existing:true }`.
4. `track_color` `{ track_id:"last_result:track:0", color:"#2D9CDB" }`
   -> ok, no `VERIFY_FAILED`.
5. `track_color` `{ track_id:"last_result:track:0", color:"#000000" }`
   -> ok, proves black != clear.
6. `track_color` `{ track_id:"last_result:track:0", color:null }`
   -> ok, proves clear.
7. `track_rename` `{ track_id:"last_result:track:0", name:"S19 Track Color Smoke Renamed" }`
   -> ok, proves `LAST_RESULT.tracks` still routes after `track_color`.
8. Negative: `track_color` with a missing track ref returns
   `TRACK_NOT_FOUND`, not `INTERNAL_ERROR`.

Pass criteria met:

- All successful calls return locked call_template envelope.
- `changed_count=1`, `changed_ids[0]` is the same track GUID shape.
- No `VERIFY_FAILED`.
- No stale bridge double-owner symptoms.
- Queue ends clean.

## Workflow To Continue

1. Read:
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/HANDOFF.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/PROGRESS.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/TEMPLATE_AUTHORING.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_PLAN.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_EXECUTION.md`
2. If asked to close Slice 19, rerun final static gates if desired, then
   commit. Push only after the user explicitly asks.
3. If asked for the next work item, request or read the next architect
   packet. H6's basic loop is closed; further factory automation needs a
   larger plan.

Keep the invariant sharp: each slice must make the kernel more reliable,
more testable, or harder to misuse, with a concrete local test and a live
REAPER smoke when runtime is affected.
