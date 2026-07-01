# OpenReaper First Real Version Execution Plan

Status: authoritative planning document for the post-H6 path, created
2026-07-01 after Slice 19.

Scope: H6 completion through the first real OpenReaper version that can
support the four north-star workflows without breaking the verified-kernel
model.

This file is the single guiding plan for this phase of the project. Future
slice architect packets should derive their scope, non-goals, gates, and
verification plan from this document. Older documents remain important
context, but they do not replace this execution plan:

- `docs/HANDOFF.md`, `docs/PROGRESS.md`, and
  `docs/NEXT_WINDOW_BRIEFING.md` are status ledgers.
- `docs/plans/KERNEL_HARDENING_PLAN.md` and
  `docs/plans/KERNEL_HARDENING_EXECUTION.md` are the low-level kernel
  hardening contracts and remain binding for I1-I10.
- `docs/TEMPLATE_AUTHORING.md` is the practical authoring guide for
  individual templates.
- `docs/ROADMAP.md` and `docs/PUBLIC_STORY.md` are public-facing roadmap
  and messaging sources.

If this file conflicts with code or kernel invariants, the code and kernel
invariants win, and this file must be updated before the next slice proceeds.
Do not silently route around this file by creating a new side plan in chat.

## 0. Current Baseline

Repo:

- Path: `/Users/Zhuanz/Documents/streetlight-reaper-mcp`
- Branch: `main`
- Current head observed while drafting this document:
  `7bbd426 docs: sync slice 19 pushed state`
- Latest implementation checkpoint:
  `e54fd9c kernel-hardening: slice 19 track color template`

H6 status:

- H6 basic loop is closed.
- Slice 16 added the template authoring guide and lint.
- Slice 17 added `defineTemplate(...)`.
- Slice 18 added the dry-run scaffolder.
- Slice 19 used that flow to land the first real low-risk generated-flow
  template, `track_color`.

Verified Slice 19 facts:

- 12 core templates.
- `npm test`: 357/357 green.
- `npm run build`: clean.
- `npm run check:manifest`: 12 templates aligned.
- `npm run check:error-codes-fresh`: 22 codes fresh.
- `npm run check:template-authoring`: 12 templates ok.
- `git diff --check`: clean.
- REAPER live smoke passed on `7.71/macOS-arm64`.
- `track_color` contract:
  `{ track_id: string, color: "#RRGGBB" | null }`.
- `color:null` clears custom color.
- `"#000000"` is black, not clear.
- Verification uses the narrow synthetic track field
  `I_CUSTOMCOLOR_HEX`; this is not a general transform DSL.

Working kernel capabilities:

- Fixed MCP tool surface:
  `ping`, `get_state`, `call_template`, `list_templates`,
  `list_recipes`.
- Template-driven mutation through `call_template`.
- Locked success envelope:
  `{ template, changed_count, changed_ids, truncated }`.
- Typed references:
  `selected:N`, `guid:{...}`, `last_result:<kind>:N`,
  `track:Name`, `region:Name`.
- Risk gate in `call_template`.
- Undo blocks for undoable mutating templates.
- Structural and field-level `expectedDelta` verification for the
  shipped mutating templates, except the intentionally special
  `render_region` artifact path.
- Idempotency keys and in-memory DEDUP for synchronous and deferred
  template terminal envelopes.
- Read scopes for project, tracks, regions, selection, and track FX
  projection.
- Setup flow that writes a REAPER launcher and MCP config snippets
  without editing global user configs.

The next work is not "add many templates fast." The next work is to turn
H6 into a disciplined capability-ingestion system: every new capability
must enter through a known pipe, with a known verification story.

## 1. Strategic Judgment

OpenReaper should not compete by exposing hundreds of raw REAPER actions.
It should compete by being the verified control kernel an agent can safely
grow through.

The four north-star workflows are:

1. Seamless loop factory.
2. Drag classify + layer.
3. Cleanup + delivery.
4. MIDI / music sketch.

Each workflow has four parts:

- Input sensing.
- Agent-side decision.
- REAPER mutation.
- Verification.

A north-star workflow is not complete when one impressive manual demo
works. It is complete only when the plan has a machine-rerunnable recipe
or smoke script, bounded artifacts/reports, typed failures, and a live
REAPER smoke that proves the workflow can be repeated from a known
fixture.

The current kernel is strong on mutation and verification. It is still
thin on sensing, planning artifacts, multi-pack organization, and
workflow-level orchestration.

That means H6 is a breadth multiplier, not a scene engine. The template
factory can produce safe mutation units, but it must not become a way to
smuggle full scenes, analysis algorithms, cleanup plans, or musical
decisions into one giant Lua handler.

The dividing line:

- Kernel work builds the contracts: templates, read scopes, artifacts,
  entity buckets, refs, risk, response budget, live smoke discipline.
- Scene work composes small units: recipes, OpenCue plans, agent-side
  decisions, and human approval where needed.

The safe answer to "can we speed up demos by bypassing invariants?" is no.
Demo speed is allowed only when it rides on the contracts below.

## 2. Highest-Level Red Lines

These are architecture gates. Any future slice that violates one should be
blocked even if the demo looks attractive.

### G1. Fixed MCP Tool Surface

OpenReaper keeps exactly five MCP tools:

- `ping`
- `get_state`
- `call_template`
- `list_templates`
- `list_recipes`

New abilities enter as templates, recipes, read scopes, artifacts, or
pack metadata. They do not enter as new MCP tools.

Enforcement:

- Keep tool-count tests.
- Any new public MCP tool requires a separate kernel plan amendment and
  explicit user sign-off.

### G2. No Mega-Handlers

Do not implement a full scene as one Lua handler or one TS template.

Blocked shapes:

- `scene_loop_factory`
- `cleanup_all`
- `make_song_sketch`
- `weapon_layer_generator`
- Any handler that performs creative planning, many unrelated mutations,
  and report generation inside one bridge call.

Allowed shape:

- Small templates that each do one auditable REAPER action.
- Recipes / OpenCue plans / agent-side planner steps that compose those
  templates.

Review rule:

- Handler over roughly 120 lines is not automatically wrong, but it must
  explain why it is still one operation.
- A large handler that parses a scene plan, analyzes audio, mutates
  multiple unrelated surfaces, and writes reports is wrong.

### G3. Locked Mutation Envelope Stays Pure

`call_template` success remains:

```json
{
  "template": "name",
  "changed_count": 1,
  "changed_ids": ["guid:{...}"],
  "truncated": false
}
```

Do not add analysis data, report data, render metadata, note lists, route
graphs, or explanations to this envelope.

If a capability produces large or descriptive data, return a ref such as
`analysis:<id>`, `plan:<id>`, or `report:<id>` and read details through
`get_state`.

### G4. New Template Entry Contract

Every new template must have:

1. TS template definition with Zod schema.
2. Positive `examples[]` that parse against that schema.
3. Registry registration.
4. Lua handler.
5. Manifest entry.
6. `expectedDelta` if it mutates project state and is undoable.
7. Explicit carve-out if it is artifact-like (`render_region` family).
8. Typed errors only; no raw string errors in runtime Lua.
9. At least one fake-bridge test.
10. Manifest alignment green.
11. Authoring lint green.
12. REAPER live smoke when Lua, manifest, verify, bridge, entity buckets,
    refs, or runtime behavior changes.

### G5. Destructive And Cleanup Work Is Plan-First

Anything that might delete, overwrite, reorder, or batch-rename user
session structure must first produce a plan/report. Apply is a separate,
explicit step.

Default pattern:

1. `cleanup_plan` or equivalent: project-read-only, `risk: filesystem`
   if it persists a plan/report artifact, returns `plan:<id>` or
   `report:<id>` through the Phase 1 artifact contract, does not mutate
   the project, and does not update item/track/region `LAST_RESULT`.
2. User / agent reviews the plan.
3. `cleanup_apply`: takes `plan_id`, verifies freshness, then applies
   steps through ordinary templates or narrowly-scoped apply units.

Do not make "cleanup all" a one-step write template.

Implementation precondition:

- Current bridge finalization updates `LAST_RESULT` for every successful
  template, regardless of `mutates`. A plan/report-producing template
  must not ship until the artifact contract either adds a no-`LAST_RESULT`
  success path or explicitly defines a separate plan/report bucket whose
  behavior does not break item/track/region chaining.

### G6. Analysis Is An Artifact Contract

Audio analysis must not return raw arrays or feature payloads in the
`call_template` envelope.

Recommended shape:

- A template such as `item_audio_analyze` produces `analysis:<id>`.
- Details live in an artifact JSON file under the OpenReaper state dir.
- `get_state({ scope: "analysis", id: "analysis:<id>", ... })` reads a
  bounded projection of that artifact.

The exact file path and cleanup policy must be decided and documented
before Phase 1 implementation. The default should be outside the user
project directory, so analysis files do not pollute sessions.

