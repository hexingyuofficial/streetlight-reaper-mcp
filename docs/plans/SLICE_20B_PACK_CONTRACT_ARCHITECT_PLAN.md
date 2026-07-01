# Slice 20B Architect Plan - Phase 0.5 Pack Contract Foundation

Date: 2026-07-01

Phase: 0.5 from
[`OPENREAPER_FIRST_REAL_VERSION_EXECUTION_PLAN.md`](OPENREAPER_FIRST_REAL_VERSION_EXECUTION_PLAN.md)

Status: executed by Codex on 2026-07-01. Static gates are green,
reviewer follow-up is fixed, static smoke passed, and REAPER fixture
live smoke passed. Local commit is pending user instruction. Do not push
from this packet alone.

## Plan Score

**9 / 10.**

The first-real-version plan is correctly ordered: G13 prevents `core`
from becoming a parking lot, G15 keeps this slice small, and Phase 0.5
places pack boundaries before cleanup / loop / MIDI / unsafe / user
features start competing for space. The missing 1 point is intentional:
the master plan states the principle, but does not yet define the exact
v1 pack contract. This slice exists to make that contract concrete enough
for the next Codex window to implement without inventing rules mid-code.

## Implementation Status (2026-07-01)

Current working-tree implementation follows this packet:

- `packages/core/src/packs.ts` implements pack-id parsing and validation.
- `registerEnabledTemplates(...)` keeps `core` default and adds an
  explicit `pack_contract_fixture` path.
- `list_templates` remains bridge-free and exposes pack ownership via
  metadata.
- `list_recipes` exposes `recipe_roots[]`, `pack`, and
  `qualified_id = "<pack>:<id>"`.
- `scripts/manifest-alignment.mjs` checks enabled packs and entity bucket
  conflicts.
- `scripts/template-authoring-lint.mjs` checks enabled pack source files
  and examples.
- `reaper/packs/core/lib/pack_loader.lua` and
  `reaper/streetlight_bridge.lua` load static repo-local packs.
- `pack_contract_fixture` exists on both TS and Lua sides and includes a
  fixture recipe and docs namespace.

Reviewer follow-up:

- Non-core packs cannot introduce new entity kinds in Slice 20B; they may
  only reuse core's existing entity kinds. This is enforced in the Lua
  pack loader and manifest alignment tests.
- Recipe ids are lower_snake_case without `:`; duplicate
  `qualified_id`s are skipped with warnings instead of producing an
  ambiguous `list_recipes` result.

Static gates run by Codex after reviewer follow-up:

```sh
npm test                                            # 376/376
npm run build                                      # clean
npm run check:error-codes-fresh                    # 22 codes fresh
npm run check:manifest                             # 12 templates / 1 pack
STREETLIGHT_ENABLED_PACKS=core,pack_contract_fixture npm run check:manifest
                                                    # 13 templates / 2 packs
npm run check:template-authoring                   # 12 templates
STREETLIGHT_ENABLED_PACKS=core,pack_contract_fixture npm run check:template-authoring
                                                    # 13 templates
git diff --check                                   # clean
```

Live-smoke evidence:

- REAPER `7.71/macOS-arm64`.
- Bridge loaded with `_G.STREETLIGHT_ENABLED_PACKS =
  "core,pack_contract_fixture"`.
- Console showed `loaded pack 'core' v0.1.0 (12 templates)`,
  `loaded pack 'pack_contract_fixture' v0.1.0 (1 templates)`, and
  ready line with `fixture_track_rename`.
- Stamp `1782881931841`; track GUID
  `guid:{76CC9D4E-3F98-CE4E-B02A-A34C0F03D870}`.
- Fixture-enabled `list_templates` returned 13 templates, and
  fixture-enabled `list_recipes` returned both
  `core:impact_variations` and
  `pack_contract_fixture:fixture_pack_smoke`.
- Core `track_color`, fixture `fixture_track_rename`, and core
  `track_rename` all routed through `last_result:track:0` and returned
  the same track GUID.
- Missing fixture track returned typed `TRACK_NOT_FOUND`.
- Default core-only registry kept fixture hidden and returned
  `TEMPLATE_NOT_FOUND` before queue write.
- Queue cleanup ended `pending=0`, `running=0`, `done=0`.

