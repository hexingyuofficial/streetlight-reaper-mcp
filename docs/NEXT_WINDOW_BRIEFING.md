# Next Window Briefing — 2026-06-30

Use this as the first read after a context reset. It is the current truth during
Slice 14.

## Snapshot

- Repo: `/Users/Zhuanz/Documents/streetlight-reaper-mcp`
- Remote: `https://github.com/hexingyuofficial/OpenReaper.git`
- Branch: `main`; latest pushed commit is Slice 13:
  `f998507 kernel-hardening: slice 13 region-create bounds checks`
- Current local work: Slice 14 code-done/static-green/live-smoked, not
  committed.
- Public name: OpenReaper. Internal code paths and bridge names still use
  Streetlight.
- Do not commit, push, reset, branch, or rewrite history unless the user
  explicitly asks.
- Do not stage or touch the nested ignored `style-memory-mcp/` project.

## Latest Verified Commit

Slice 13 is complete, live-smoked, committed, and pushed.

- `region_create` verifies explicit bounds `[name,pos,rgnend]`.
- The mid-smoke double-owner bug was fixed with file-backed
  `bridge_owner`.
- REAPER smoke run `slice13-1782809548082` passed on
  `7.71/macOS-arm64`.
- Commit-time gates: `npm test` 293/293, build clean, manifest clean,
  error-code audit clean, diff-check clean.

## Current Slice

Slice 14 implements H4 Phase 1 idempotency tokens and has passed live
REAPER smoke.

What changed:

- `call_template` accepts optional `idempotency_key`.
- Keys are 1-128 ASCII-printable chars; control bytes are rejected with
  `PARAMS_INVALID` before queue write.
- `QueueCommand.idempotency_key` is distinct from command `id`.
- The bridge owns an in-memory FIFO `DEDUP` table capped at 256 entries.
- Eligible synchronous templates replay stored inner envelopes on a key hit.
- Successes and typed errors are stored.
- `INTERNAL_ERROR` terminals are not stored.
- `render_region` and read paths are carved out.
- Replay does not call handlers, open undo, re-run H2 verify, or update
  `LAST_RESULT`.
- DEDUP clears on bridge reload / REAPER restart.
- Reviewer caught and fixed one P1: the public MCP server `call_template`
  entrypoint in `packages/mcp-server/src/index.ts` now exposes and forwards
  `idempotency_key`; `scripts/__tests__/mcp-index.test.mjs` guards it.

Static status:

- Focused suite: 83/83 green.
- Full `npm test`: 309/309 green.
- `npm run build`: clean.
- `npm run check:manifest`: green, 11 templates aligned.
- `npm run check:error-codes-fresh`: green, 22 codes fresh.
- `git diff --check`: clean.

Live smoke:

- Run id: `slice14-1782815129961`.
- Queue: `/Users/Zhuanz/Library/Application Support/Streetlight/queue`.
- REAPER: `7.71/macOS-arm64`.
- Passed: S0 ping; S1 template metadata; no-key
  `track_create` -> `media_import last_result:track:0`; same-key
  `item_pitch` replay with pitch not double-applied; typed
  `ITEM_NOT_FOUND` replay; `LAST_RESULT` preservation; `render_region`
  same-key carve-out; read-path key carve-out; different-key/no-key
  behavior; Slice 06-13 representative regressions.
- Cleanup: temp render dir removed; queue ended `pending=0`,
  `running=0`, `done=0`; `bridge_owner` may remain.

## Workflow To Continue

1. Read:
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/HANDOFF.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/PROGRESS.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/SLICE_14_ARCHITECT_PLAN.md`
2. Ask reviewer subagent for Slice 14 review if still needed.
3. Commit and push only after the user explicitly says so.

## Live REAPER Evidence

- User preflight showed `bridge starting (generation 1)`, `loaded
  error_codes (22 codes)`, and `bridge ready (generation 1)`.
- Smoke covered the required Slice 14 focus: no-key baseline, same-key
  `item_pitch`, typed error replay, `LAST_RESULT` preservation,
  `render_region` and read-path carve-outs, different-key/no-key
  behavior, and Slice 06-13 representative regressions.
- Do not repeat live smoke unless a new code change or user request makes
  it useful.

Keep the invariant sharp: each slice must make the kernel more reliable, more
testable, or harder to misuse, with a concrete local test and live REAPER smoke.