### G7. Plan And Report Are Artifacts Too

Cleanup reports, loop QA reports, scene previews, and arrange plans follow
the same rule as analysis:

- Small ref in mutation envelope or read result.
- Details through `get_state`.
- Bounded response.
- Schema-owned in TS.
- Stable enough to compare or apply.

### G7A. Artifact Finalization Is A Kernel Contract

No new non-render artifact-producing capability may ship until Phase 1
chooses exactly one artifact success path. The current codebase treats
`render_region` as the single artifact-like carve-out, and current bridge
finalization rewrites `LAST_RESULT` on every successful template. Future
analysis, plan, and report refs must not grow as ad-hoc exceptions.

Choose one model:

1. `call_template` returns artifact refs in `changed_ids`, and the bridge
   updates an explicit artifact bucket such as `LAST_RESULT.artifacts` or
   kind-specific buckets such as `LAST_RESULT.analysis`. Item, track, and
   region buckets remain isolated.
2. `call_template` returns artifact refs in `changed_ids`, but the bridge
   deliberately does not update `LAST_RESULT` for that template kind.
   The returned ref is the only immediate handle; `get_state` is the read
   path.
3. Artifact creation is not a `call_template` mutation at all.
   `get_state` computes a bounded deterministic projection or resolves a
   deterministic id without persisting a new artifact, so there is no
   `changed_ids` contract to extend. If persistence is required, choose
   model 1 or 2 instead.

Do not mix these models inside one phase. The chosen model must define:

- Whether `changed_count` counts artifact refs.
- Whether artifact refs are eligible for `last_result:<kind>:N`.
- Which buckets, if any, are added to `LAST_RESULT`.
- Whether refs use `analysis:<id>`, `plan:<id>`, `report:<kind>:<id>`, or
  another grammar.
- How missing/stale artifact refs fail with typed errors.
- How artifact TTL cleanup avoids breaking in-flight refs.

Risk semantics:

- Any template that writes a persisted artifact to the OpenReaper state
  directory is `risk: filesystem`.
- `mutates:false` for such a template means "does not mutate REAPER
  project state"; it does not mean "no side effects anywhere."
- A pure read path is `risk: read` only when it does not write project
  state, OpenReaper state, or external files.

Phase 1 must update the TS types, schema helpers, docs, and tests that
currently describe `render_region` as the only non-project-entity
`changed_ids` carve-out. Until that happens, cleanup/analysis/loop QA
must not depend on `analysis:<id>`, `plan:<id>`, or `report:<id>` refs.

### G8. OpenReaper / OpenAudio / OpenCue Boundaries

OpenReaper owns REAPER project reading, mutation, and in-project analysis.

OpenAudio, if present, owns library search, external audio indexing,
audition metadata, and file discovery. It should hand OpenReaper local file
paths and metadata. It should not mutate REAPER.

OpenCue, if present, owns scene-level orchestration. It may output a plan
or recipe step list. It should not write ReaScript or bypass OpenReaper
templates.

This document references OpenAudio and OpenCue as intended boundaries. It
does not define their product-system internals.

### G9. No Verification, No Mainline

Every capability needs a verification path before it enters the mainline.

Valid verification paths include:

- H2 `expectedDelta`.
- Artifact schema validation + `get_state` readback.
- Render file existence and non-empty checks.
- Plan determinism and stale-plan rejection.
- Live REAPER smoke with a reusable fixture.

"It seemed to work in one demo" is not a verification path.

### G10. `unsafe_eval` Is Not A Product Path

`unsafe_eval` stays default-off and out of every north-star demo path.

It may exist as a development-only capability in a future unsafe pack, but
that must be opt-in, separately documented, and never a dependency of a
normal scene.

### G11. Setup Must Not Silently Rewrite User Config

The existing setup stance remains:

- Do not silently edit `reaper-kb.ini`.
- Do not silently edit `reaper.ini`.
- Do not require `sudo`.
- Do not silently edit user MCP client config.
- Generate snippets and launchers; ask the user to load or paste them.

Future autostart support must be explicit opt-in, marker-block based,
idempotent, removable, and backed up.

### G12. Docs Move With Code

Every capability slice updates its docs before it is considered complete.

Minimum:

- `docs/HANDOFF.md`
- `docs/PROGRESS.md`
- `docs/NEXT_WINDOW_BRIEFING.md`
- The slice plan under `docs/plans/`
- `docs/PUBLIC_STORY.md` only when a user-facing capability is
  implemented and live-smoked.

New packs need a pack-level doc under `docs/packs/<pack>/README.md` or
an equivalent location named in the slice plan.

### G13. No Core Parking Lot

`core` is the kernel pack, not the place to hide every unfinished domain.
Once Phase 0.5 lands, new domain capabilities should enter through a named
pack unless the slice packet explicitly proves they are kernel primitives.

Rules:

- Cleanup, loop, layer, MIDI, unsafe/dev, and future user/domain features
  must not accumulate in `core` merely because pack loading is inconvenient.
- A temporary core placement requires an explicit expiry slice and a
  migration checklist. "Move later" without a dated owner is not enough.
- Pack names, template names, recipe names, and artifact scopes must have
  collision rules before the first non-core pack ships.
- `list_templates` and `list_recipes` must make pack ownership visible
  enough for a user/agent to understand where a capability came from.

### G14. Recipes Are Product Contracts, Not Chat Memory

North-star scenes must not depend on a particular chat transcript.
Reusable workflows enter as recipe specs, smoke scripts, or OpenCue plans
with versioned inputs and expected assertions.

Minimum recipe contract before the first scene MVP:

- Stable recipe id and version.
- Required reads, template calls, and artifact reads.
- Parameter slots that the agent/user may fill.
- Per-step assertions or expected reports.
- Failure behavior and stale-artifact/stale-plan handling.
- A fixture-backed smoke script that can be rerun without inventing the
  workflow from scratch.

### G15. Slice Complexity Budget

A slice should advance one primary contract or one narrow vertical
capability. If a slice needs to change pack loading, artifact semantics,
recipe schema, new Lua templates, new read scopes, and a scene smoke at
the same time, it is too large.

Split rules:

- Foundation contracts first: pack, artifact, recipe, readback, or
  variable-count verification.
- Then one small capability or one scene step that consumes those
  contracts.
- If a reviewer cannot name the single primary contract in one sentence,
  split the slice.
- If rollback would require manually disentangling unrelated domain
  changes, split the slice.

## 3. H6 Exit Criteria And Post-H6 Template Standard

H6 is complete enough to proceed because:

- Authoring guide exists.
- Authoring lint exists.
- `defineTemplate(...)` exists.
- Dry-run scaffolder exists.
- `track_color` proved the loop on a real template.
- Static gates and REAPER live smoke passed.

H6 deliberately does not include:

- Scaffolder write mode.
- Non-core pack scaffolding.
- Destructive / unsafe / render scaffolding.
- Automatic REAPER API invention.
- A scene planner.

### Standard Path For New Templates

Every normal mutating template should follow this order:

1. Write a slice architect packet.
2. Decide name, entity kind, risk, undoability, undo flags,
   idempotency, expected delta, ReaScript API, examples, tests, and live
   smoke.
3. Run the scaffolder dry-run:

   ```bash
   npm run scaffold:template -- \
     --name <snake_case_name> \
     --entity-kind <item|track|region> \
     --risk <read|write_safe|filesystem> \
     --undoable <true|false> \
     --undo-flags <FLAGS_IF_UNDOABLE> \
     --idempotent <true|false> \
     --dry-run
   ```

4. Use the snippets as the starting point.
5. Fill real ReaScript logic by hand.
6. Add tests.
7. Run static gates.
8. Run REAPER live smoke if runtime is affected.
9. Update state docs.

Do not add scaffolder write mode until at least three to five real
templates have been authored and the repeated pain is clear.

### Capabilities That Must Not Use H6 As Their Primary Path

These require a prior architecture decision:

- Audio analysis algorithms.
- Report / plan artifact generation.
- Delivery plan/report and output-file validation.
- Layer / role-assignment plan artifacts.
- Scene recipes and OpenCue plans.
- New entity kinds.
- New reference grammar.
- New error-code families.
- New pack loading.
- Destructive operations.
- Multi-id / variable-count verification.
- Project and MIDI readback scopes.
- MIDI batch verification carve-outs.

They may still produce templates, but the contract comes first.

## 4. Capability Ingestion Model

Every new capability must declare which pipe it uses.

### Pipe A: Mutating REAPER Operation

Use for:

- Track setters.
- Item setters.
- Media import.
- Region manipulation.
- FX setters.
- Envelope setters.
- MIDI item/note/CC writers.

Contract:

- `call_template`.
- TS schema.
- Lua handler.
- Manifest entry.
- Undo block when project state changes.
- `expectedDelta` unless explicitly artifact-like.
- Static gates.
- Live smoke if runtime changed.

