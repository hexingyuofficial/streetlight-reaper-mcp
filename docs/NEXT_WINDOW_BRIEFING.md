# Next Window Briefing — 2026-07-01

Use this as the first read after a context reset. It is the current truth
after Slice 20B live smoke.

## Snapshot

- Repo: `/Users/Zhuanz/Documents/streetlight-reaper-mcp`
- Remote: `https://github.com/hexingyuofficial/OpenReaper.git`
- Branch: `main`; latest pushed checkpoint is Slice 19:
  `e54fd9c kernel-hardening: slice 19 track color template`
- Slice 19 is committed and pushed. It is static-green and live-smoked
  on REAPER `7.71/macOS-arm64`; H6's basic loop is closed.
- Slice 20B (Phase 0.5 Pack Contract Foundation) is in the current
  working tree, not yet committed or pushed. It is reviewer-passed,
  static-green, and live-smoked. Static gates: `npm test` 376/376,
  `npm run build` clean,
  `npm run check:error-codes-fresh` 22 codes fresh, default
  `npm run check:manifest` 12 templates across 1 pack,
  `STREETLIGHT_ENABLED_PACKS=core,pack_contract_fixture npm run check:manifest`
  13 templates across 2 packs, default `npm run check:template-authoring`
  12 templates, fixture-enabled `check:template-authoring` 13 templates,
  and `git diff --check` clean. Reviewer follow-up fixed two contract
  issues: non-core packs cannot introduce new entity kinds in Slice 20B,
  and recipe ids must be unambiguous lower_snake_case with duplicate
  `qualified_id`s skipped as warnings. Live smoke passed with fixture
  enabled; stamp `1782881931841`, track GUID
  `guid:{76CC9D4E-3F98-CE4E-B02A-A34C0F03D870}`.
- Post-H6 first-real-version planning now lives in
  `docs/plans/OPENREAPER_FIRST_REAL_VERSION_EXECUTION_PLAN.md`. Treat it
  as the authoritative guide for Slice 20+ scope, gates, verification,
  and phase order.
- Public name: OpenReaper. Internal code paths and bridge names still use
  Streetlight.
- Do not commit, push, reset, branch, or rewrite history unless the user
  explicitly asks. User preference (2026-06-29): local commits are okay as
  explicit save points, but avoid pushing during work hours unless the user
  explicitly makes an exception.
- Do not stage or touch the nested ignored `style-memory-mcp/` project.

## Current Slice

Slice 20B implements **Phase 0.5 Pack Contract Foundation**. It prevents
cleanup / loop / MIDI / routing / FX / unsafe capabilities from becoming
a parking lot inside `core`.

What changed in the current working tree:

- New pack parsing helpers in `packages/core/src/packs.ts`.
- `packages/mcp-server/src/templates/index.ts` keeps
  `registerCoreTemplates(...)` and adds `registerEnabledTemplates(...)`.
- MCP startup reads `STREETLIGHT_ENABLED_PACKS` and logs enabled packs.
- `list_templates` stays bridge-free and exposes pack ownership through
  existing metadata; fixture pack is hidden by default and appears only
  when explicitly enabled.
- `list_recipes` now returns `recipe_roots[]`, pack ownership, and
  `qualified_id = "<pack>:<id>"`; default remains core recipes.
- `scripts/manifest-alignment.mjs` and
  `scripts/template-authoring-lint.mjs` are pack-aware.
- New Lua loader:
  `reaper/packs/core/lib/pack_loader.lua`.
- `reaper/streetlight_bridge.lua` loads static enabled packs instead of
  hard-coding `core` only.
- New test-only fixture pack:
  `reaper/packs/pack_contract_fixture/`,
  `packages/mcp-server/src/packs/pack-contract-fixture/`, and
  `docs/packs/pack_contract_fixture/README.md`.
- New plan file:
  `docs/plans/SLICE_20B_PACK_CONTRACT_ARCHITECT_PLAN.md`.

