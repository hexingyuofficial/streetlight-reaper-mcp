# Recipe Contract

Recipes are YAML workflow guides for agents. OpenReaper lists them
through `list_recipes`; it does not execute them.

## Legacy Recipes

Recipes without `contract_version` keep the original Step 7 behavior:

- top-level envelope fields are validated lightly;
- unknown top-level fields are passed through;
- placeholder syntax and template params are not validated;
- bad files are skipped with `warnings[]`, while `list_recipes`
  returns `ok:true`.

`recipes/impact_variations.yaml` intentionally remains a legacy recipe.

## Contract Version 1

Contract-v1 recipes add metadata that lets agents and reviewers know
which packs, templates, read scopes, and artifact schemas a workflow
depends on.

Required fields:

```yaml
contract_version: 1
execution_model: agent_step
required_packs: [core, analysis]
required_templates: [item_audio_analyze]
required_read_scopes: [selection, artifact]
required_artifact_schemas: [openreaper.analysis.item_audio.v1]
produces:
  - type: artifact
    schema: openreaper.analysis.item_audio.v1
    read_scope: artifact
    ref_prefix: "artifact:analysis:analysis:"
approval_points:
  - id: selected_audio_item
    description: Agent must confirm exactly one selected audio item.
assertions:
  - id: artifact_ref_only
    description: call_template returns only artifact refs.
fixture_smoke:
  description: Select one item, run the recipe steps manually, and read
    the resulting artifact.
```

Validation is intentionally metadata-only:

- `required_packs` must be enabled.
- `required_templates` must be registered by enabled packs.
- `required_read_scopes` must be known `get_state` scopes.
- `required_artifact_schemas` and `produces[].schema` must be exposed by
  enabled template artifact metadata.
- `produces[].read_scope`, when present, must be `artifact`.

Validation does **not** inspect Jinja placeholders, template params, or
step execution. The agent still owns orchestration.

Invalid v1 recipes are skipped and reported in `warnings[]`; they do not
make `list_recipes` fail.

## Artifact Reads

Recipes that depend on analysis or other JSON artifacts must declare:

```yaml
required_read_scopes:
  - artifact
```

Do not declare `analysis` as a read scope. Analysis artifacts are read
through:

```json
{ "scope": "artifact", "artifact_ref": "...", "view": "summary" }
{ "scope": "artifact", "artifact_ref": "...", "view": "payload" }
```

## Non-Goals

Recipe contract v1 is not:

- a recipe executor;
- a batch engine;
- an OpenCue replacement;
- a marketplace/install format;
- a permission system;
- a mutation DSL.

It is the smallest stable contract needed before loop-factory recipes
can become reusable instead of chat-only instructions.
