# Next Window Briefing — 2026-06-30

Use this as the first read after a context reset. It is the current truth during
Slice 15.

## Snapshot

- Repo: `/Users/Zhuanz/Documents/streetlight-reaper-mcp`
- Remote: `https://github.com/hexingyuofficial/OpenReaper.git`
- Branch: `main`; latest pushed commit is Slice 14:
  `56c57cb kernel-hardening: slice 14 idempotency tokens`
- Current local work: Slice 15 code-done/static-green/live-smoked, not
  committed.
- Public name: OpenReaper. Internal code paths and bridge names still use
  Streetlight.
- Do not commit, push, reset, branch, or rewrite history unless the user
  explicitly asks. New user preference: local commits are okay as explicit save
  points, but avoid pushing during work hours unless the user explicitly makes an
  exception.
- Do not stage or touch the nested ignored `style-memory-mcp/` project.

## Latest Verified Commit

Slice 14 is complete, live-smoked, committed, and pushed.

- `call_template` accepts optional caller-provided `idempotency_key`.
- Bridge DEDUP is in-memory FIFO, cap 256.
- Synchronous mutating templates replay successes and typed errors.
- `INTERNAL_ERROR` terminals are not stored.
- Replay does not call handlers, open undo, re-run H2 verify, or update
  `LAST_RESULT`.
- REAPER smoke run `slice14-1782815129961` passed on `7.71/macOS-arm64`.
- Commit-time gates: focused 83/83, full `npm test` 309/309, build clean,
  manifest clean, error-code audit clean, diff-check clean.

## Current Slice

Slice 15 implements H4 Phase 2: `render_region` deferred dedup.

What changed:

- `render_region` is no longer excluded from `dedup_eligible(cmd)`.
- The deferred slot carries `idempotency_key`.
- When deferred `close_with(inner)` reaches a terminal result, it stores the
  inner envelope in DEDUP before writing the done envelope, unless the inner
  error is `INTERNAL_ERROR`.
- Later same-key `render_region` calls replay before dispatch. They do not call
  the handler, enter `DEFERRED`, open render settings, delete sidecars, or update
  `LAST_RESULT.renders`.
- Successes and typed render errors are replayable.
- `INTERNAL_ERROR` is not stored, so the next same-key attempt re-executes.
- Stale-WAV semantics are explicit: if the original WAV is deleted, replay still
  returns the stored path. A fresh render attempt requires a fresh key.
- `render_region.idempotent=false` stays unchanged; DEDUP is transport-level
  retry safety, not semantic idempotency.

Static status:

- Focused suite: 74/74 green.
- Full `npm test`: 313/313 green.
- `npm run build`: clean.
- `npm run check:manifest`: green, 11 templates aligned.
- `npm run check:error-codes-fresh`: green, 22 codes fresh.
- `git diff --check`: clean.

Reviewer + live smoke:

- Reviewer Meitner found no P1/P2/P3 issues.
- REAPER live smoke passed on `7.71/macOS-arm64`.
- Main run id: `slice15-1782819968415`.
- Extra LAST_RESULT proof: `slice15-lastresult-1782820030902`.
- Core proof: keyed `render_region` first rendered
  `/var/folders/n5/dxh3rm291xq9js6hqjdhn1br0000gn/T/slice15-1782819968415/renders/slice15-1782819968415-region-a.wav`;
  same-key replay returned the same path with unchanged size/mtime
  (`101536`, `1782819975510.6753`).
- Typed render error replay passed for `OUTPUT_DIR_MISSING`.
- `OUTPUT_FILE_EXISTS` terminal lock replayed after conflict removal; a fresh key
  rendered successfully.
- Replay did not update `LAST_RESULT.renders`; an anchored
  `LAST_RESULT.tracks` survived render replay and
  `track_rename last_result:track:0` succeeded afterward.
- Representative regressions passed: synchronous Slice 14 dedup, typed
  `ITEM_NOT_FOUND` replay, `track_create`, `media_import
  last_result:track:0`, `get_state tracks include:["fx"]`, and render sidecar
  cleanup.
- Queue cleanup ended `pending=0`, `running=0`, `done=0`; only `bridge_owner`
  remained.
- Bridge-reload-clears-DEDUP was not live-run to avoid disrupting the user's
  active generation-1 bridge. DEDUP is still chunk-local / bridge-lifetime
  scoped by construction.

## Workflow To Continue

1. Read:
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/HANDOFF.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/PROGRESS.md`
   - `/Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/SLICE_15_ARCHITECT_PLAN.md`
2. Slice 15 is ready for commit when the user explicitly asks.
3. If the user asks for the next hardening step, wait for or request the next
   Architect packet before coding.
4. Commit only after the user explicitly asks. Push only if the user explicitly
   asks and it is not inside their work-hours no-push window, unless they make a
   clear exception.

Keep the invariant sharp: each slice must make the kernel more reliable, more
testable, or harder to misuse, with a concrete local test and live REAPER smoke.
