# Recipe Contract Smoke

Slice 29 is TS/YAML/docs only. REAPER live smoke is not required unless
runtime files change.

## Static Smoke

1. Run:

   ```sh
   npm run build
   npm test
   npm run check:error-codes-fresh
   npm run check:manifest
   npm run check:template-authoring
   STREETLIGHT_ENABLED_PACKS=core,analysis npm run check:manifest
   STREETLIGHT_ENABLED_PACKS=core,analysis npm run check:template-authoring
   STREETLIGHT_ENABLED_PACKS=core,cleanup,delivery,analysis,pack_contract_fixture npm run check:manifest
   STREETLIGHT_ENABLED_PACKS=core,cleanup,delivery,analysis,pack_contract_fixture npm run check:template-authoring
   git diff --check
   ```

2. Call `list_recipes` with default packs. Expected:
   `impact_variations` remains listed as a legacy recipe.

3. Call `list_recipes` with:

   ```sh
   STREETLIGHT_ENABLED_PACKS=core,analysis
   ```

   Expected:

   - `analysis:analysis_loop_candidate_probe` appears;
   - `contract_version` is `1`;
   - `execution_model` is `agent_step`;
   - `required_templates` contains `item_audio_analyze`;
   - `required_read_scopes` is `["selection","artifact"]`;
   - `required_artifact_schemas` contains
     `openreaper.analysis.item_audio.v1`.

4. Negative fixture tests live in
   `packages/mcp-server/src/tools/__tests__/list-recipes.test.ts`:

   - bad v1 recipe -> skipped with warning;
   - legacy recipe -> passthrough;
   - disabled required pack -> warning;
   - missing required template -> warning;
   - missing artifact schema -> warning;
   - `required_read_scopes:["analysis"]` -> warning.

## Optional REAPER Smoke

Only run this if you want extra assurance that an agent can follow the
fixture recipe manually.

1. Fully quit/reopen REAPER.
2. Load:

   ```lua
   _G.STREETLIGHT_ENABLED_PACKS = "core,analysis"
   dofile("/Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/streetlight_bridge.lua")
   ```

3. `ping`.
4. `list_recipes`; confirm
   `analysis:analysis_loop_candidate_probe` metadata.
5. Select one known audio item.
6. Manually follow the listed recipe steps:
   `get_state(selection)` -> `call_template item_audio_analyze` with
   `features:["loop_candidates","click_risk"]` -> `get_state(artifact)`.

This smoke must not mutate REAPER beyond whatever source item is already
selected.