Do not ship fixture pack by default. Enable only for verification:

```sh
STREETLIGHT_ENABLED_PACKS=core,pack_contract_fixture npm run check:manifest
STREETLIGHT_ENABLED_PACKS=core,pack_contract_fixture npm run check:template-authoring
```

For REAPER live smoke, set this before loading `start_bridge.lua`:

```lua
_G.STREETLIGHT_ENABLED_PACKS = "core,pack_contract_fixture"
```

Then `list_templates` should show 13 templates including
`fixture_track_rename`, `list_recipes` should include
`pack_contract_fixture:fixture_pack_smoke`, and
`call_template fixture_track_rename` should rename a track while routing
`LAST_RESULT.tracks` exactly like core track templates.

Live-smoke evidence:

- REAPER `7.71/macOS-arm64`.
- Bridge loaded `core` (12 templates) and `pack_contract_fixture`
  (1 template); ready line included `fixture_track_rename`.
- `ping` connected.
- Fixture-enabled `list_templates` returned 13 templates; `track_color`
  stayed `pack:"core"` and `fixture_track_rename` reported
  `pack:"pack_contract_fixture"`.
- Fixture-enabled `list_recipes` returned
  `core:impact_variations` and
  `pack_contract_fixture:fixture_pack_smoke` with zero warnings.
- `track_create` created
  `guid:{76CC9D4E-3F98-CE4E-B02A-A34C0F03D870}`.
- `track_color last_result:track:0`, `fixture_track_rename
  last_result:track:0`, and core `track_rename last_result:track:0`
  all returned the same GUID, proving cross-pack `LAST_RESULT.tracks`
  routing.
- `fixture_track_rename` with a missing GUID returned typed
  `TRACK_NOT_FOUND`.
- Default core-only registry returned 12 templates, fixture absent, and
  `call_template fixture_track_rename` returned `TEMPLATE_NOT_FOUND`
  before queue write.
- Queue cleanup ended `pending=0`, `running=0`, `done=0`.

## Previous Slice

Slice 19 implemented **H6 closure — first real template from the
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
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/OPENREAPER_FIRST_REAL_VERSION_EXECUTION_PLAN.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_PLAN.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_EXECUTION.md`
2. If asked for the next work item, request or read the next architect
   packet. H6's basic loop is closed; further factory automation needs a
   larger plan.

## Rolling Slice Workflow

Use this workflow for Slice 20+ unless the user explicitly overrides it.

1. **Architect owns plans.** Codex should not invent a large slice in
   chat. When the current slice is complete, ask the user for the next
   architect packet prompt / command. The user will feed that to the
   architect agent and paste the resulting plan back here.
2. **Codex executes.** Once the user approves a packet's decisions,
   Codex implements the slice in this repo, following the packet and the
   first-real-version plan. Keep the slice within G15's complexity
   budget; split if it grows beyond one primary contract/capability.
3. **Codex pulls reviewer and smoke.** Codex is responsible for spawning
   reviewer / smoke subagents when useful. Reviewer checks code and
   contracts; smoke verifies static gates and, when runtime changed, the
   REAPER live-smoke recipe. Do not make the user manually coordinate
   those agents.
4. **User handles key decisions and final acceptance.** Ask the user only
   for contract/schema/risk/product decisions or final sign-off. Avoid
   blocking on implementation details Codex can decide from the plan and
   existing patterns.
5. **Docs move during the slice.** Update `HANDOFF.md`, `PROGRESS.md`,
   `NEXT_WINDOW_BRIEFING.md`, and the slice plan as status changes, so a
   context reset can resume without archaeology.
6. **Commit locally, do not push by default.** After code, reviewer,
   static gates, docs, and required live smoke are green, make a local
   commit only when the user asks. Do not push unless the user explicitly
   asks for push.

Keep the invariant sharp: each slice must make the kernel more reliable,
more testable, or harder to misuse, with a concrete local test and a live
REAPER smoke when runtime is affected.