Do not use Pipe A for analysis payloads or full workflows.

### Pipe B: Project Read Model

Use for:

- Reading project summary.
- Tracks.
- Regions.
- Selection.
- Routing.
- FX params.
- MIDI items.
- Render settings.
- Analysis / plan / report artifact projections.

Contract:

- `get_state`.
- Bounded output.
- `limit`, `include`, `fields`, and `cursor` where needed.
- Read paths must not touch `LAST_RESULT`.

### Pipe C: Analysis Artifact

Use for:

- Loudness.
- Peaks.
- Transients.
- Silence segmentation.
- Spectral summary.
- Loop candidates.
- Click-risk metrics.

Recommended contract:

```json
{
  "template": "item_audio_analyze",
  "changed_count": 1,
  "changed_ids": ["analysis:<id>"],
  "truncated": false
}
```

Then:

```json
{
  "scope": "analysis",
  "id": "analysis:<id>",
  "fields": ["summary", "transients"]
}
```

Notes:

- This pipe is blocked until G7A is resolved. The `changed_ids` example
  above is a recommendation, not permission to bypass Phase 1.
- `changed_count` should reflect the one created artifact ref if the
  bridge treats `analysis:<id>` as a changed id. If the implementation
  chooses `changed_count=0`, document that as an explicit artifact
  carve-out before coding. Do not leave this ambiguous.
- Analysis refs must not land in item/track/region buckets.
- Large arrays require projection or paging.
- Artifact JSON must have a schema.
- Persisted analysis artifacts imply `risk: filesystem`; `mutates:false`
  means no REAPER project mutation.

### Pipe D: Plan / Report Artifact

Use for:

- Cleanup plan.
- Cleanup report.
- Loop QA report.
- Mix audit.
- Arrange preview.
- Delivery checklist.

Contract:

- Read-only plan/report generation must not mutate REAPER.
- Persisted plan/report generation is `risk: filesystem`, not `read`.
- Apply must reference a plan id.
- Apply must reject stale plans.
- Apply should execute through existing templates when possible.
- Plan/report details are read through `get_state`.
- `LAST_RESULT` behavior follows the one G7A model chosen in Phase 1.

### Pipe E: Recipe / Scene Orchestration

Use for:

- Seamless loop workflow.
- Layer construction.
- Cleanup workflow.
- MIDI sketch workflow.
- OpenCue-generated scenes.

Contract:

- A recipe is a versioned list of reads, template calls, artifact reads,
  assertions, and report links.
- Agent owns creative choice and user approval.
- Bridge sees ordinary small operations.
- No mega-template.
- `list_recipes` returns enough metadata for discovery:
  recipe id, pack, version, risk summary, required templates, required
  read scopes, artifacts produced, fixture/smoke availability, and
  whether user approval is required.
- Recipe fixtures live in the repo as smokeable artifacts, not only in
  prose.

### Pipe F: OpenAudio File Discovery

Use for:

- Searching sample libraries.
- Returning local file paths.
- Returning metadata that helps the agent decide.

Contract on the OpenReaper side:

- Accept absolute file paths through existing or future import templates.
- Validate path existence and import result.
- Do not implement library search in OpenReaper.

## 5. Phase Roadmap

This roadmap is not a promise that all phases ship in order without
adjustment. It is the default order for preserving the kernel. Any
reordering needs a user decision and an update to this document.

Recommended order:

1. Phase 0: Post-H6 factory repeatability and pack-loading preflight.
2. Phase 0.5: Pack contract foundation.
3. Phase 1: Artifact contract foundation.
4. Phase 2: Cleanup plan-first MVP.
5. Phase 2.5: Delivery closure MVP.
6. Phase 3: Analysis contract for in-project items.
7. Phase 3.5: Recipe / scene contract foundation.
8. Phase 4: Seamless loop factory MVP.
9. Phase 4.5: Multi-id / variable-count verification foundation.
10. Phase 5: Drag classify + layer MVP.
11. Phase 5.5: Project + MIDI readback foundation.
12. Phase 6: MIDI / music sketch MVP.
13. Phase 7: FX / routing / automation expansion.
14. Phase 8: OpenAudio / OpenCue integration demos.

This order differs from the four-scene order because pack loading,
artifact handling, cleanup/report planning, delivery validation, analysis,
and recipes are shared infrastructure. Scene MVPs start only after the
contracts they depend on are proven.

### Phase 0: Post-H6 Factory Repeatability

Goal:

- Prove the H6 authoring flow is repeatable beyond `track_color`.
- Freeze the template-entry ritual for normal low-risk mutating
  templates.
- Decide whether Phase 0.5 is the next required slice before any
  non-core domain feature.

Non-goals:

- No scaffolder write mode.
- No new analysis artifact.
- No plan/report artifact.
- No scene workflow.
- No destructive templates.

Candidate slices:

- `track_folder_set`: set folder depth / compact state, if the REAPER API
  semantics are confirmed.
- `track_mute_set` or `track_solo_set`: simple idempotent boolean setter.
- Pack-loading preflight: identify the first non-core pack candidate and
  schedule Phase 0.5 before that pack ships.

Files likely touched:

- `packages/mcp-server/src/templates/<template>.ts`
- `packages/mcp-server/src/templates/index.ts`
- `packages/mcp-server/src/tools/__tests__/<template>.test.ts`
- `reaper/packs/core/templates/track.lua`
- `reaper/packs/core/manifest.lua`
- `reaper/packs/core/verify.lua` only if a new synthetic field is
  unavoidable
- `scripts/__tests__/lua-structure.test.mjs` if Lua invariants need a
  static guard

Implementation steps:

1. Write a Slice 20 architect packet using the template in Appendix A.
2. Run scaffolder dry-run.
3. Fill one real template.
4. Add fake-bridge tests and aggregate list/manifest tests.
5. Run static gates.
6. Full REAPER restart and smoke if Lua changed.
7. Update this file only if the flow reveals a general rule change.

Static gates:

```bash
npm run build
npm test
npm run check:manifest
npm run check:error-codes-fresh
npm run check:template-authoring
git diff --check
```

Live smoke recipe:

1. Full quit/reopen REAPER.
2. Run current `start_bridge.lua`.
3. Confirm generation 1 and error codes loaded.
4. `ping`.
5. `list_templates` includes the new template and expectedDelta.
6. Set up target track with `track_create`.
7. Call new template happy path.
8. Call same template idempotency path if relevant.
9. Call one negative runtime case and confirm typed error.
10. Confirm queue cleanup: `pending=0`, `running=0`, `done=0`.

Pitfalls:

- Do not add `--apply` to scaffolder.
- Do not add pack support to scaffolder merely because Phase 0 is nearby;
  pack loading has its own contract in Phase 0.5.
- Do not invent a generalized transform DSL in `verify.lua` for one
  field; prefer narrow synthetic readers when truly necessary.

Exit criteria:

- At least one second real template authored through the H6 ritual.
- Static gates green.
- Live smoke green if runtime touched.
- `docs/TEMPLATE_AUTHORING.md` remains accurate.

### Phase 0.5: Pack Contract Foundation

Status (2026-07-01):

- Implementation slice: `SLICE_20B_PACK_CONTRACT_ARCHITECT_PLAN.md`.
- Current working tree has the first code drop: static repo-local pack
  loading, explicit enabled-pack parsing, pack-aware `list_templates` /
  `list_recipes`, pack-aware manifest and authoring lint gates, Lua
  bridge multi-pack loading, and a test-only `pack_contract_fixture`.
- Default runtime remains `core` only. The fixture pack is explicitly
  enabled for verification with
  `STREETLIGHT_ENABLED_PACKS=core,pack_contract_fixture` on the MCP side
  and `_G.STREETLIGHT_ENABLED_PACKS = "core,pack_contract_fixture"` on
  the REAPER side.
- Reviewer pass, static smoke, and REAPER live smoke are complete after
  two contract fixes: non-core packs cannot introduce new entity kinds in
  this slice, and recipe ids cannot create ambiguous duplicate
  `qualified_id`s. Do not begin Phase 1 domain/artifact work until Slice
  20B has a local commit.

Goal:

- Make extension through packs real before domain capabilities start
  accumulating in `core`.

Non-goals:

- No user marketplace.
- No dynamic network plugin install.
- No unsafe/dev pack behavior.
- No scaffolder write mode for packs yet.

Core contract:

- Pack discovery loads one or more named packs from known repo locations.
- Each pack has a manifest, docs, templates, optional recipes, and static
  alignment tests.
- Template and recipe names have collision rules. Recommended default:
  globally unique template names for `call_template`, plus pack metadata
  surfaced in `list_templates`; recipe ids may be pack-qualified.
- Pack enable/disable behavior is explicit and testable.
- Pack-level risk policy is visible, but individual templates still carry
  their own risk.