## Source Documents Read

This packet derives from:

- `docs/HANDOFF.md`
- `docs/PROGRESS.md`
- `docs/NEXT_WINDOW_BRIEFING.md`
- `docs/TEMPLATE_AUTHORING.md`
- `docs/plans/OPENREAPER_FIRST_REAL_VERSION_EXECUTION_PLAN.md`
- `docs/plans/KERNEL_HARDENING_PLAN.md`
- `docs/plans/KERNEL_HARDENING_EXECUTION.md`

The binding references inside the first-real-version plan are:

- G13 No Core Parking Lot
- G15 Slice Complexity Budget
- Phase 0.5 Pack Contract Foundation
- Decision Register D15 Pack contract
- Appendix B Review Checklist

## Goal

Define and implement the smallest real pack-loading contract so future
domain capabilities enter OpenReaper through named packs instead of being
parked in `core`.

This slice should make these statements true:

1. `core` is the kernel pack, not a dumping ground.
2. The bridge can load `core` plus a minimal non-core fixture pack in a
   deterministic order.
3. The MCP server can register templates from enabled packs in the same
   deterministic order.
4. `list_templates` and `list_recipes` expose enough pack ownership for
   agents and users to know where a capability came from.
5. Static alignment checks cover every enabled pack.
6. Disabled packs do not appear in tool output and are not callable.

## Non-Goals

- No marketplace.
- No dynamic network install.
- No remote plugin download.
- No user-pack install UX.
- No unsafe/dev pack behavior.
- No `unsafe_eval`.
- No scaffolder write mode.
- No cleanup implementation.
- No loop-factory implementation.
- No MIDI implementation.
- No artifact contract implementation.
- No recipe execution engine.
- No OpenAudio / OpenCue integration.
- No new MCP tools.
- No new domain capability parked in `core`.

If a later slice wants to temporarily place a domain capability in
`core`, that later slice must name an expiry slice and include a migration
checklist. "Move it later" is not enough.

## Current Baseline

- Latest pushed checkpoint before this plan:
  `7bbd426 docs: sync slice 19 pushed state`.
- H6 basic loop is closed through Slice 19.
- Current core template count: 12.
- `CapabilityDefinition.pack` already exists on the TS side.
- `list_templates` already returns `pack` in each `CapabilityMetadata`.
- Lua bridge still loads exactly one manifest:
  `reaper/packs/core/manifest.lua`.
- `scripts/manifest-alignment.mjs` currently aligns the TS core registry
  against `reaper/packs/core/manifest.lua` only.
- `list_recipes` currently reads repo-level `recipes/*.yaml` and does
  not attach pack ownership.
- `docs/TEMPLATE_AUTHORING.md` explicitly says new packs need a separate
  bridge pack-loading slice. This is that slice.

## Primary Contract

### 1. Minimal v1 Pack Contract

A v1 pack is a repo-local, statically loaded capability bundle.

Pack id:

- Lowercase id: `^[a-z][a-z0-9_]*$`.
- Examples: `core`, `pack_contract_fixture`, `cleanup`, `loop`, `midi`.
- Public display names may be prettier later, but v1 behavior is keyed by
  the stable id.

Pack surfaces:

1. **TS pack registration**
   - A pack contributes zero or more `CapabilityDefinition`s.
   - Every contributed definition must set `pack` equal to the pack id.
   - Template names remain globally unique in v1.
2. **Lua pack manifest**
   - A pack under `reaper/packs/<pack>/manifest.lua` returns:

     ```lua
     {
       name = "<pack>",
       version = "<semver-ish string>",
       entity_buckets = { ... optional ... },
       templates = { ... },
     }
     ```

   - `manifest.name` must equal the directory / pack id.
   - `templates` keys are global template names, not pack-local names.
   - `entity_buckets` is optional for non-core packs, but if present it
     must not conflict with already-loaded mappings.
3. **Pack docs**
   - Every non-core pack has `docs/packs/<pack>/README.md`.
   - The doc states purpose, risk posture, included templates, included
     recipes, live-smoke fixture, and whether the pack is enabled by
     default.
4. **Recipes**
   - A pack may own recipes.
   - v1 does not execute recipes; it only exposes recipe metadata.
