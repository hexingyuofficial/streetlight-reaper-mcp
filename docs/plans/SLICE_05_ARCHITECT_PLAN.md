# Architect Plan Packet — Slice 05

Role: Architect packet, no code by itself. Source: Architect handoff
on 2026-06-29. Scope locked by the user: H5 closeout, Lua
handler/bridge error-code migration to generated constants.

## Goal

Close the last social-contract gap in invariant I4:

- load `reaper/packs/core/error_codes.lua` in the bridge at startup;
- pass the generated table to handlers as `ctx.errs`;
- attach the same table to `refs.lua`;
- replace Lua protocol error-code string literals with generated
  `ERRS.*` / `ctx.errs.*` constants;
- tighten static audit so runtime Lua files cannot reintroduce
  string-literal protocol error codes.

User-facing behavior must remain unchanged: same wire codes, same
messages, same recoverability, same envelope shapes.

## Non-Goals

- No field-level verification.
- No idempotency token.
- No template scaffold/factory.
- No changes to `packages/core/src/errors.ts`.
- No changes to `manifest.lua`, undo metadata, Zod schemas, MCP tool
  surfaces, or template descriptors.
- No message-copy rewrites; only the source of the `code` value moves.

## Decisions

- D1: audit strictness is fully strict for runtime Lua. The only
  allowed string-literal error-code definitions are in generated
  `error_codes.lua`; boot failures use plain `error("...")` strings,
  not protocol code literals.
- D2: bridge dofile's `error_codes.lua` once. Handlers receive it via
  `ctx.errs`; `refs.lua` receives it via `M.attach_errs(errs)`.
- D3: keep existing local `raise(code, message)` helpers. Do not add a
  global raise helper until H6 scaffold/factory work.

## Implementation Shape

Lua:

- `reaper/streetlight_bridge.lua`
  - `local ERRS = dofile(SCRIPT_DIR .. "packs/core/error_codes.lua")`
  - validate the generated table has 22 key/value-identical entries;
  - call `refs.attach_errs(ERRS)`;
  - add `errs = ERRS` to template `ctx`;
  - replace bridge envelope codes with `ERRS.*`;
  - log `loaded error_codes (22 codes)` during startup/ready.
- `reaper/packs/core/refs.lua`
  - expose `M.attach_errs(errs)`;
  - keep resolver APIs unchanged;
  - return generated `ERRS.*` constants in the existing `(nil, code,
    message)` slots.
- `reaper/packs/core/templates/{item,track,region,media,render}.lua`
  - keep handler structure and local `raise`;
  - source all raised protocol codes from `ctx.errs.*` or resolver
    returns;
  - pass `errs` into helpers that can raise internal errors.

Scripts/tests:

- `scripts/error-codes.mjs check` verifies:
  - generated Lua is fresh against `packages/core/src/errors.ts`;
  - unknown Lua literal codes are rejected;
  - known runtime literal usage is rejected in `code = "FOO"`,
    `raise("FOO")`, `raise(code or "FOO")`, and
    `return nil, "FOO"` shapes.
- `scripts/__tests__/error-codes.test.mjs` covers parser/audit
  behavior.
- `scripts/__tests__/lua-structure.test.mjs` guards bridge boot wiring,
  refs attachment, `ctx.errs`, and zero runtime literal usage.

## Acceptance Smoke

Requires a full REAPER quit/reopen before loading the current
`start_bridge.lua`, because this slice changes the bridge boot path.
The REAPER console must include `loaded error_codes (22 codes)`.

Minimum live smoke:

1. `ping` → connected on the current bridge.
2. `item_pitch item_id:"selected:99" semitones:0` →
   `ITEM_NOT_FOUND`.
3. `media_import path:"/no/such/file" track_id:"track:<smoke>"
   position:0` → `MEDIA_NOT_FOUND`.
4. `region_create name:"a/b" start:0 end:1` →
   `REGION_NAME_INVALID`.
5. `track_rename track_id:"selected:0" name:"x"` → `REF_INVALID`.
6. `render_region region_id:"region:doesnotexist"
   output_dir:"<existing tmpdir>"` → `REGION_NOT_FOUND`.
7. Raw-queue mismatch probe for a synchronous template →
   `VERIFY_FAILED`, `recoverable:false`, structured details, and the
   required get_state recovery phrase.
8. One happy mutation, such as `track_create`, returns the same locked
   success envelope shape and writes `LAST_RESULT` as before.

Any wire code unexpectedly degrading to `INTERNAL_ERROR` is a failure.

## Regression Notes

- Full REAPER restart is required. Plain ReaScript re-run may leave a
  stale pre-Slice-05 chunk claiming queue files without `ctx.errs`.
- Static audit is intentionally shape-based, not a Lua parser. If
  future handlers introduce a new error-raising shape, update
  `scripts/error-codes.mjs` in the same slice.
- Boot validation hard-codes the current 22-code count so a stale or
  hand-edited generated table fails before the bridge claims work.