- `core` remains the kernel pack. Domain packs must not silently monkey
  patch core manifest state.

Files likely touched:

- `packages/core/src/registry.ts`
- `packages/core/src/types.ts`
- `packages/mcp-server/src/templates/index.ts` or pack loader module.
- `packages/mcp-server/src/tools/list-templates.ts`
- `packages/mcp-server/src/tools/list-recipes.ts`
- `packages/mcp-server/src/tools/__tests__/list-templates.test.ts`
- `packages/mcp-server/src/tools/__tests__/list-recipes.test.ts`
- `reaper/streetlight_bridge.lua`
- `reaper/packs/<pack>/manifest.lua`
- `scripts/check-manifest.mjs` or equivalent manifest alignment tool.
- `docs/packs/<pack>/README.md`

Static tests:

- Two packs can load in deterministic order.
- Duplicate template/recipe names fail loudly or are resolved by a
  documented namespace rule.
- `list_templates` shows pack ownership and existing core descriptors
  unchanged.
- Manifest alignment covers every enabled pack.
- Disabled packs do not appear in tool output.

Live smoke:

1. Full REAPER restart.
2. Load bridge with `core` plus one minimal non-core fixture pack.
3. `ping`.
4. `list_templates` shows templates from both packs with pack ownership.
5. Call one harmless template from each pack.
6. Confirm `LAST_RESULT` and queue cleanup still behave normally.

Pitfalls:

- Do not let domain packs mutate core globals except through documented
  registration.
- Do not park cleanup/loop/MIDI templates in core with a vague TODO.
- Do not hide pack ownership from the agent; discoverability is part of
  extensibility.

Exit criteria:

- At least two packs load and list deterministically.
- Pack ownership is visible in list output.
- Static alignment runs across enabled packs.
- Future cleanup, loop, MIDI, unsafe/dev, or user packs have a documented
  path that does not require editing core.

### Phase 1: Artifact Contract Foundation

Goal:

- Build the shared artifact model before analysis, cleanup reports, and
  scene QA reports depend on it.

Non-goals:

- No audio feature algorithms yet.
- No cleanup plan heuristics yet.
- No scene recipes yet.

Core decisions to lock:

- The one G7A artifact success path:
  `changed_ids + LAST_RESULT artifact bucket`,
  `changed_ids + no LAST_RESULT update`, or
  read-only `get_state` / deterministic projection with no persisted
  artifact.
- Artifact root directory.
- Artifact id grammar:
  `analysis:<id>`, `plan:<id>`, `report:<kind>:<id>` or a smaller
  alternative.
- Artifact JSON schema ownership.
- TTL / cleanup policy.
- Whether artifact refs update `LAST_RESULT`, and in which bucket.
- Whether `changed_count` counts one produced artifact ref.
- `get_state` scopes for `analysis`, `plan`, and `report`.
- Bridge finalization semantics for non-project-state templates. The
  current `finalize_template` path clears and rewrites `LAST_RESULT` on
  every template success; artifact-producing templates need an explicit
  no-update path or an explicit artifact bucket before implementation.

Recommended starting model:

- Artifacts live under the OpenReaper state dir, not the user project
  folder.
- IDs are opaque, stable for the bridge/session lifetime, and safe to log.
- Artifact details are always read through `get_state`.
- Artifact read responses support field projection.
- Startup cleanup removes old artifacts by mtime using a documented
  threshold.

Files likely touched:

- `packages/core/src/registry.ts` if artifact-like capabilities need
  descriptor metadata.
- `packages/core/src/__tests__/registry.test.ts` for descriptor metadata
  coverage.
- `packages/core/src/types.ts` if `CallTemplateResult.changed_ids`
  expands beyond project entity refs plus `render_region`.
- `packages/core/src/__tests__/result.test.ts` if Result /
  `CallTemplateResult` contract comments or helper semantics change.
- `packages/core/src/errors.ts` for artifact errors.
- `packages/mcp-server/src/templates/_shared.ts` and
  `packages/mcp-server/src/templates/__tests__/define-template.test.ts`
  if `callTemplateResultSchema(...)` comments or validation need
  artifact ref semantics.
- `packages/mcp-server/src/tools/call-template.ts` and
  `packages/mcp-server/src/tools/__tests__/call-template.test.ts` if the
  bridge command/result contract changes.
- `packages/mcp-server/src/tools/list-templates.ts` and
  `packages/mcp-server/src/tools/__tests__/list-templates.test.ts` if
  descriptor metadata exposes artifact behavior.
- `packages/mcp-server/src/tools/get-state.ts`
- `packages/mcp-server/src/tools/__tests__/get-state.test.ts`
- `docs/TEMPLATE_SPEC.md`
- `docs/TEMPLATE_AUTHORING.md`
- `docs/RESPONSE_BUDGET.md`
- `reaper/streetlight_bridge.lua`
- `reaper/packs/core/manifest.lua` if entity buckets change.
- `reaper/packs/core/refs.lua` if artifact refs are resolvable.
- New helper under `reaper/packs/core/lib/` for artifact paths / JSON.

Static tests:

- The selected G7A model is pinned in TS unit tests.
- Artifact id parser accepts valid ids and rejects malformed ids.
- `get_state(analysis|plan|report)` validates required `id`.
- Missing artifact returns typed error, not `INTERNAL_ERROR`.
- Read path does not update `LAST_RESULT`.
- Artifact-producing success does not update item/track/region
  `LAST_RESULT`. If an artifact bucket is introduced, tests prove bucket
  isolation.
- Response budget is enforced for artifact reads.
- Existing `render_region` tests still pass and its semantics are either
  preserved as a named legacy carve-out or migrated into the same artifact
  model.

Live smoke:

- May be optional if Phase 1 is TS-only. Mandatory if Lua bridge,
  artifact filesystem, entity buckets, or refs are touched.
- If runtime is touched, run a synthetic `artifact_probe` or equivalent
  minimal artifact path:
  1. Create or anchor a normal track/item `LAST_RESULT`.
  2. Produce one tiny artifact through the chosen G7A entry point.
  3. Confirm the returned ref shape and `changed_count` semantics.
  4. Read the artifact through `get_state`.
  5. Confirm missing/stale artifact returns the chosen typed error.
  6. Confirm the anchored item/track/region `LAST_RESULT` still resolves.
  7. Confirm TTL cleanup with a fake old artifact or documented mtime
     fixture, without deleting a fresh in-flight artifact.

Pitfalls:

- Do not store artifacts in the REAPER project folder.
- Do not return full artifacts in mutation envelopes.
- Do not make artifact ids encode absolute paths.
- Do not let report/analysis refs masquerade as item refs.

Exit criteria:

- A minimal synthetic artifact can be written and read through the chosen
  path, with the entry point, returned ref, `changed_count`, and
  `LAST_RESULT` behavior explicitly documented.
- Missing/stale artifact errors are typed.
- Response budget behavior is tested.
- All `render_region` single-carve-out language in code comments, docs,
  and tests is either updated or intentionally preserved with an explicit
  reason.

### Phase 2: Cleanup Plan-First MVP

Goal:

- Prove plan/report artifacts on a useful workflow before heavier audio
  analysis work.
- Let OpenReaper inspect a messy project and produce a deterministic
  cleanup plan without mutating.
- Close cleanup as its own workflow slice before claiming delivery.

Non-goals:

- No automatic mix decisions.
- No automatic mastering or loudness delivery.
- No deletion-heavy destructive cleanup in the first pass.
- No one-shot cleanup mega-handler.

Likely contracts:

- `cleanup_plan`
  - risk: `filesystem` if it persists a plan/report artifact; `read`
    only if the implementation returns no persisted artifact and is
    proven not to touch project or OpenReaper state.
  - mutates project: false.
  - output: `plan:<id>` and/or `report:cleanup:<id>`.
  - reads project, tracks, regions, routing/naming scopes as needed.
- `cleanup_apply_safe`
  - risk: `write_safe`.
  - takes `plan_id`.
  - applies only reversible write-safe edits such as rename, color,
    folder, and region naming.
  - v1 must choose one execution model before coding:
    agent-step execution, where the agent reads the plan then calls
    existing small templates one by one; or narrow apply execution, where
    `cleanup_apply_safe` validates freshness, expands only approved safe
    steps, and returns a `report:<id>` through the artifact contract.
  - It must not become a generic "cleanup all" handler that parses a
    workflow, performs unrelated creative choices, and embeds a step
    report in the locked success envelope.
- `cleanup_apply_destructive`
  - risk: `destructive`.
  - deferred until a later slice unless truly needed.

Recommended decision:

- Split safe and destructive apply. Most useful cleanup is write-safe and
  undoable. Reserve destructive for deletes or irreversible overwrites.
- Prefer agent-step execution for the first cleanup MVP unless there is a
  strong reason to need a single apply call. It reuses already-verified
  templates and keeps per-step `expectedDelta` honest.