5. **Artifacts**
   - v1 only reserves artifact-scope collision rules. It does not
     implement artifact refs or artifact `get_state` scopes.

### 2. Core Pack And Domain Pack Boundary

`core` owns kernel primitives and shared infrastructure:

- Bridge dispatcher.
- Queue protocol.
- Error codes.
- Entity buckets.
- Ref resolvers.
- Verification framework.
- Generic item / track / region / render primitives that are broadly
  useful across domains.
- Setup / install helpers.

`core` must not accumulate domain workflows:

- Cleanup.
- Loop factory.
- Layer/classify.
- MIDI sketching.
- Unsafe/dev eval.
- User-contributed experiments.
- OpenAudio/OpenCue integrations.

Domain packs own domain-specific capabilities:

- `cleanup` owns cleanup plan/apply/report capabilities.
- `loop` owns loop candidate / loop QA / render-loop workflow pieces.
- `midi` owns MIDI item/note/CC writers and MIDI readback helpers.
- `unsafe` or `dev` owns any explicitly opt-in dangerous bridge escape
  hatch, if it ever exists.
- Future user packs own user-specific experiments.

Domain packs may call into documented core contracts. They must not patch
core globals, rewrite core manifests, monkey-patch refs/verify behavior,
or add hidden side effects during `dofile`.

### 3. Naming And Collision Rules

Template names:

- v1 template names are globally unique across all enabled packs.
- `call_template` continues to accept a single unqualified template name.
- Duplicate template names across enabled packs fail startup / registry
  construction loudly.
- This keeps the locked MCP tool surface and current `call_template`
  shape unchanged.

Recipe ids:

- Recipe raw `id` is pack-local in v1.
- `list_recipes` returns both:

  ```json
  {
    "id": "impact_variations",
    "pack": "core",
    "qualified_id": "core:impact_variations"
  }
  ```

- Duplicate `qualified_id` is impossible if pack id and raw id are valid.
- Direct recipe execution remains out of scope.

Artifact scopes:

- v1 does not implement new artifact refs.
- Pack metadata may reserve future artifact scopes such as `analysis`,
  `plan`, or `report:cleanup`, but no runtime behavior is attached in
  this slice.
- Reserved scopes must be globally unique across enabled packs.
- Core-reserved scopes (`item`, `track`, `region`, `render`, and any
  already-documented future artifact scopes) cannot be claimed by a
  domain pack without a later artifact-contract plan.

Entity kinds / buckets:

- Existing core entity kinds stay: `item`, `track`, `region`, `render`.
- Non-core packs may reuse existing entity kinds.
- Adding a new entity kind is out of scope unless the slice is explicitly
  split and includes resolver / bucket / verify behavior.
- Duplicate `entity_kind -> bucket` mappings must match exactly or fail
  startup. Conflicting mappings fail.

### 4. Pack Enable / Disable Strategy

v1 needs enable/disable behavior, but not a user-facing UI.

Recommended v1:

- Default enabled packs: `core`.
- A deterministic enabled-pack list can be supplied for development /
  tests / live smoke through `STREETLIGHT_ENABLED_PACKS`.
- Value shape: comma-separated pack ids, e.g.
  `core,pack_contract_fixture`.
- Empty / missing value means `core`.
- `core` must always be enabled. If the list omits `core`, startup fails
  loudly rather than trying to run without kernel primitives.
- The TS side and Lua bridge must use the same parsing rules and the same
  default.
- For GUI REAPER live smoke where environment variables are awkward, the
  Lua bridge may also support a process-global override:

  ```lua
  _G.STREETLIGHT_ENABLED_PACKS = "core,pack_contract_fixture"
  dofile("/abs/path/to/reaper/streetlight_bridge.lua")
  ```

- This global is development/live-smoke plumbing only; it is not a user
  marketplace or install system.

Disabled packs:

- Do not register TS templates.
- Do not load Lua manifests.
- Do not appear in `list_templates`.
- Do not contribute recipes to `list_recipes`.
- Are not callable; MCP-side `call_template` should return
  `TEMPLATE_NOT_FOUND` before hitting the bridge.

## How Tool Output Exposes Pack Ownership

### `list_templates`

The existing `CapabilityMetadata.pack` field is promoted from "mostly
always core" to a locked ownership field.

