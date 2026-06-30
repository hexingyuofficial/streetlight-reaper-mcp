# Slice 14 Architect Plan — H4 Idempotency Tokens Phase 1

Date: 2026-06-30

Source packet: Architect proposal pasted into Codex after Slice 13 baseline
`f998507`. User signed D1-D10 as the recommended values.

## Goal

Add caller-provided idempotency keys to the queue protocol so a mutating
template retry can replay the first terminal result instead of double-applying
the mutation.

This is a transport-level reliability feature, not a template semantics flag.
It is orthogonal to each template's `idempotent` metadata.

## Locked Decisions

- D1=a: Slice 14 is H4 Phase 1 — wire field plus bridge DEDUP table.
- D2=a: keys are caller-provided only; no MCP-server auto-keying in v0.1.
- D3=a: bridge DEDUP table is bounded FIFO with cap `256`.
- D4=a: key validation is `1..128` ASCII-printable chars, no control bytes.
- D5=a: DEDUP clears on bridge reload / REAPER restart; document as v0.1 limit.
- D6=a: same key plus different params silently replays the first result.
- D7=a: read kinds accept/ignore keys at the wire level; public read MCP tools do
  not expose a new parameter in this slice.
- D8=a: `INTERNAL_ERROR` terminals are not stored; retry re-executes.
- D9=a: typed errors, including `VERIFY_FAILED`, are stored and replayed.
- D10=a: no special interaction with Slice 13 `bridge_owner`; DEDUP is
  chunk-local to the current owner.

## Scope

Code changes:

- `packages/core/src/queue.ts`
  - Add optional `QueueCommand.idempotency_key`.
- `packages/mcp-server/src/transport/file-queue.ts`
  - Thread `SendOptions.idempotencyKey` into on-disk command JSON when present.
  - Omit the field entirely when absent.
- `packages/mcp-server/src/tools/call-template.ts`
  - Add optional `idempotency_key` to `call_template` input.
  - Validate key length/charset before queue write.
  - Keep risk-policy and params validation order intact.
  - Warn if a key is supplied to `render_region`, which remains a carve-out.
- `reaper/streetlight_bridge.lua`
  - Add in-memory `DEDUP[key] = inner envelope` plus FIFO order cap.
  - Check DEDUP after pending->running claim and before dispatch.
  - Replay stored inner with fresh outer `id` and `completed_at`.
  - Store successes and typed errors.
  - Do not store `INTERNAL_ERROR`.
  - Do not touch read paths or `tick_deferred`.

Docs/tests:

- Add queue, file-queue, call-template, fake-bridge, and Lua-structure tests.
- Update template spec, kernel plans, progress/handoff, roadmap, and response
  budget notes.

## Non-Goals

- No dedup for `render_region` in this slice.
- No persistence across bridge reload.
- No new error codes such as `IDEMPOTENCY_KEY_CONFLICT`.
- No param-hash conflict detection.
- No auto-generated keys.
- No change to `expectedDelta`, `verify.lua`, templates, manifest, refs, error
  codes, recipes, setup scripts, or installers.

## Runtime Semantics

Eligible commands:

- `kind == "template"`
- non-empty `idempotency_key`
- template name is not `render_region`

Replay:

- Does not call the handler.
- Does not enter undo.
- Does not re-run H2 verification.
- Does not update `LAST_RESULT`.
- Writes a normal done envelope with the current command id and current
  `completed_at`.

Storage:

- Success inner envelopes are stored.
- Typed error inner envelopes are stored.
- `INTERNAL_ERROR` inner envelopes are skipped.

Read paths:

- `ping`, `get_state`, `list_templates`, and `list_recipes` do not touch DEDUP.

## Live Smoke Must Prove

- No-key baseline commands behave exactly as Slice 13.
- Same key + same params on `item_pitch` applies once and replays once.
- Typed error replay works.
- `LAST_RESULT` is not polluted by replay.
- `render_region` executes twice with the same key.
- Read kinds ignore keys.
- Different keys execute independently.
- Bridge reload clears DEDUP.
- Slice 06-13 H2 regressions still pass.