Required read model additions:

- Track naming summary.
- Duplicate names.
- Basic folder/depth/compact state if not already covered.
- Region naming / order summary.
- Routing summary may be deferred if not needed by the first dirty
  fixture.

Files likely touched:

- New cleanup pack if cleanup is implemented outside core. If Phase 0.5
  has not landed and cleanup is not a kernel primitive, do not park it in
  core with a TODO; run Phase 0.5 first or explicitly reduce the slice to
  a docs-only contract.
- `packages/mcp-server/src/templates/cleanup-plan.ts`
- `packages/mcp-server/src/templates/cleanup-apply-safe.ts`
- `reaper/packs/<pack>/templates/cleanup.lua`
- `docs/packs/cleanup/README.md`
- Fixture docs under `docs/smokes/` or `docs/fixtures/`.

Verification:

- Running plan twice on the same fixture produces equivalent plan content.
- Running plan does not mutate project state.
- Running plan does not update item/track/region `LAST_RESULT`; if the
  artifact contract introduces a plan/report bucket, the smoke must prove
  it does not break existing `last_result:item|track|region:N` chains.
- Apply checks plan freshness before mutation.
- Apply stops on first failed step. Detailed applied/skipped/failed step
  data lives in `report:<id>` or a bounded typed error detail, never in
  the success envelope.
- Each applied write has a normal expectedDelta or is composed from
  already-verified templates.
- Batch undo semantics are explicit: either one undo block per small
  template call, or one documented apply undo block if narrow apply
  execution is chosen.
- Partial failure semantics are explicit: no silent continue-past-error,
  and no destructive step in `cleanup_apply_safe`.
- Idempotency is explicit: stale plans are rejected, and a repeated safe
  apply either becomes a no-op with a report artifact or returns a typed
  already-applied/stale error.

Live smoke recipe:

1. Open dirty fixture project.
2. Full REAPER restart, load bridge.
3. `ping`.
4. `get_state` required scopes.
5. `cleanup_plan`.
6. Read `plan:<id>` / `report:<id>` with `get_state`.
7. Run `cleanup_plan` again and compare deterministic fields.
8. Apply the plan using the chosen execution model: agent calls small
   templates step by step, or `cleanup_apply_safe` creates a
   `report:<id>`.
9. Verify names/colors/folders/regions changed as planned, with per-step
   verification or report artifact readback.
10. Change the project after creating a fresh plan, then apply that stale
    plan and expect `PLAN_STALE`.

Pitfalls:

- Avoid "cleanup all" as a template.
- Avoid letting apply implement its own ad-hoc mutation code when a
  template already exists.
- Avoid destructive default policy just to make a demo easier.
- Avoid promising "reports which steps applied" unless the report is a
  plan/report artifact or bounded typed error detail. The locked success
  envelope remains `{ template, changed_count, changed_ids, truncated }`.

Exit criteria:

- Dirty fixture plan/apply path live-smoked.
- Report-first rule documented publicly.
- Destructive work remains blocked or separately opted in.
- Delivery remains explicitly unclaimed until Phase 2.5.

### Phase 2.5: Delivery Closure MVP

Goal:

- Add the smallest verified delivery closure on top of cleanup:
  planned output, rendered/exported artifact validation, naming/package
  checks, and a delivery report.

Non-goals:

- No mastering.
- No automatic loudness correction.
- No multi-format release packaging.
- No platform-specific delivery presets.

Likely contracts:

- `delivery_plan`
  - risk: `filesystem` if it persists a plan artifact.
  - output: `plan:delivery:<id>` or the Phase 1 chosen equivalent.
  - includes target regions/items, output directory, file naming rules,
    render/export settings, and explicit deferrals such as loudness.
- `delivery_report`
  - risk: `filesystem` if persisted.
  - verifies produced files exist, are non-empty, match expected naming,
    and have no forbidden sidecars.
- Existing `render_region` may be enough for the first delivery smoke; add
  a new render/export template only with a separate plan.

Required read/artifact additions:

- Render/output setting projection if delivery planning needs it.
- File artifact validation helpers for existence, non-empty size, and
  allowed extensions.
- Delivery checklist artifact schema.

Verification:

- Delivery plan is deterministic on the same cleaned fixture.
- Rendered/exported files exist and are non-empty.
- Output names match the plan.
- Forbidden sidecars are absent or reported.
- Loudness/mastering is explicitly marked deferred; do not imply it is
  solved.

Live smoke:

1. Start from the cleaned fixture after Phase 2.
2. Create a small region or use an existing region.
3. Generate `delivery_plan`.
4. Render/export through the approved template path.
5. Generate/read `delivery_report`.
6. Confirm expected file exists, is non-empty, and has no forbidden
   sidecars.
7. Confirm a stale plan or missing output returns a typed error/report.

Pitfalls:

- Do not rename cleanup MVP to "delivery" without output artifact proof.
- Do not hide file validation in prose.
- Do not add mastering/loudness automation just to make the first delivery
  story sound complete.

Exit criteria:

- One cleaned fixture produces one validated deliverable file.
- Delivery report artifact exists and is readable.
- The public story can accurately say cleanup + delivery MVP only after
  this smoke passes.

### Phase 3: Analysis Contract For In-Project Items

Goal:

- Let the agent "hear" in-project media items through bounded, structured
  analysis artifacts.

Non-goals:

- No external sample library search.
- No semantic embedding service.
- No AI audio generation.
- No loop factory scene yet.

Likely template:

```json
{
  "name": "item_audio_analyze",
  "params": {
    "item_id": "selected:0",
    "features": [
      "loudness",
      "peaks",
      "transients",
      "silence",
      "spectral_summary",
      "loop_candidates"
    ],
    "take_index": 0,
    "time_range": { "start": 0, "end": 1.5 }
  }
}
```

Descriptor defaults:

- `risk: filesystem` if analysis writes a persisted artifact.
- `mutates:false` means no REAPER project mutation, not no OpenReaper
  state write.
- `undoable:false`, because no project undo point should be created for
  analysis-only work.
- Artifact ref / `LAST_RESULT` behavior follows the Phase 1 G7A model.

Likely read:

```json
{
  "scope": "analysis",
  "id": "analysis:<id>",
  "fields": ["summary", "transients"],
  "limit": 200
}
```

Recommended implementation:

- Start with Lua + REAPER PCM accessors for zero dependency:
  `CreateTakeAudioAccessor`, `GetAudioAccessorSamples`, and related APIs.
- Keep feature set fixed in schema. No custom user-provided analyzer code.
- Cap transient / peak / loop candidate arrays.

Possible error codes:

- `ANALYSIS_FAILED`
- `ANALYSIS_NOT_FOUND`
- `ANALYSIS_FEATURE_UNSUPPORTED`
- `AUDIO_SOURCE_OFFLINE`
- `ANALYSIS_RESPONSE_TOO_LARGE` if a separate code is warranted; otherwise
  reuse `RESPONSE_TOO_LARGE`.

Verification:

- Artifact JSON validates against schema.
- `get_state(analysis)` returns the same projected fields as the file.
- Same sample analyzed twice produces stable summary values within
  tolerance.
- Missing/offline media returns typed error.
- Large feature arrays are bounded.
- Analysis does not update item/track/region `LAST_RESULT`; if an
  analysis bucket exists, it is isolated from existing item/track/region
  chaining and has explicit resolver semantics.

Live smoke recipe:

1. Import a short known sample.
2. Analyze loudness and peaks.
3. Read summary.
4. Analyze transients.
5. Read transients with limit.
6. Analyze a longer file and confirm bounded response.
7. Force missing source/offline condition if practical and confirm typed
   error.

Pitfalls:

- Do not put feature arrays in `call_template` result.
- Do not let analysis run arbitrary Lua from agent input.
- Do not re-run analysis inside mutation handlers such as split or loop.
  Those handlers should consume `analysis_id`.
- Do not assume PCM accessor performance is enough forever; first prove
  correctness, then profile.

Exit criteria:

- Loudness, peaks, transients, silence, and loop-candidate minimum set
  live-smoked or explicitly deferred.
- Artifact lifecycle tested.
- Response budget tested.
- Any deferred feature must name the downstream phase it blocks. Phase 4
  is blocked until loop candidates and click-risk metrics are implemented,
  schema-backed, bounded, and live-smoked.

### Phase 3.5: Recipe / Scene Contract Foundation

Goal:

- Make workflow orchestration reusable before the first north-star scene
  MVP depends on it.

Non-goals:

- No OpenCue implementation inside OpenReaper.
- No creative planner.
- No scene mega-template.

Core contract:

- Recipe schema includes id, pack, version, summary, required templates,
  required read scopes, required artifact scopes, parameters, approval
  points, per-step assertions, and report outputs.
- `list_recipes` exposes recipe metadata without requiring the caller to
  inspect code.