Required behavior:

- Every template metadata entry includes `pack`.
- Tests assert core templates still report `"core"`.
- Fixture pack templates report `"pack_contract_fixture"`.
- Sort order is deterministic:
  1. Pack order from the enabled-pack list.
  2. Registration order within each pack.
- Existing core descriptors stay stable except for any unavoidable order
  assertions that must account for the new fixture pack when enabled.

Optional but recommended if cheap:

- Include `pack_version` in metadata only if the type/schema change stays
  small. If this risks widening the slice, defer it and rely on `pack`.

### `list_recipes`

Current recipe loading is repo-level. Slice 20B should make ownership
explicit without building a recipe execution engine.

Required behavior:

- `list_recipes` scans recipes from enabled packs plus the existing
  repo-level `recipes/` only if that repo-level directory is assigned a
  pack owner (`core` recommended).
- Each returned recipe includes:

  ```json
  {
    "id": "<raw id>",
    "pack": "<pack>",
    "qualified_id": "<pack>:<raw id>"
  }
  ```

- Warnings include pack context:

  ```json
  {
    "pack": "core",
    "file": "broken.yaml",
    "error": "..."
  }
  ```

- Bad recipe files in one pack do not block recipes from other packs.

Non-goals:

- No recipe executor.
- No placeholder validation.
- No scene workflow.
- No user approval schema.

## Manifest Alignment Across Multiple Packs

`scripts/manifest-alignment.mjs` must become pack-aware.

Recommended shape:

1. Build the TS registry from the same enabled-pack list used by the MCP
   server.
2. Load every enabled Lua pack manifest from `reaper/packs/<pack>/`.
3. For each enabled pack:
   - `manifest.name` equals the pack id.
   - `manifest.version` is present.
   - Every TS definition with `def.pack === pack` has a Lua manifest
     entry.
   - Every Lua manifest template entry has a TS definition in the same
     pack.
   - `entity_kind`, `undoable`, `undo_flags`, and `expectedDelta`
     invariants still match the existing checks.
4. Across all enabled packs:
   - Duplicate template names fail.
   - Entity bucket conflicts fail.
   - Pack id format violations fail.
5. Disabled packs are ignored by default, but pure helper tests should
   exercise both enabled and disabled fixture behavior.

Keep one CLI:

```bash
npm run check:manifest
```

Do not introduce a parallel check that reviewers can forget.

## Lua Bridge Loading Plan

Current bridge hard-loads:

```lua
local MANIFEST = dofile(SCRIPT_DIR .. "packs/core/manifest.lua")
```

Slice 20B should replace that single manifest with a deterministic loader:

1. Parse enabled pack ids from `_G.STREETLIGHT_ENABLED_PACKS`, then
   `os.getenv("STREETLIGHT_ENABLED_PACKS")`, then default `"core"`.
2. Validate ids.
3. Require `core` to be present.
4. For each pack id in order:
   - Load `SCRIPT_DIR .. "packs/" .. pack_id .. "/manifest.lua"`.
   - Validate `manifest.name == pack_id`.
   - Validate `templates` table.
   - Merge `entity_buckets`.
   - Merge `templates`.
   - Log:

     ```text
     [streetlight] loaded pack 'core' v0.1.0
     [streetlight] loaded pack 'pack_contract_fixture' v0.1.0
     ```

5. Build a combined manifest table used by existing dispatch /
   `ENTITY_BUCKET` / `LAST_RESULT` code.

Pollution points to guard:

- Duplicate template names silently overwriting earlier pack entries.
- Non-core pack changing `core`'s entity bucket names.
- Non-core pack adding entity buckets without resolver / verify support.
- Non-core pack using `dofile` side effects to mutate `_G`.
- Pack manifests relying on current working directory instead of their
  own `debug.getinfo` path.
- Ready-line template list hiding which pack contributed a template.
- `LAST_RESULT` bucket reset behavior changing when pack count changes.
- Repeated `dofile` / generation guard / `bridge_owner` ownership still
  working with multi-pack loading.

The implementation should prefer one combined manifest object after
validation so the rest of bridge dispatch remains as unchanged as
possible.

## Fixture Pack Requirement

Yes, Slice 20B should include a minimal fixture pack.

Purpose:

