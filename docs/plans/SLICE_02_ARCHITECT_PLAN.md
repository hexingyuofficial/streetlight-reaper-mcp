# Architect Plan Packet — Slice 02

Source: `docs/plans/KERNEL_HARDENING_PLAN.md`, `docs/plans/KERNEL_HARDENING_EXECUTION.md`, `docs/plans/SLICE_01_ARCHITECT_PLAN.md`, and `docs/RESPONSE_BUDGET.md`.

Slice 01 shipped H1 data-driven entity buckets plus H3 readonly `get_state(project)`, `get_state(tracks)`, and `get_state(regions)`. Slice 02 extends only the `tracks` read scope with an opt-in FX projection.

## Goal

Add `get_state({ scope: "tracks", include: ["fx"] })` so agents can discover track-level FX chains without touching `LAST_RESULT`, without adding writes, and without breaking the response-budget envelope.

Default `get_state(tracks)` behavior must remain Slice-01-compatible: track descriptors omit the `fx` field unless the caller explicitly asks for it.

## Non-Goals

- No `fields` projection.
- No `cursor` pagination.
- No `get_state(render)`.
- No take FX or item FX reads.
- No FX parameter reads.
- No FX write templates.
- No H2/H4/H5/H6/H7 work.
- No changes to the five MCP tools, existing mutating templates, manifest, refs, entity buckets, undo, or template handlers.

## User-Facing Behavior

- `get_state(tracks)` returns the same track descriptors Slice 01 returned, with no `fx` field.
- `get_state(tracks, include:["fx"])` adds `fx: FxDescriptor[]` to every track descriptor. Tracks with no FX return `fx: []`.
- `include` is a strict array; the only legal v0.1 value is `"fx"`.
- Unknown include values return `PARAMS_INVALID`.
- Non-`tracks` scopes with a non-empty include return `PARAMS_INVALID`, including `get_state(render, include:["fx"])`. This takes priority over `SCOPE_NOT_IMPLEMENTED`.
- `get_state(render)` with no include remains `SCOPE_NOT_IMPLEMENTED`.
- Read scopes still do not touch `LAST_RESULT`.

## Contract Shape

Input schema:

```ts
{
  scope: GetStateScope.default("selection"),
  limit: z.number().int().min(1).max(200).default(50),
  include: z.array(z.enum(["fx"])).optional(),
}
```

`FxDescriptor` v1:

```json
{
  "index": 0,
  "name": "VST: ReaEQ (Cockos)",
  "ident": "VST: ReaEQ (Cockos)<1920167789>",
  "enabled": true,
  "preset_name": ""
}
```

Rules:

- `index` is the zero-based FX slot index within the track; it is not a stable ref.
- `name`, `ident`, and `preset_name` use `""` when REAPER cannot provide a value.
- Do not return `null` for missing strings.
- The FX array is part of the track descriptor. Its encoded bytes count toward that track's response-budget decision.
- If a single track descriptor including its FX chain exceeds `MAX_RESPONSE_BYTES`, return `RESPONSE_TOO_LARGE`.

## ReaScript API Notes

Use official REAPER ReaScript APIs:

- FX count: `reaper.TrackFX_GetCount(track)`.
- Name: `reaper.TrackFX_GetFXName(track, fx, "")`.
- Ident: `reaper.TrackFX_GetNamedConfigParm(track, fx, "fx_ident")`.
- Enabled: `reaper.TrackFX_GetEnabled(track, fx)`.
- Preset: `reaper.TrackFX_GetPreset(track, fx, "")`.

There is no `TrackFX_GetFXIdent`; do not invent it.

If an API is missing or a call fails, default the affected field (`""` or `false`) and keep the read alive.

## Locked Decisions

- D-A: Ship `include:["fx"]`; keep `fields` and `cursor` out of the schema.
- D-B: `FxDescriptor` v1 is `{index, name, ident, enabled, preset_name}` only.
- D-C: Non-`tracks` scopes with non-empty include return `PARAMS_INVALID`.
- D-D: Without `"fx"` in include, track descriptors omit `fx`.
- D-E: Do not implement `get_state(render)`.
- D-F: Do not implement take FX or item FX.
- D-G: Field name is `fx`.
- D-H: `include` is always an array.
- D-I: Slice 02 extends only `tracks`.

## Test Plan

TS/fake-bridge:

- Default tracks call omits `include` on the wire and accepts descriptors without `fx`.
- `include: []` is accepted and does not imply FX.
- `include:["fx"]` reaches the bridge and parses `FxDescriptor[]`, including `preset_name: ""`.
- Unknown include values return `PARAMS_INVALID` before hitting the bridge.
- `include:["fx"]` on `selection`, `project`, `regions`, or `render` returns `PARAMS_INVALID` before hitting the bridge.
- Truncated tracks-with-FX envelopes parse correctly.
- Bridge-surfaced `RESPONSE_TOO_LARGE` still passes through.

Lua/live:

- S0 `ping` returns connected.
- S1 `get_state(project)` remains green.
- S2 `get_state(tracks)` descriptors do not contain `fx`.
- S3 Add a real track FX, preferably ReaEQ. `get_state(tracks, include:["fx"])` returns `fx[0].index === 0`, name containing the FX, non-empty `ident`, `enabled === true`, and `preset_name === ""`.
- S4 `get_state(tracks, include:["fx","midi"])` returns `PARAMS_INVALID`.
- S5 `get_state(regions, include:["fx"])` returns `PARAMS_INVALID`.
- S6 `get_state(render, include:["fx"])` returns `PARAMS_INVALID`, not `SCOPE_NOT_IMPLEMENTED`.
- S7 Read FX, then mutate with `last_result:track:0` from a previous `track_create`; it must still work, proving reads did not touch `LAST_RESULT`.
- S8 `get_state(render)` without include remains `SCOPE_NOT_IMPLEMENTED`.
- S9 Select a preset on the FX and confirm `preset_name` becomes non-empty.
- S10 Probe a larger FX project and record whether truncation/`RESPONSE_TOO_LARGE` behavior is sensible. This is a baseline observation, not a strict pass/fail gate unless the signal is clearly wrong.

## Docs Plan

Update:

- `docs/RESPONSE_BUDGET.md` with the optional track `fx` shape and include error-priority rule.
- `docs/HANDOFF.md` with Slice 02 status and next smoke path.
- `docs/PROGRESS.md` with code-drop / verification section.
- `docs/ROADMAP.md` so v0.2 says Slice 02 ships only track FX include while `fields`, `cursor`, `get_state(render)`, take/item FX, FX params, and FX writes remain deferred.