- Recipe fixtures are machine-rerunnable smoke inputs, not only prose.
- Recipe reports point to artifacts through the Phase 1 artifact contract.
- A recipe can be executed by an agent step-by-step through existing MCP
  tools; OpenCue may generate or run such a plan later, but it must not
  bypass OpenReaper templates.

Files likely touched:

- `packages/core/src/types.ts`
- `packages/mcp-server/src/tools/list-recipes.ts`
- `packages/mcp-server/src/tools/__tests__/list-recipes.test.ts`
- `docs/RECIPES.md` or `docs/recipes/README.md`
- `docs/smokes/<recipe>.md` or equivalent machine-rerunnable smoke docs.
- Pack docs for any recipe-owning pack.

Static tests:

- `list_recipes` returns stable ids, versions, pack ownership, required
  templates/scopes, and approval flags.
- Recipe metadata references only known templates/read scopes/artifact
  scopes.
- Fixture smoke docs/scripts exist for shipped north-star recipes.

Live smoke:

- Optional if the slice is docs/TS-only.
- Mandatory before Phase 4 ships a scene recipe: run one recipe fixture
  step-by-step and prove its assertions/report links are meaningful.

Pitfalls:

- Do not make recipes executable hidden code paths that bypass
  `call_template`.
- Do not let recipes depend on chat memory.
- Do not put full report payloads in recipe metadata.

Exit criteria:

- `list_recipes` exposes versioned recipe contracts.
- At least one tiny fixture recipe proves the format.
- Phase 4 can express seamless loop as a recipe instead of an ad-hoc chat
  script.

### Phase 4: Seamless Loop Factory MVP

Goal:

- Run a vertical slice for north-star scene 1: make a usable seamless
  loop from an in-project item.

Prerequisites:

- Phase 1 artifact contract is green.
- Phase 3 loop candidates and click-risk metrics are implemented,
  schema-backed, bounded, and live-smoked.
- Phase 3.5 recipe contract is green enough to express the loop workflow
  as a reusable recipe or smoke script.

Non-goals:

- No multi-stem loop set.
- No AI crossfade curve generation.
- No external library search.
- No one-shot loop mega-template.

Likely templates:

- `take_loop_set`
  - Enables/disables source looping.
  - Verify with item/take field reader.
- `item_crossfade`
  - Sets fade-in/fade-out around a chosen boundary.
  - Could reuse existing item fade fields or add shape fields.
- `loop_candidate_place` or equivalent
  - Places candidate trims for audition, if needed.
- Existing:
  - `item_trim`
  - `item_fade`
  - `region_create`
  - `render_region`
  - `item_audio_analyze`

Likely recipe:

1. Start from selected item.
2. Analyze loop candidates.
3. Agent chooses candidate.
4. Trim / fade / set loop.
5. Create region.
6. Render.
7. Analyze rendered output for click-risk.
8. Return report artifact.

Verification:

- Each mutation has expectedDelta.
- Render artifact is non-empty and sidecar-clean.
- Second-pass analysis click metric is below threshold.
- Failure to meet click threshold is reported at recipe/report level, not
  hidden inside a mutation template.

Live smoke:

- Drum/percussive sample.
- Sustained/tonal sample.
- At least one output WAV each.
- Listen / visual inspect acceptable as an extra human criterion, but not
  the only criterion.

Pitfalls:

- Do not encode loop scoring in Lua mutation handlers.
- Do not return "why this loop works" in mutation envelopes.
- Do not create a `seamless_loop_factory` mega-template.

Exit criteria:

- Two materially different samples produce loop WAVs.
- Click QA report exists.
- `docs/PUBLIC_STORY.md` can accurately say seamless loop MVP is
  implemented only after live smoke passes.

### Phase 4.5: Multi-id / Variable-count Verification Foundation

Goal:

- Define how templates that create or modify a variable number of project
  entities prove their result without overflowing `changed_ids` or lying
  through `expectedDelta`.

Why this exists:

- `item_split_by_silence` can create 2, 6, or 40 items depending on the
  source and threshold.
- Existing field verification usually checks one changed id or a known
  count.
- The locked envelope caps `changed_ids` at 50 and can be truncated.

Non-goals:

- No audio splitting template yet.
- No classifier or layer workflow.
- No general proof language for every possible batch operation.

Core decisions:

- Whether `expectedDelta.count` accepts bounded ranges such as
  `{ min: 2, max: 50 }`, `count: "any"`, or a template-specific verifier.
- How `changed_count`, `changed_ids.length`, and `truncated` interact
  when more than 50 entities are produced.
- Which field samples are mandatory for variable creates:
  first item, last item, and optionally N evenly-spaced samples.
- Whether verification is handler-local Lua or a registry-level
  expectedDelta extension.
- How failed partial creates are reported and whether orphan outputs are
  allowed.

Files likely touched:

- `packages/core/src/registry.ts`
- `packages/core/src/types.ts`
- `packages/core/src/__tests__/registry.test.ts`
- `packages/mcp-server/src/tools/__tests__/call-template.test.ts`
- `reaper/packs/core/verify.lua`
- `docs/TEMPLATE_SPEC.md`
- `docs/TEMPLATE_AUTHORING.md`
- `docs/RESPONSE_BUDGET.md`

Static tests:

- Multi-id expectedDelta shape parses and rejects ambiguous shapes.
- `changed_count > changed_ids.length` still requires
  `truncated:true`.
- Variable-count verification cannot silently pass with zero changed ids
  unless the template explicitly allows zero.
- Field sample rules are tested for first/last and truncated cases.

Live smoke:

- Optional if the slice is TS/docs-only.
- Mandatory before `item_split_by_silence` ships. Use a fixture operation
  that creates at least three entities, then prove count, first/last
  fields, and truncation behavior if practical.

Pitfalls:

- Do not put every created entity's full descriptor in the success
  envelope.
- Do not make `count:"any"` a blanket escape hatch without sample
  readback.
- Do not let a variable-count template skip undo or field verification
  just because the exact count is unknown.

Exit criteria:

- A documented expectedDelta form exists for variable creates.
- Static tests pin count/truncation/sample behavior.
- Phase 5 can reference this contract instead of inventing one inside
  `item_split_by_silence`.

### Phase 5: Drag Classify + Layer MVP

Goal:

- Take raw imported material, segment it, place pieces on role tracks, and
  align them by transient or user-approved role decision.

Non-goals:

- No automatic semantic role classifier in Lua.
- No external library search.
- No creative pairing engine.
- No mega-template.

Likely templates:

- `item_split_by_silence`
  - Consumes `analysis_id`.
  - Produces multiple item refs.
  - Needs careful creates/count semantics.
- `item_align_to_transient`
  - Consumes `analysis_id` and transient index.
  - Writes `D_POSITION`.
- `track_role_assign` may be a recipe pattern rather than a template:
  create/reuse role track + move items.

Likely plan/report artifact:

- `layer_plan` or `role_assignment_plan`
  - maps segment refs to user/agent-approved roles.
  - records role track targets, colors, labels, and placement intent.
  - records approval status before mutation.
- `layer_report`
  - confirms each planned segment landed on the expected role track.
  - reports alignment error per segment or bounded sample.

Verification:

- Split count and truncation follow the Phase 4.5 multi-id contract.
- First and last split item positions are verified through the Phase 4.5
  sample-readback rules.
- Alignment error below threshold.
- Role assignment is agent/user-provided through `layer_plan`, not guessed
  by Lua.
- Readback verifies each role track receives the expected item refs or a
  bounded sample if the plan is large.

Live smoke:

- Use a fixture sample with 4-6 transients.
- Run analysis.
- Split.
- Produce/read `layer_plan` with at least four role tracks and approval
  status.
- Assign items to role tracks.
- Align to target positions.
- Read `layer_report` or project state and verify planned role placement.

Pitfalls:

- Do not run audio analysis inside `item_split_by_silence`.
- Do not hardcode roles from filenames in Lua.
- Do not let changed_ids overflow the locked envelope; truncate rules
  and count must remain honest.
- Do not claim "classify" if there is no persisted plan/report showing
  who assigned which segment to which role.

Exit criteria:

- Fixture sample end-to-end creates layered, aligned items.
- Segment-to-role mapping is captured in a plan/report artifact.
- Undo behavior remains sane step by step.

### Phase 5.5: Project + MIDI Readback Foundation

Goal:

- Add the read and verification contracts required before MIDI-writing
  templates ship.

Why this exists:

- `project_tempo_set` needs project-level field readback, not item or
  track field readback.
- `midi_item_create` needs item/take media-type awareness.
- `midi_note_add_batch` and `midi_cc_add_batch` need bounded readback for
  note/CC counts and sampled events, not one changed id per note.

Non-goals:

- No MIDI writing yet.
- No composing, arranging, FX, or rendering.
- No one-note-per-call workaround.