- Prove non-core pack loading without shipping cleanup / loop / MIDI.
- Prove pack ownership in `list_templates` and `list_recipes`.
- Prove manifest alignment across at least two packs.
- Prove disabled packs disappear.

Recommended fixture:

- Pack id: `pack_contract_fixture`.
- Lua path:
  `reaper/packs/pack_contract_fixture/manifest.lua`.
- Docs:
  `docs/packs/pack_contract_fixture/README.md`.
- TS registration module:
  a small pack module under MCP server source, exact path chosen by
  implementation.
- One harmless write-safe undoable template:
  `fixture_track_rename`.

`fixture_track_rename` is intentionally boring:

- Params: `{ track_id: string, name: string }`.
- Entity kind: `track`.
- Risk: `write_safe`.
- Undoable: true.
- Undo flags: `TRACKCFG`.
- ExpectedDelta: `track.P_NAME <- name`.
- It duplicates existing core behavior only to prove the pack path.
- It is disabled by default, so it does not pollute normal user output.

Alternative if the implementer finds duplication too ugly:

- Use `fixture_track_color` with the same style as `track_color`.
- Do not create a read-only no-op template unless the bridge's
  `LAST_RESULT` behavior for `mutates:false` templates is explicitly
  tested; the fixture should be boring, not semantically novel.

## Files Likely Touched

TS / shared:

- `packages/core/src/registry.ts`
- `packages/core/src/types.ts` if pack metadata types need tightening.
- `packages/core/src/__tests__/registry.test.ts`

MCP server:

- `packages/mcp-server/src/templates/index.ts` or a new pack loader
  module.
- A new fixture pack registration module under
  `packages/mcp-server/src/`.
- `packages/mcp-server/src/tools/list-templates.ts`
- `packages/mcp-server/src/tools/list-recipes.ts`
- `packages/mcp-server/src/tools/__tests__/list-templates.test.ts`
- `packages/mcp-server/src/tools/__tests__/list-recipes.test.ts`
- `packages/mcp-server/src/tools/__tests__/call-template.test.ts` only
  if disabled-pack `TEMPLATE_NOT_FOUND` needs direct coverage there.

Scripts:

- `scripts/manifest-alignment.mjs`
- `scripts/__tests__/manifest-alignment.test.mjs`
- `scripts/template-authoring-lint.mjs` if template-file discovery must
  become pack-aware.
- `scripts/__tests__/template-authoring-lint.test.mjs`
- `scripts/__tests__/lua-structure.test.mjs`

Lua:

- `reaper/streetlight_bridge.lua`
- `reaper/packs/pack_contract_fixture/manifest.lua`
- `reaper/packs/pack_contract_fixture/templates/track.lua`
- Possibly a small shared pack-loader helper under `reaper/packs/core/lib/`
  if keeping bridge readable requires it.

Recipes/docs:

- Existing `recipes/` may become explicitly owned by `core`.
- Optional fixture recipe under a pack-owned recipes directory.
- `docs/packs/pack_contract_fixture/README.md`
- `docs/TEMPLATE_AUTHORING.md`
- `docs/HANDOFF.md`
- `docs/PROGRESS.md`
- `docs/NEXT_WINDOW_BRIEFING.md`
- This plan file.

## Implementation Steps

1. Add pure pack-id parsing / validation helpers on the TS side.
2. Refactor TS registration so enabled packs register in deterministic
   order.
   - Keep `registerCoreTemplates` as a compatibility wrapper if useful.
   - Add a pack-aware entry point used by the MCP server and tests.
3. Add a fixture pack TS registration module disabled by default.
4. Extend `CapabilityRegistry` or its callers only as much as needed to
   preserve duplicate-template fail-loud behavior across packs.
5. Make `list_templates` tests assert pack ownership for core and
   fixture entries.
6. Make recipe loading pack-aware.
   - Assign existing repo-level `recipes/` to `core`.
   - Add `pack` and `qualified_id` to returned recipe metadata.
   - Keep bad-YAML warning behavior.
7. Extend manifest alignment to iterate enabled packs.
8. Extend template authoring lint if it currently assumes all template
   files live under the single core templates directory.
9. Add the Lua fixture pack.
10. Replace the bridge's single-manifest load with deterministic
    multi-pack loading.
