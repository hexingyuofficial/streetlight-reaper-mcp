# Slice 18 Architect Plan — H6 Phase 2: Dry-Run Template Scaffolder

Date: 2026-06-30

Scope: H6 Phase 2. Introduce a minimal, dry-run-only template
scaffolder CLI. It helps authors start a new template from one explicit
descriptor, but it does not write files and does not add a real template.

## Goal

Add `scripts/scaffold-template.mjs` and `npm run scaffold:template` so an
author can run:

```bash
npm run scaffold:template -- \
  --name track_color \
  --entity-kind track \
  --risk write_safe \
  --undoable true \
  --undo-flags TRACKCFG \
  --idempotent true \
  --dry-run
```

The command validates the descriptor and prints a deterministic plan:

- normalized metadata;
- files it would create;
- files the author must manually modify;
- TS skeleton using `defineTemplate(...)`;
- Lua handler TODO;
- `manifest.lua` TODO;
- registry TODO;
- test TODO;
- warnings that no files were written and the skeleton is not lint-clean
  until filled.

## Non-Goals

- No filesystem writes.
- No overwrite/write mode.
- No new runtime template.
- No Lua bridge, manifest, registry, MCP tool, or wire-shape change.
- No render scaffolding.
- No destructive / unsafe-eval scaffolding.
- No JSON machine-output mode.
- No REAPER live smoke.

## User-Facing Behavior

No agent/runtime behavior changes. The only new user-facing entry is a
developer CLI for template authors:

```bash
npm run scaffold:template -- ... --dry-run
```

It always prints to stdout or fails with a human-readable error on stderr.

## Files Changed

- `scripts/scaffold-template.mjs` — new dry-run CLI and pure helper
  exports.
- `scripts/__tests__/scaffold-template.test.mjs` — pure helper coverage.
- `package.json` — adds `scaffold:template`.
- `docs/TEMPLATE_AUTHORING.md` — documents the dry-run helper.
- `docs/plans/KERNEL_HARDENING_PLAN.md` — H6 Slice 18 note.
- `docs/plans/KERNEL_HARDENING_EXECUTION.md` — H6 Slice 18 note.
- `docs/HANDOFF.md`, `docs/PROGRESS.md`, `docs/NEXT_WINDOW_BRIEFING.md`
  — state sync.

## Locked Decisions

- S18-D1: CLI is dry-run / plan-only and requires `--dry-run`.
- S18-D2: `--pack` defaults to `core`; non-core packs are rejected.
- S18-D3: supported `--entity-kind` values are `item`, `track`, and
  `region`; `render` is deferred.
- S18-D4: supported `--risk` values are `read`, `write_safe`, and
  `filesystem`; `destructive` and `unsafe_eval` are rejected.
- S18-D5: `--undoable`, `--undo-flags`, and `--idempotent` are explicit.
  `--undo-flags` is required when `--undoable true` and rejected when
  `--undoable false`.
- S18-D6: output is deterministic, human-readable text only; no `--json`
  in this slice.
- S18-D7: skeletons may contain TODOs and are intentionally not
  lint-clean until completed by the author.
- S18-D8: no REAPER live smoke; static gates are sufficient.

## Risks And Regression Notes

- The CLI must not write files. Keep this slice read-only except stdout.
- The CLI must not guess ReaScript logic. It prints TODOs and makes the
  author fill the real API calls.
- Existing-template slug collisions must fail before printing a misleading
  plan.
- Manifest snippets must match the current `manifest.lua` style closely
  enough to be useful, but they remain TODO text.
- Slice 19 should use this CLI to author a real first template, likely
  `track_color`, and then decide whether the generated TODO boundaries are
  still ergonomic.

## Static Gates

- `npm test`
- `npm run build`
- `npm run check:manifest`
- `npm run check:error-codes-fresh`
- `npm run check:template-authoring`
- `git diff --check`

No live REAPER smoke is required because this slice changes no Lua,
bridge, manifest, registry runtime, MCP tool contract, or wire behavior.