Core decisions:

- Whether project-level fields live under `get_state(project)` only or
  also an expectedDelta field verifier.
- Whether MIDI refs use the existing `item` bucket with media-type checks
  or a new `midi_item` bucket.
- How `get_state(midi_items)` pages note and CC lists.
- Which note/CC fields are mandatory for sampled readback:
  pitch, velocity, channel, start/end PPQ, muted/selected if needed.
- How take refs are represented if a MIDI item has multiple takes.
- How empty-take and non-MIDI-item errors map to typed codes.

Files likely touched:

- `packages/core/src/registry.ts`
- `packages/core/src/types.ts`
- `packages/mcp-server/src/tools/get-state.ts`
- `packages/mcp-server/src/tools/__tests__/get-state.test.ts`
- `reaper/packs/core/state.lua` or equivalent read-scope module.
- `reaper/packs/core/refs.lua` if new refs or bucket behavior is needed.
- `reaper/packs/core/verify.lua` if project or MIDI field verification
  enters expectedDelta.
- `docs/TEMPLATE_SPEC.md`
- `docs/TEMPLATE_AUTHORING.md`

Static tests:

- `get_state(project)` exposes tempo/time-signature fields needed by
  Phase 6.
- `get_state(midi_items)` enforces paging/projection and response budget.
- Non-MIDI items return typed errors for MIDI-only reads.
- Empty-take behavior is pinned.
- Any new entity bucket has manifest alignment coverage.

Live smoke:

1. Open a project with one normal audio item and one MIDI item.
2. Read project tempo/time signature.
3. Read MIDI item position/length and active take metadata.
4. Read note/CC count and first/last sampled events.
5. Try MIDI readback on the audio item and expect a typed error.
6. Try empty-take MIDI item readback if practical and expect the pinned
   typed error.

Pitfalls:

- Do not make the first MIDI writer carry its own private readback logic.
- Do not return full note arrays without paging.
- Do not add a new `midi_item` bucket unless the resolver, manifest, and
  `LAST_RESULT` behavior are all updated together.

Exit criteria:

- Project tempo/time-signature readback is available.
- MIDI item/note/CC readback contract is available and budgeted.
- Phase 6 can verify MIDI writes through shared read scopes.

### Phase 6: MIDI / Music Sketch MVP

Goal:

- Bring MIDI writing into the verified template model.

Prerequisite:

- Phase 5.5 is green. Do not implement MIDI writers before project and
  MIDI readback exist.

Non-goals:

- No musical creativity in Lua.
- No automatic plugin choice.
- No mastering / mix chain.
- No one-note-per-call workflow.

Likely contracts:

- New entity kind: `midi_item`, or reuse `item` with explicit media type.
  Recommendation: prefer `midi_item` if verification and refs become
  clearer enough to justify the new bucket.
- `project_tempo_set`
- `midi_item_create`
- `midi_note_add_batch`
- `midi_cc_add_batch`
- `get_state(midi_items)` with paging/projection.

MIDI batch decision:

- Recommended: return changed item/take refs and verify sampled note data
  through readback, rather than returning one changed id per note.
- Rationale: one changed id per note will exceed the 50-id envelope cap.
- `expectedDelta` must either use project/MIDI-aware field verification
  from Phase 5.5 or declare a narrow, documented batch verification
  carve-out.

Verification:

- Tempo readback.
- MIDI item position/length readback.
- Note count readback.
- First/last note pitch/velocity/PPQ sample readback.
- Cursor-based read for larger note lists.

Live smoke:

- Set tempo/time signature.
- Create one or more MIDI items.
- Add a batch of notes and CC.
- Read back note count and first/last notes.
- Optional: render/audition is a later phase, not required for write
  correctness.

Pitfalls:

- Do not create `midi_song_compose`.
- Do not make one `call_template` per note.
- Do not let note arrays bypass response budget on readback.

Exit criteria:

- A four-section motif sketch can be written and read back.
- Musical quality remains agent/user responsibility.

### Phase 7: FX / Routing / Automation Expansion

Goal:

- Add enough FX, routing, and automation control to make MIDI and layered
  scenes sound intentionally arranged.

Non-goals:

- No plugin marketplace.
- No vendor-specific template explosion.
- No automatic mix/master decisions.

Likely read additions:

- `get_state(tracks, include:["fx","fx_params"])`
- `get_state(routing)`
- `get_state(automation)`

Likely templates:

- `fx_add`
- `fx_bypass_set`
- `fx_param_set`
- `send_create`
- `send_level_set`
- `envelope_point_add`
- `envelope_clear_range` only if destructive policy is settled

Verification:

- FX slot count.
- FX name/ident readback.
- Param value readback with param-specific tolerance.
- Send count / destination readback.
- Envelope point count and sampled point readback.

Pitfalls:

- Do not create one template per vendor plugin.
- Do not expose arbitrary FX chunk editing in normal packs.
- Do not assume parameter normalized value maps to meaningful units; keep
  metadata honest.

Exit criteria:

- One fixture project receives a basic FX chain, a send, and one
  automation envelope with verified readback.

### Phase 8: OpenAudio / OpenCue Integration Demos

Goal:

- Demonstrate the four north-star workflows with OpenAudio and OpenCue
  boundaries respected.

Non-goals:

- Do not move OpenAudio or OpenCue implementations into OpenReaper.
- Do not hard-bind OpenReaper code to an external product-system file that
  is not readable in this repo.

Contracts:

- OpenAudio -> agent:
  `{ local_path, metadata }`.
- Agent -> OpenReaper:
  `media_import` and downstream template calls.
- OpenCue -> agent:
  scene plan / step list.
- Agent -> OpenReaper:
  ordinary `get_state` and `call_template` sequence.

Verification:

- Each demo must still pass OpenReaper's own static and live smoke
  criteria.
- Cross-product integration must not create hidden write paths.

Pitfalls:

- Do not duplicate library search in OpenReaper.
- Do not let OpenCue write ReaScript.
- Do not let OpenAudio mutate REAPER.

Exit criteria:

- Four machine-rerunnable smoke scripts exist, one per north-star
  workflow. Demo videos are optional evidence, not the primary
  verification artifact.
- Each demo can be rerun on the verified macOS environment.
- Public story updated without overclaiming Windows/Linux or full
  production readiness.

## 6. Four-Scene Dependency Matrix

| Scene | Required OpenReaper pieces | Required read/artifact contracts | OpenAudio | OpenCue | MVP definition |
|---|---|---|---|---|---|
| Seamless loop | `item_audio_analyze`, `item_trim`, `item_fade`/`item_crossfade`, `take_loop_set`, `region_create`, `render_region`, loop recipe | `get_state(analysis)`, loop QA report, recipe assertions | No | Optional | One imported sample becomes one loop WAV with click QA pass and rerunnable recipe smoke |
| Drag classify + layer | `item_audio_analyze`, `item_split_by_silence`, `item_align_to_transient`, `track_create`, `track_color`, `item_move`, `item_duplicate`, layer recipe | `get_state(analysis)`, `layer_plan`, `layer_report`, item position/track readback | No | Optional | One raw sample splits into >=4 segments placed/aligned on approved role tracks |
| Cleanup + delivery | `cleanup_plan`, `cleanup_apply_safe`, delivery plan/report, track rename/color/folder/routing templates, render/export validation | `get_state(plan)`, `get_state(report)`, routing/naming scopes, delivery checklist artifact | No | Optional | Dirty fixture plan/apply is deterministic, then one deliverable file is validated |
| MIDI / music sketch | `project_tempo_set`, `midi_item_create`, `midi_note_add_batch`, `midi_cc_add_batch`, MIDI sketch recipe, later FX/automation | `get_state(midi_items)`, recipe assertions, later `fx_params`/`automation` | No | Optional | Tempo + four motif sections written/read back through rerunnable recipe smoke |

## 7. Verification Strategy

Every capability category has a preferred verification family.

| Capability category | Verification | Notes |
|---|---|---|
| Pack loading | Deterministic discovery + namespace/collision tests + two-pack live smoke | Phase 0.5 before non-core domain growth |
| In-place mutation | `expectedDelta.count` + `expectedDelta.fields[]` | Existing H2 path |
| Creates/maybeCreates | Count delta + field readback on changed refs | Existing create/maybeCreate relaxations |
| Artifact-producing template | Artifact exists, schema validates, ref can be read through `get_state` | Requires G7A; persisted artifact implies `risk: filesystem` |
| Audio analysis | Artifact schema + projected readback + repeatability within tolerance | Not a project-state mutation; `mutates:false` still may write OpenReaper state |
| Recipe / scene | `list_recipes` contract + fixture smoke + per-step assertions/report links | No chat-only workflows |
| Render artifact | Existing `render_region` file exists / non-empty / sidecar-clean path | Extend carefully |
| Cleanup plan | Project-read-only determinism + stale detection + apply step verification | Plan/apply split; reports are artifacts |
| Delivery report | Output file existence/non-empty + naming/sidecar checklist artifact | Mastering/loudness automation deferred |
| Multi-id variable create | Count/truncation contract + first/last/sample field readback | Phase 4.5 before split/layer |
| MIDI batch | Count/readback sampling, not one changed id per note | Requires Phase 5.5 project/MIDI readback |
| OpenAudio metadata | OpenAudio's own contract; OpenReaper verifies path import | Keep boundary clean |

