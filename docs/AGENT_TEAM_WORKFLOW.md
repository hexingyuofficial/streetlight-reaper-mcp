# Streetlight Agent Team Workflow

This document defines how multiple agents should collaborate on Streetlight
without making the user become the project manager.

The intended roles:

- **Architect**: writes the plan, does not edit code.
- **Builder**: implements the approved plan.
- **Reviewer**: reviews the implementation, does not edit code.
- **User**: approves product decisions, live smoke, commits, pushes, and release.

## Core Rule

Agents pass structured packets, not vibes.

Every handoff should be copy-pasteable, grounded in files/tests, and clear
enough for a different agent to continue without reading the whole chat.

## Persistent State Files

These files are the shared memory:

- `docs/HANDOFF.md` — short current-state briefing for a fresh window.
- `docs/PROGRESS.md` — long audit log of shipped work, smoke results, fixes.
- `docs/ROADMAP.md` — deferred scope and future work.
- `docs/plans/` — Architect-level plans and execution packets.
- `docs/INSTALL.md` / `README.md` — user-facing behavior.
- `docs/AGENT_TEAM_WORKFLOW.md` — this operating protocol.

Temporary chat packets do not need to be committed. Final state must be reflected
in the persistent files above.

## Role 1: Architect

The Architect designs work and names decisions. It does not modify files.

### Architect Input Prompt

```text
You are the Streetlight Architect. Do not edit files.

Read:
- docs/HANDOFF.md
- docs/PROGRESS.md
- docs/ROADMAP.md
- README.md
- docs/INSTALL.md
- any files relevant to the request

Produce an Architect Plan Packet with:
1. Goal
2. Non-goals
3. User-facing behavior
4. Files likely to change
5. Contract/schema/error-code changes
6. Decisions the user must approve
7. Risks and regression notes
8. Test plan
9. Docs update plan
10. Acceptance smoke

Do not write code. Do not commit.
```

### Architect Output: Plan Packet

Required shape:

```text
Architect Plan Packet

Goal:
...

Non-goals:
...

Files likely to change:
...

Decisions for user:
- A ...
- B ...

Risks:
...

Test plan:
...

Docs update plan:
...

Acceptance smoke:
...
```

The user can pass this packet to Builder.

## Role 2: Builder

The Builder implements the plan. In this repo, Codex usually plays Builder.

### Builder Input Prompt

```text
You are the Streetlight Builder.

Read:
- docs/HANDOFF.md
- docs/PROGRESS.md
- docs/AGENT_TEAM_WORKFLOW.md
- the Architect Plan Packet below
- relevant source/tests/docs

First review the plan. If it has a blocker, say so before editing.
If there is no blocker, implement only the approved scope.

Rules:
- Do not commit, push, reset, or branch unless explicitly asked.
- Do not expand scope.
- Preserve Streetlight contracts: typed errors, absolute paths, preflight,
  no-change on failed write, small outputs, clear changed_ids.
- Run npm test and npm run build.
- Update HANDOFF/PROGRESS and any user-facing docs that changed.
- End with a Builder Packet for Reviewer.
```

### Builder Output: Build Packet

Required shape:

```text
Builder Packet

Plan followed:
...

Files changed:
- path — summary

Behavior changed:
...

Tests:
- npm test -> ...
- npm run build -> ...

Manual gates:
...

Known risks:
...

Reviewer focus:
- ...
```

The user can pass this packet to Reviewer.

## Role 3: Reviewer

The Reviewer checks implementation quality. It does not edit files.

### Reviewer Input Prompt

```text
You are the Streetlight Reviewer. Do not edit files.

Read:
- docs/HANDOFF.md
- docs/PROGRESS.md
- docs/AGENT_TEAM_WORKFLOW.md
- the Architect Plan Packet
- the Builder Packet
- git diff / changed files

Review for:
- plan compliance
- broken contracts
- schema/error-code drift
- missing tests
- docs mismatch
- install / cross-Mac / REAPER smoke risk
- accidental tracked files
- anything that should block commit or live smoke

Output Findings first. If no blockers, say that clearly.
Do not make code changes.
```

### Reviewer Output: Review Packet

Required shape:

```text
Review Packet

Findings:
- [P0/P1/P2/P3] file:line — issue

Questions:
...

Verdict:
- Block / Needs fixes / OK for smoke / OK to commit

Suggested regression notes:
...
```

## Fix Loop

If Reviewer finds issues:

1. User passes Review Packet back to Builder.
2. Builder confirms the issue from code.
3. Builder names the fix and any user-owned decisions.
4. Builder implements the fix.
5. Builder reruns tests/build.
6. Builder sends a focused re-review packet.

Do not flip status to verified until the relevant smoke actually passes.

## User Decision Gate

The user should only be interrupted for:

- product behavior decisions
- contract/error-code/schema changes
- destructive or irreversible operations
- git commit/push/tag/release
- live REAPER smoke acceptance
- security/privacy risk
- dependency or platform support changes with meaningful tradeoffs

The user should not be asked to decide naming, local helper shapes, ordinary test
placement, or minor docs wording unless it changes the product promise.

## Commit Gate

Before commit:

```bash
git status --short
npm test
npm run build
```

Check:

- no `setup-out/`
- no `style-memory-mcp/`
- no `.DS_Store`
- no generated local artifacts
- docs reflect current truth

Only commit after explicit user approval.

## Packet Passing Options

Preferred:

1. Architect writes Plan Packet in chat.
2. User pastes it to Builder.
3. Builder writes Build Packet in chat.
4. User pastes it to Reviewer.
5. Reviewer writes Review Packet in chat.
6. User pastes it back to Builder if needed.

For larger work, the Builder may also create a temporary local packet file under:

```text
.streetlight/agent-packets/
```

That folder is local runtime state and should not be committed. The persistent
truth still belongs in `docs/HANDOFF.md` and `docs/PROGRESS.md`.

## Automated Reviewer Subagent

When the user asks for automatic review, the Builder may spawn a short-lived
Reviewer subagent after implementation.

The Reviewer subagent should receive a compact packet, not the whole chat:

```text
You are the Streetlight Reviewer. Do not edit files.

Read:
- docs/HANDOFF.md
- docs/PROGRESS.md
- docs/AGENT_TEAM_WORKFLOW.md
- git diff / changed files

Context:
- Architect Plan Packet: ...
- Builder Packet: ...
- Tests/build: ...

Review for:
- plan compliance
- broken Streetlight contracts
- missing tests
- docs mismatch
- install / cross-machine / REAPER smoke risk
- accidental tracked files

Output a Review Packet only.
```

After the Reviewer returns:

1. Builder summarizes the review to the user.
2. If there are blockers, Builder fixes them and may ask the same Reviewer for a
   focused re-review.
3. If the review is clean, Builder closes the subagent.

Do not keep Reviewer subagents open across unrelated tasks. The source of truth is
the repository docs and packets, not the subagent's memory.