11. Preserve one combined manifest object for dispatch to minimize
    changes to finalization, undo, verification, and dedup.
12. Add Lua structure tests for:
    - enabled-pack parsing,
    - core required,
    - duplicate template detection,
    - fixture pack loading,
    - log/readiness behavior.
13. Update docs.
14. Run static gates.
15. Full REAPER restart and live smoke with fixture pack enabled.

## Static Tests

Required:

- `npm run build`
- `npm test`
- `npm run check:manifest`
- `npm run check:error-codes-fresh`
- `npm run check:template-authoring`
- `git diff --check`

Specific test cases to add:

1. Pack id parser:
   - missing / empty -> `["core"]`
   - `"core,pack_contract_fixture"` -> ordered pair
   - whitespace trimmed
   - duplicate ids rejected
   - invalid id rejected
   - missing core rejected
2. TS registry:
   - core-only default count stays 12
   - core+fixture count is 13
   - duplicate template names across packs throw
   - fixture disabled -> fixture template absent
3. `list_templates`:
   - every entry has `pack`
   - core `track_color` reports `pack:"core"`
   - fixture template reports `pack:"pack_contract_fixture"` when
     enabled
   - deterministic ordering by enabled-pack order
4. `list_recipes`:
   - existing core recipes return `pack:"core"`
   - `qualified_id` is present
   - bad YAML warning includes `pack`
   - disabled fixture recipes absent
5. Manifest alignment:
   - aligns core-only
   - aligns core+fixture
   - fails if TS says one pack but Lua manifest says another
   - fails duplicate Lua template names
   - fails entity bucket conflict
   - disabled fixture ignored by default
6. Authoring lint:
   - scans enabled pack template files, or documents why fixture templates
     are excluded from lint.
   - fails if fixture TS file exists but registration is missing.
7. Lua structure:
   - bridge no longer has a single `MANIFEST = dofile(...core...)` path.
   - bridge logs each loaded pack.
   - bridge validates `manifest.name`.
   - bridge detects duplicate template names.
   - bridge still builds `LAST_RESULT` from the combined entity buckets.
8. Existing regressions:
   - `track_color`, `track_create`, `render_region`, idempotency, and
     `get_state` tests still pass.

## REAPER Live Smoke Recipe

Required because this slice changes `streetlight_bridge.lua`, Lua pack
loading, manifest shape, and callable runtime templates.

Preconditions:

1. Full quit REAPER.
2. Reopen REAPER.
3. Load the bridge with fixture pack enabled. Recommended dev smoke form:

   ```lua
   _G.STREETLIGHT_ENABLED_PACKS = "core,pack_contract_fixture"
   dofile("/Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/streetlight_bridge.lua")
   ```

4. Console must show:
   - generation 1
   - loaded error codes
   - loaded pack `core`
   - loaded pack `pack_contract_fixture`
   - ready line including both core templates and the fixture template

Smoke:

1. `ping` -> connected.
2. `list_templates` -> 13 templates when fixture is enabled.
3. Assert `track_color.pack == "core"`.
4. Assert `fixture_track_rename.pack == "pack_contract_fixture"`.
5. `track_create`
   `{ name:"S20B Pack Smoke <stamp>", reuse_existing:true }`.
6. Call one core template on `last_result:track:0`, e.g.
   `track_color` `{ color:"#2D9CDB" }`.
7. Call fixture template on `last_result:track:0`, e.g.
   `fixture_track_rename`
   `{ name:"S20B Fixture Renamed <stamp>" }`.
8. Call a core template again, e.g. `track_rename
   last_result:track:0`, to prove `LAST_RESULT.tracks` still routes
   after crossing pack boundaries.
9. Negative:
   - missing track through fixture template returns `TRACK_NOT_FOUND`,
     not `INTERNAL_ERROR`.
10. Queue cleanup:
    - `pending=0`
    - `running=0`
    - `done=0`

Optional disabled-pack smoke:

1. Full quit/reopen REAPER.
2. Load bridge without `_G.STREETLIGHT_ENABLED_PACKS`.
3. `list_templates` -> 12 templates, fixture absent.
4. `call_template fixture_track_rename ...` through the normal MCP
   server returns `TEMPLATE_NOT_FOUND` before the bridge.