### Universal Static Gates

Run before commit:

```bash
npm run build
npm test
npm run check:manifest
npm run check:error-codes-fresh
npm run check:template-authoring
git diff --check
```

### Universal Live Smoke Protocol

Required when any runtime Lua, manifest, verify logic, bridge boot path,
entity bucket, ref resolver, artifact filesystem, or REAPER API behavior
changes.

Protocol:

1. Fully quit REAPER.
2. Reopen REAPER.
3. Run current `start_bridge.lua`.
4. Confirm console:
   - `bridge starting (generation 1)`
   - `loaded error_codes (...)`
   - ready line includes expected templates.
5. Run `ping`.
6. Run `list_templates` / relevant `get_state`.
7. Run happy-path calls.
8. Run at least one typed negative.
9. Confirm no `VERIFY_FAILED` unless deliberately testing a failure.
10. Confirm queue cleanup:
    `pending=0`, `running=0`, `done=0`; `bridge_owner` may remain.

Stale Lua symptoms:

- Multiple ready lines.
- Generation greater than expected after supposed full restart.
- `last_result` points to old data.
- Verify fields missing newly added descriptor data.

When in doubt, restart REAPER again.

## 8. Startup / Install UX

Current stance:

- Keep `npm run setup`.
- Keep generated `start_bridge.lua`.
- Keep setup-out config snippets.
- Do not silently edit user configs.
- Manual REAPER `Actions -> ReaScript: Load... -> Run` remains acceptable
  for the current verified path.

Future opt-in autostart may be added only with:

- Explicit flag such as `npm run setup -- --autostart`.
- Marker block in `__startup.lua`.
- Timestamped backup.
- Idempotent update.
- Removal command.
- No `reaper-kb.ini` edits.
- No `reaper.ini` edits.

Potential marker:

```lua
-- BEGIN openreaper-autostart (managed by setup)
pcall(dofile, "/absolute/path/to/repo/reaper/streetlight_bridge.lua")
-- END openreaper-autostart
```

This belongs in a dedicated slice, not as a drive-by change.

## 9. Decision Register

These decisions are not all locked by this file. They are the user-facing
choices future architect packets must resolve before coding.

| ID | Decision | Recommended default | Why | Must decide by |
|---|---|---|---|---|
| D1 | Phase order | Phase 0 -> pack contract -> artifact foundation -> cleanup -> delivery -> analysis -> recipe contract -> loop -> layer -> MIDI -> FX -> integrations | Proves shared contracts before scenes depend on them | Before Slice 20 if user wants a different order |
| D2 | Analysis result shape | Artifact `analysis:<id>` + `get_state(analysis)` | Large arrays cannot live in envelopes | Before Phase 3 |
| D3 | Cleanup policy | Always plan-first; split safe apply from destructive apply | Useful demo stays write-safe; real destructive work remains gated | Before Phase 2 |
| D4 | Startup autostart | v0.2 opt-in marker block | Reduces friction without silent config edits | Before install UX slice |
| D5 | MIDI batch verification | Return item/take refs + sampled note readback | Avoid changed_ids overflow | Before Phase 6 |
| D6 | Analysis computation location | Lua PCM accessor first | Zero dependency and same REAPER context | Before Phase 3 |
| D7 | New pack loading | Add real pack-loading before first non-core pack | Avoid hiding new packs inside core forever | Before whichever phase introduces the first non-core pack: Phase 2 if cleanup is a pack, Phase 4 if loop is first |
| D8 | Cleanup destructive split | `cleanup_apply_safe` + later `cleanup_apply_destructive` | Most cleanup is reversible; demo need not require destructive env opt-in | Before Phase 2 |
| D9 | Artifact `changed_count` semantics | Prefer one changed id for one produced artifact, unless the G7A model explicitly chooses otherwise | Keeps envelope honest and simple | Before Phase 1 |
| D10 | Product-system doc sync | User decides what to mirror into external product-system repo | Those files are outside OpenReaper repo authority | After this file lands |
| D11 | Artifact finalization / `LAST_RESULT` semantics | Choose one G7A model; recommended default is `changed_ids` artifact refs plus no item/track/region `LAST_RESULT` update, unless artifact chaining is truly needed | Prevents analysis/plan/report from corrupting existing ref chains | Before Phase 1 implementation |
| D12 | Cleanup apply execution model | Agent-step execution first; narrow apply template only if it returns a report artifact and reuses verified small operations | Avoids a forbidden mega-handler and keeps expectedDelta per step | Before Phase 2 |
| D13 | Multi-id verification form | Add Phase 4.5 before `item_split_by_silence`; verify count/truncation plus first/last/sample fields | Variable creates need a shared proof model | Before Phase 5 |
| D14 | Project/MIDI readback scope | Add Phase 5.5 before MIDI writers; decide item-vs-midi_item bucket and paged note/CC reads | MIDI writes cannot be verified by entity refs alone | Before Phase 6 |
| D15 | Pack contract | Phase 0.5 before first non-core domain capability; no core parking lot | Keeps extension modular and prevents domain code pile-up | Before Phase 2 if cleanup is a pack; otherwise before the first non-core pack |
| D16 | Recipe contract | Phase 3.5 before first scene MVP; recipe schema + `list_recipes` + fixture smoke | Prevents chat-only orchestration and makes workflows reusable | Before Phase 4 |
| D17 | Cleanup vs delivery claim | Cleanup MVP in Phase 2; delivery claim only after Phase 2.5 output validation | Avoids saying "delivery" when no deliverable file was verified | Before public story update |
| D18 | Layer/classify plan artifact | `layer_plan` / `role_assignment_plan` with approval and readback | Closes classify loop without putting semantic guessing in Lua | Before Phase 5 |

## 10. How To Start The Next Slice

Every next slice should begin by reading this file, then producing a
slice-specific packet with:

1. Which phase this slice advances.
2. Which gate(s) it touches.
3. Exact non-goals.
4. Files likely touched.
5. Descriptor / schema changes.
6. Error-code changes, if any.
7. Static tests.
8. Live smoke recipe.
9. Regression points.
10. User decisions.

Do not start implementation from a vague scene goal like "make loop
factory." Start from the smallest contract that makes the next verified
step possible.

Good next-slice candidates:

- Slice 20A: second H6-flow core template (`track_mute_set` or
  `track_folder_set`) to prove repeatability.
- Slice 20B: pack contract architect packet or implementation slice,
  depending on how much Phase 0.5 can be safely scoped.
- Slice 20C: artifact contract architect packet only, no code. This is
  mandatory before any cleanup, analysis, loop QA, or report artifact
  template ships.
- Slice 20D: recipe contract architect packet only, no code. This is
  mandatory before the first scene MVP ships.

Choose one. Do not merge them into a giant slice.

## Appendix A: Slice Packet Template

Use this skeleton for every future architect packet.

```md
# Slice NN Architect Plan - <Title>

Date:

Phase:

## Goal

One paragraph.

## Non-Goals

- ...

## Current Baseline

- Current template count:
- Current static baseline:
- Last live smoke:

## Contract

Template / read scope / artifact / pack / recipe contract.

## Files Touched

- ...

## Implementation Steps

1. ...

## Static Gates

- `npm run build`
- `npm test`
- `npm run check:manifest`
- `npm run check:error-codes-fresh`
- `npm run check:template-authoring`
- `git diff --check`

## Live Smoke

Required or not required. If required, exact recipe.

## Risks

- ...

## Regression Points

- ...

## User Decisions

- D1:
```

## Appendix B: Review Checklist

Before marking a slice complete:

- It cites this file and the relevant phase.
- It does not add MCP tools.
- It does not add a mega-handler.
- It has one primary contract/capability; otherwise it is split.
- It preserves the locked `call_template` envelope.
- It has a response-budget story for all list/artifact reads.
- It keeps pack ownership explicit and does not park domain code in core
  without an expiry/migration slice.
- It uses a recipe contract or smoke script for scene workflows; no
  chat-only orchestration.
- It keeps errors typed.
- It uses generated Lua error constants.
- It does not mutate before runtime preconditions are checked.
- It has an `expectedDelta` or explicit artifact carve-out.
- It has static tests.
- It has live smoke if runtime changed.
- It has a machine-rerunnable smoke when it claims progress on a
  north-star workflow.
- It updates status docs.
- It does not overclaim in `PUBLIC_STORY.md`.
