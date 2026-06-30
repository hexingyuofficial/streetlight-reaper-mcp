# Slice 19 Architect Plan — H6 Closure: `track_color`

Date: 2026-07-01

Scope: H6 closure / first real template using the Slice 18 scaffolder
workflow. Land one low-risk template, `track_color`, end to end.

## Goal

Prove the H6 authoring loop works on a real template:

```text
scaffold dry-run -> agent fills implementation -> static gates -> REAPER live smoke
```

`track_color` sets or clears a REAPER track custom color without exposing
REAPER's platform-native color integer to agents.

## Non-Goals

- No FX, MIDI, routing, automation, or render templates.
- No new MCP tool.
- No new pack.
- No scaffolder write mode.
- No new error code.
- No bridge dispatcher change unless implementation proves it necessary.

## Template Contract

Template metadata:

```ts
entity_kind: "track"
risk: "write_safe"
mutates: true
undoable: true
undo_flags: ["TRACKCFG"]
idempotent: true
```

Params:

```ts
{
  track_id: string,
  color: "#RRGGBB" | null
}
```

Rules:

- `color:null` clears the custom color.
- `"#000000"` is black, not clear.
- Use uppercase hex in v0.1 to keep readback string comparison stable.

ExpectedDelta:

```ts
{
  count: 1,
  fields: [
    {
      scope: "track",
      field: "I_CUSTOMCOLOR_HEX",
      paramPath: "color",
      nullable: true,
    },
  ],
}
```

## REAPER API Decision

Use `SetMediaTrackInfo_Value(track, "I_CUSTOMCOLOR", value)`.

For set:

```lua
reaper.ColorToNative(r, g, b) | 0x1000000
```

For clear:

```lua
0
```

Do not use `SetTrackColor` in this slice; one setter path is easier to
verify and official unset behavior is expressed through `I_CUSTOMCOLOR`.

## Verify Decision

Add one narrow synthetic track field in `verify.lua`:
`I_CUSTOMCOLOR_HEX`.

Reader behavior:

- `I_CUSTOMCOLOR == 0` or missing `0x1000000` enabled bit -> `0`.
- Enabled color -> mask enabled bit, call `ColorFromNative`, return
  uppercase `#RRGGBB`.

This is intentionally not a general transform DSL.

## Files Touched

- `packages/mcp-server/src/templates/track-color.ts` — new template.
- `packages/mcp-server/src/templates/index.ts` — register one line.
- `packages/mcp-server/src/tools/__tests__/track-color.test.ts` — new
  fake-bridge tests.
- `packages/mcp-server/src/tools/__tests__/list-templates.test.ts` —
  aggregate metadata regression.
- `reaper/packs/core/templates/track.lua` — add `M.track_color`.
- `reaper/packs/core/manifest.lua` — add manifest entry.
- `reaper/packs/core/verify.lua` — add synthetic field reader.
- `scripts/__tests__/lua-structure.test.mjs` — lock Lua wiring.
- State docs after code drop / smoke.

## Static Gates

- `npm test`
- `npm run build`
- `npm run check:manifest`
- `npm run check:error-codes-fresh`
- `npm run check:template-authoring`
- `git diff --check`

## Live Smoke

Required because runtime Lua/manifest/verify changed.

Preflight:

1. Full quit/reopen REAPER.
2. Run current `start_bridge.lua`.
3. Confirm generation 1, loaded error codes, and 12 templates including
   `track_color`.

Recipe:

1. `ping` -> connected.
2. `list_templates` -> `track_color` metadata and expectedDelta field.
3. `track_create` `{ name:"S19 Track Color Smoke", reuse_existing:true }`.
4. `track_color` `{ track_id:"last_result:track:0", color:"#2D9CDB" }`.
5. `track_color` `{ track_id:"last_result:track:0", color:"#000000" }`.
6. `track_color` `{ track_id:"last_result:track:0", color:null }`.
7. `track_rename` on `last_result:track:0` to prove LAST_RESULT routing.
8. Negative: missing track ref -> `TRACK_NOT_FOUND`, not
   `INTERNAL_ERROR`.

Pass criteria:

- Locked call_template envelopes.
- `changed_count=1`.
- Same track GUID shape throughout.
- No `VERIFY_FAILED`.
- Queue cleanup ends clean.

Verification note (2026-07-01): the recipe passed on REAPER
`7.71/macOS-arm64` after full restart. Smoke stamp
`1782840178741`; track GUID
`guid:{016B7CED-64A7-1645-9AE2-E6E1547CA447}`. `track_color`
succeeded for `#2D9CDB`, `#000000`, and `null`; `track_rename
last_result:track:0` hit the same GUID; missing track returned typed
`TRACK_NOT_FOUND`; queue cleanup ended `pending=0`, `running=0`,
`done=0`.

## Risks

- OS-native color packing differs by platform; agent API must stay hex.
- `#000000` and clear must remain distinct.
- Lowercase hex would read back uppercase, so v0.1 rejects lowercase
  rather than adding normalization.
- Stale Lua chunks require a full REAPER restart before smoke.