## User Decisions

Recommended values are conservative.

- S20B-D1: Pack id grammar.
  - Recommendation: `^[a-z][a-z0-9_]*$`.
- S20B-D2: Template name collision rule.
  - Recommendation: globally unique template names in v1; no
    `pack/template` call syntax yet.
- S20B-D3: Recipe id collision rule.
  - Recommendation: raw ids pack-local, expose `qualified_id =
    "<pack>:<id>"`.
- S20B-D4: Enable/disable strategy.
  - Recommendation: default `core`; dev/test override
    `STREETLIGHT_ENABLED_PACKS`; no UI/marketplace.
- S20B-D5: Fixture pack.
  - Recommendation: yes, `pack_contract_fixture`, disabled by default.
- S20B-D6: Fixture template.
  - Recommendation: `fixture_track_rename`, write-safe / undoable /
    track entity / `P_NAME` expectedDelta.
- S20B-D7: `list_templates` metadata.
  - Recommendation: lock existing `pack` field; defer `pack_version`
    unless implementation is trivial.
- S20B-D8: `list_recipes` metadata.
  - Recommendation: add `pack` and `qualified_id`; no executor.
- S20B-D9: Lua enable override.
  - Recommendation: support `_G.STREETLIGHT_ENABLED_PACKS` for GUI
    REAPER smoke plus env var for CLI/dev.
- S20B-D10: Temporary domain capability in core.
  - Recommendation: no. This slice is specifically to avoid that.

## Risks

- TS and Lua enabled-pack lists drift, causing MCP to expose templates the
  bridge cannot execute or the bridge to load templates the MCP server
  cannot validate.
- Fixture pack accidentally becomes enabled by default in normal user
  sessions.
- Duplicate template names silently overwrite each other in Lua table
  merge.
- A non-core pack mutates `_G` or core tables as a side effect of
  `dofile`.
- `LAST_RESULT` bucket construction changes when multiple manifests
  contribute entity buckets.
- `list_recipes` pack ownership accidentally breaks the existing
  `recipes/impact_variations.yaml` demo.
- Authoring lint keeps scanning only core templates and misses fixture
  / future pack templates.
- Live smoke uses a GUI REAPER environment that does not inherit the env
  var, making fixture pack appear absent unless `_G` override is used.

## Regression Points

- Core-only default must behave exactly like Slice 19:
  - 12 templates.
  - Existing `list_templates` metadata unchanged except stronger pack
    assertions.
  - Existing recipes still visible.
  - `track_color` still live-smokeable.
- `render_region` remains the only v0.1 artifact-path mutation carve-out.
- Read scopes still do not touch `LAST_RESULT`.
- `call_template` locked envelope stays unchanged.
- No new MCP tools appear.
- `risk` policy still gates by individual template risk, not pack risk
  alone.
- Error-code audit still scans runtime Lua and rejects raw literals.

## Reviewer Checklist For This Slice

Before code is accepted, reviewer should confirm:

- The slice cites Phase 0.5 and G13/G15.
- It has one primary contract: pack loading.
- It does not sneak in cleanup, loop, MIDI, unsafe, artifact, or recipe
  execution behavior.
- `core` remains the default and required pack.
- Fixture pack is disabled by default.
- Pack ownership is visible in both template and recipe listings.
- Duplicate/collision failures are loud.
- Manifest alignment covers every enabled pack.
- Lua bridge keeps one combined manifest after validation and does not
  rewrite unrelated dispatch/finalization behavior.
- Live smoke includes one call from core and one call from a non-core
  fixture pack.
- Status docs are updated after implementation.
- `PUBLIC_STORY.md` is not updated unless a user-facing capability ships;
  this is foundation, not a public demo claim.

## Exit Criteria

Slice 20B is complete only when:

- Core-only default still passes the full static baseline.
- Core+fixture pack mode passes static tests.
- `list_templates` exposes pack ownership for both packs.
- `list_recipes` exposes pack ownership / qualified ids.
- Manifest alignment validates all enabled packs.
- Disabled fixture pack is absent and uncallable.
- REAPER live smoke proves a fixture pack template can execute without
  breaking core `LAST_RESULT` routing.
- Docs describe the v1 pack contract and the next-domain capability path.
