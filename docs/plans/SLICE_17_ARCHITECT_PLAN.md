# Slice 17 Architect Plan — H6 Phase 1: `defineTemplate` Helper

Date: 2026-06-30

Source baseline: `45e0193 docs: follow up slice 16 authoring review`
(local `main`, ahead of `origin/main` by three commits; no push during the
work-hours window).

Locked user decisions: S17-D1 through S17-D8 all use the recommended `a`
values. Extra hard requirement: the helper identity test must be paired
with `CapabilityRegistry` / `list_templates` metadata regression coverage
for the two pilot migrations, `item_pitch` and `track_rename`.

## 1. Goal

Introduce the thinnest TS-side authoring helper:
`defineTemplate({ ... })`.

The helper reduces per-template boilerplate by letting TypeScript infer
the params/result schema types from the object literal, while preserving
the exact runtime definition object. This prepares the ground for a future
scaffolder CLI and larger MIDI/routing/FX template packs without changing
runtime behavior.

Pilot migrations:

- `item_pitch`
- `track_rename`

## 2. Non-goals

- No new real template.
- No new MCP tool.
- No Lua / bridge / manifest / verify change.
- No `list_templates` output change.
- No wire-shape change.
- No error-code change.
- No `CapabilityDefinition` public contract change.
- No generated result schema; each template still explicitly calls
  `callTemplateResultSchema(name)`.
- No full migration of all 11 templates in this slice.
- No scaffolder CLI.

## 3. User-facing behavior

No user-visible behavior changes. Agents still see the same five MCP
tools and the same 11 templates. `call_template` envelopes,
`list_templates` metadata, examples, JSON Schemas, and `expectedDelta`
descriptors must remain equivalent for the two migrated templates.

## 4. Files likely to change

- `packages/mcp-server/src/templates/_shared.ts` — add
  `defineTemplate`.
- `packages/mcp-server/src/templates/item-pitch.ts` — pilot migration.
- `packages/mcp-server/src/templates/track-rename.ts` — pilot migration.
- `packages/mcp-server/src/templates/__tests__/define-template.test.ts`
  — identity test plus metadata regression.
- `docs/TEMPLATE_AUTHORING.md` — update author steps to use
  `defineTemplate`.
- `docs/plans/KERNEL_HARDENING_PLAN.md` and
  `docs/plans/KERNEL_HARDENING_EXECUTION.md` — H6 Slice 17 notes.

End-of-slice docs:

- `docs/HANDOFF.md`
- `docs/PROGRESS.md`
- `docs/NEXT_WINDOW_BRIEFING.md`

## 5. Contract/schema/error-code changes

None.

`defineTemplate` is an identity helper over the existing
`CapabilityDefinition<P, R>` shape. It does not add fields, remove fields,
clone objects, normalize metadata, derive result schemas, or affect any
runtime path.

## 6. Decisions for user

- S17-D1=a: helper lives in
  `packages/mcp-server/src/templates/_shared.ts`.
- S17-D2=a: helper is type-level / identity only.
- S17-D3=a: do not auto-generate result schema.
- S17-D4=a: migrate only `item_pitch` and `track_rename`.
- S17-D5=a: update `docs/TEMPLATE_AUTHORING.md`.
- S17-D6=a: do not update `scripts/template-authoring-lint.mjs`; `_shared.ts`
  is already excluded as a helper file.
- S17-D7=a: no REAPER live smoke.
- S17-D8=a: local save-point commit only; no push.

## 7. Risks & regression notes

- The helper must return the exact object reference (`defineTemplate(def)
  === def`).
- The helper signature must preserve object-literal excess-property
  checks; it must not become a loose `D extends CapabilityDefinition`
  catch-all.
- Pilot migrations must not alter registry-visible metadata or JSON Schema
  output.
- Rollback is trivial: remove the helper/test/docs updates and restore the
  two pilot templates to explicit `CapabilityDefinition<typeof P, typeof R>`
  annotations.

Reviewer focus:

- `list_templates` / `CapabilityRegistry` visible output for `item_pitch`
  and `track_rename`.
- `examples` and authoring lint do not drift.
- Helper has no hidden runtime behavior.
- No accidental full-template migration or result-schema magic.

## 8. Static tests

Required gates:

- `npm test`
- `npm run build`
- `npm run check:manifest`
- `npm run check:error-codes-fresh`
- `npm run check:template-authoring`
- `git diff --check`

New tests:

- `defineTemplate(def) === def`.
- `CapabilityRegistry.list()` metadata regression for `item_pitch` and
  `track_rename`: name, risk, mutates, undoable, entity_kind, undo_flags,
  idempotent, expectedDelta, examples, params schema key fields, and
  result envelope schema.
- `listTemplates(registry)` regression for the same two templates and
  fields.

## 9. Live smoke plan

Skip. This is TS/docs-only. There is no Lua, manifest, bridge, queue,
wire, or error-code change, so REAPER cannot observe the slice.

If a reviewer requests extra confidence, the optional local check is a
static `list_templates` metadata comparison through the new regression
test, not a REAPER smoke.

## 10. Commit/push policy reminder

When all static gates are green, create a local save-point commit:

`kernel-hardening: slice 17 define template helper`

Do not push during the work-hours no-push window unless the user
explicitly grants an exception. Do not amend, reset, force-push, or touch
the ignored nested `style-memory-mcp/` project.
