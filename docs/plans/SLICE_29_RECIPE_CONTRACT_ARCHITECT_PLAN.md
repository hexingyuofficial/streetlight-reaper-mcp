# Slice 29 Architect Plan — Recipe Contract Foundation v1

Status: implemented as a TS/YAML/docs-only slice; static verification pending.

## Goal

Upgrade `list_recipes` from envelope-only YAML passthrough to a
discoverable, statically validated recipe contract foundation for future
loop-factory work.

This slice does **not** add a recipe executor. Recipes remain
agent-readable workflow guides. The server only lists and validates
contract metadata.

## Locked Decisions

- S29-D1: Slice 29 is recipe contract v1.
- S29-D2: legacy recipes remain passthrough; only
  `contract_version: 1` enters strict validation.
- S29-D3: invalid v1 recipes are skipped and surfaced in
  `warnings[]`; `list_recipes` remains `ok:true`.
- S29-D4: add an analysis-owned fixture recipe that describes
  agent-step analysis/artifact assertions but does not execute.
- S29-D5: no REAPER live smoke is required because this slice is
  TS/YAML/docs only.
- S29-D6: validate enabled-pack template names, read-scope names, and
  artifact schema names; do not validate template params or Jinja
  placeholders.
- S29-D7: recipe metadata must use `read_scope:"artifact"` and schema
  `openreaper.analysis.item_audio.v1`; do not add
  `get_state(scope:"analysis")`.

Additional user constraints:

- No new MCP tool.
- No recipe executor.
- No loop or MIDI mutation.
- No OpenCue, AI, OpenAudio, marketplace, unsafe pack, or core parking.
- No `get_state(scope:"analysis")`.

## Contract v1

Contract-v1 recipes keep the existing envelope fields:

- `id`
- `description`
- `version`
- `inputs`
- `steps`

They additionally declare:

- `contract_version: 1`
- `execution_model: "agent_step"`
- `required_packs`
- `required_templates`
- `required_read_scopes`
- `required_artifact_schemas`
- `produces`
- `approval_points`
- `assertions`
- `fixture_smoke`

The validation is intentionally metadata/reference-only:

- `required_packs` must be enabled.
- `required_templates` must be registered by the enabled packs.
- `required_read_scopes` must be known `get_state` scopes.
- `required_artifact_schemas` and `produces[].schema` must be exposed
  by enabled template artifact metadata.
- `produces[].read_scope`, when present, must be `artifact`.
- Placeholders and template params are not validated in this slice.

Legacy recipes without `contract_version` continue to load using the
Step 7 passthrough behavior. This protects `recipes/impact_variations.yaml`.

## Files

- `packages/mcp-server/src/tools/list-recipes.ts`
- `packages/mcp-server/src/tools/__tests__/list-recipes.test.ts`
- `reaper/packs/analysis/recipes/analysis_loop_candidate_probe.yaml`
- `docs/RECIPES.md`
- `docs/packs/analysis/README.md`
- `docs/smokes/recipe_contract.md`
- `docs/HANDOFF.md`
- `docs/PROGRESS.md`
- `docs/NEXT_WINDOW_BRIEFING.md`

## Static Gates

- `npm run build`
- `npm test`
- `npm run check:error-codes-fresh`
- default `npm run check:manifest`
- default `npm run check:template-authoring`
- `STREETLIGHT_ENABLED_PACKS=core,analysis npm run check:manifest`
- `STREETLIGHT_ENABLED_PACKS=core,analysis npm run check:template-authoring`
- all-pack manifest/template-authoring sweep
- `git diff --check`

Focused assertions:

- valid v1 recipe appears with contract metadata;
- invalid v1 recipe is skipped with `warnings[]`;
- legacy recipes remain passthrough;
- disabled-pack / missing-template / missing-schema references warn;
- `scope:"analysis"` is rejected in recipe metadata;
- no MCP tool count changes.

## Optional Live Smoke

Not required unless implementation accidentally touches runtime code.

If extra reassurance is desired:

1. Fully quit/reopen REAPER.
2. Load `_G.STREETLIGHT_ENABLED_PACKS = "core,analysis"` and the bridge.
3. `ping`.
4. `list_recipes`; confirm
   `analysis:analysis_loop_candidate_probe` appears with
   `pack:"analysis"`, `execution_model:"agent_step"`, required template
   `item_audio_analyze`, read scope `artifact`, and schema
   `openreaper.analysis.item_audio.v1`.
5. Manually execute the recipe's described steps on one selected item.
6. Read the artifact through `get_state(scope:"artifact")`.

## Risks

- Over-validating recipes could break existing legacy workflows.
- Accidentally building an executor would violate the slice.
- Reintroducing `scope:"analysis"` would fight the artifact contract.
- Cross-pack validation can become brittle if disabled packs are
  assumed to exist.
- Loop-factory work should wait until after this contract lands.

## Rollback

Revert only Slice 29 files: recipe loader schema/tests, the analysis
fixture recipe, and docs. No Lua runtime, bridge, queue, artifact
lifecycle, or REAPER project state is affected.
