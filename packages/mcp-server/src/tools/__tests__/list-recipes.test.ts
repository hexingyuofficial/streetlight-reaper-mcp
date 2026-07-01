import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { listRecipes, resolveRecipeRoots } from "../list-recipes.js";

const ORIG_ENV = process.env.STREETLIGHT_RECIPES_DIR;

function yamlList(key: string, values: string[]): string[] {
  if (values.length === 0) return [`${key}: []`];
  return [`${key}:`, ...values.map((value) => `  - ${value}`)];
}

function validContractV1(
  options: {
    requiredPacks?: string[];
    requiredTemplates?: string[];
    requiredReadScopes?: string[];
    requiredArtifactSchemas?: string[];
    produces?: string[];
  } = {},
): string {
  const requiredPacks = options.requiredPacks ?? ["core"];
  const requiredTemplates = options.requiredTemplates ?? ["item_pitch"];
  const requiredReadScopes = options.requiredReadScopes ?? ["selection"];
  const requiredArtifactSchemas = options.requiredArtifactSchemas ?? [];
  const produces = options.produces ?? ["produces: []"];

  return [
    "id: contract_demo",
    "description: contract v1 demo",
    "version: 0.1.0",
    "contract_version: 1",
    'execution_model: "agent_step"',
    ...yamlList("required_packs", requiredPacks),
    ...yamlList("required_templates", requiredTemplates),
    ...yamlList("required_read_scopes", requiredReadScopes),
    ...yamlList("required_artifact_schemas", requiredArtifactSchemas),
    ...produces,
    "approval_points:",
    "  - id: selected_item",
    "    description: Confirm one selected item.",
    "assertions:",
    "  - id: locked_envelope",
    "    description: The call returns the locked envelope.",
    "fixture_smoke:",
    "  description: Static-only fixture for recipe contract v1.",
    "  steps:",
    "    - tool: list_templates",
  ].join("\n");
}

describe("listRecipes", () => {
  let recipesDir: string;

  beforeEach(async () => {
    recipesDir = await fs.mkdtemp(path.join(os.tmpdir(), "streetlight-recipes-"));
    process.env.STREETLIGHT_RECIPES_DIR = recipesDir;
  });

  afterEach(async () => {
    if (ORIG_ENV === undefined) delete process.env.STREETLIGHT_RECIPES_DIR;
    else process.env.STREETLIGHT_RECIPES_DIR = ORIG_ENV;
    await fs.rm(recipesDir, { recursive: true, force: true });
  });

  it("env override is honored", async () => {
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes_dir).toBe(path.resolve(recipesDir));
    expect(result.result.recipe_roots).toEqual([
      { pack: "core", recipes_dir: path.resolve(recipesDir) },
    ]);
  });

  it("empty dir → ok with empty recipes and no warnings", async () => {
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes).toEqual([]);
    expect(result.result.warnings).toEqual([]);
  });

  it("missing dir → ok with single warning, recipes empty", async () => {
    process.env.STREETLIGHT_RECIPES_DIR = path.join(recipesDir, "does-not-exist");
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes).toEqual([]);
    expect(result.result.warnings).toHaveLength(1);
    expect(result.result.warnings[0]?.pack).toBe("core");
    expect(result.result.warnings[0]?.error).toMatch(/not found/i);
  });

  it("happy path: valid recipe parses with envelope fields", async () => {
    await fs.writeFile(
      path.join(recipesDir, "demo.yaml"),
      [
        "id: demo",
        "description: A demo recipe",
        "version: 1",
        "inputs:",
        "  count: 8",
        "steps:",
        "  - tool: get_state",
        "    params:",
        "      scope: selection",
      ].join("\n"),
    );
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes).toHaveLength(1);
    const r = result.result.recipes[0];
    expect(r?.id).toBe("demo");
    expect(r?.pack).toBe("core");
    expect(r?.qualified_id).toBe("core:demo");
    expect(r?.description).toBe("A demo recipe");
    expect(r?.version).toBe(1);
    expect(Array.isArray(r?.steps)).toBe(true);
    expect(result.result.warnings).toEqual([]);
  });

  it("passthrough preserves unknown top-level fields (variations, etc.)", async () => {
    await fs.writeFile(
      path.join(recipesDir, "passthrough.yaml"),
      [
        "id: pass",
        "description: passthrough check",
        "variations:",
        "  - name: v1",
        "    pitch: -3",
        "custom_field:",
        "  foo: bar",
      ].join("\n"),
    );
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const r = result.result.recipes[0] as Record<string, unknown>;
    expect(r["variations"]).toEqual([{ name: "v1", pitch: -3 }]);
    expect(r["custom_field"]).toEqual({ foo: "bar" });
  });

  it("contract_version:1 recipes expose strict contract metadata", async () => {
    await fs.writeFile(
      path.join(recipesDir, "contract.yaml"),
      validContractV1(),
    );

    const result = await listRecipes();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.warnings).toEqual([]);
    expect(result.result.recipes).toHaveLength(1);
    const recipe = result.result.recipes[0] as Record<string, unknown>;
    expect(recipe["contract_version"]).toBe(1);
    expect(recipe["execution_model"]).toBe("agent_step");
    expect(recipe["required_packs"]).toEqual(["core"]);
    expect(recipe["required_templates"]).toEqual(["item_pitch"]);
    expect(recipe["required_read_scopes"]).toEqual(["selection"]);
    expect(recipe["required_artifact_schemas"]).toEqual([]);
    expect(recipe["qualified_id"]).toBe("core:contract_demo");
  });

  it("invalid contract_version:1 recipe is skipped with warnings while ok stays true", async () => {
    await fs.writeFile(
      path.join(recipesDir, "bad-contract.yaml"),
      [
        "id: bad_contract",
        "description: missing contract fields",
        "contract_version: 1",
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(recipesDir, "legacy.yaml"),
      "id: legacy\ndescription: legacy still loads\n",
    );

    const result = await listRecipes();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes.map((recipe) => recipe.id)).toEqual(["legacy"]);
    expect(result.result.warnings).toHaveLength(1);
    expect(result.result.warnings[0]?.file).toBe("bad-contract.yaml");
    expect(result.result.warnings[0]?.error).toMatch(
      /contract v1 validation failed/,
    );
    expect(result.result.warnings[0]?.error).toMatch(/execution_model/);
  });

  it("unsupported recipe contract versions are skipped with warnings", async () => {
    await fs.writeFile(
      path.join(recipesDir, "future.yaml"),
      [
        "id: future",
        "description: future contract",
        "contract_version: 2",
      ].join("\n"),
    );

    const result = await listRecipes();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes).toEqual([]);
    expect(result.result.warnings).toHaveLength(1);
    expect(result.result.warnings[0]?.error).toMatch(
      /unsupported recipe contract_version 2/,
    );
  });

  it("contract v1 rejects scope:analysis and keeps artifact as the read scope", async () => {
    await fs.writeFile(
      path.join(recipesDir, "analysis-scope.yaml"),
      validContractV1({ requiredReadScopes: ["analysis"] }),
    );

    const result = await listRecipes();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes).toEqual([]);
    expect(result.result.warnings).toHaveLength(1);
    expect(result.result.warnings[0]?.error).toMatch(
      /required_read_scopes\.0/,
    );
  });

  it("contract v1 requires produced artifacts to use read_scope: artifact", async () => {
    await fs.writeFile(
      path.join(recipesDir, "bad-produced-scope.yaml"),
      validContractV1({
        produces: [
          "produces:",
          "  - type: artifact",
          "    read_scope: selection",
        ],
      }),
    );

    const result = await listRecipes();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes).toEqual([]);
    expect(result.result.warnings).toHaveLength(1);
    expect(result.result.warnings[0]?.error).toMatch(/produces\.0\.read_scope/);
    expect(result.result.warnings[0]?.error).toMatch(/artifact/);
  });

  it("keeps the real impact_variations recipe in legacy passthrough mode", async () => {
    delete process.env.STREETLIGHT_RECIPES_DIR;

    const result = await listRecipes(["core"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const impact = result.result.recipes.find(
      (recipe) => recipe.qualified_id === "core:impact_variations",
    ) as Record<string, unknown> | undefined;
    expect(impact?.pack).toBe("core");
    expect(impact).not.toHaveProperty("contract_version");
    expect(impact).toHaveProperty("variations");
    expect(
      result.result.warnings.filter((warning) => warning.pack === "core"),
    ).toEqual([]);
  });

  it("contract v1 validates required templates against enabled packs", async () => {
    await fs.writeFile(
      path.join(recipesDir, "missing-template.yaml"),
      validContractV1({ requiredTemplates: ["item_audio_analyze"] }),
    );

    const result = await listRecipes(["core"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes).toEqual([]);
    expect(result.result.warnings[0]?.error).toMatch(
      /required template "item_audio_analyze" is not registered/,
    );
  });

  it("contract v1 validates required artifact schemas against enabled packs", async () => {
    await fs.writeFile(
      path.join(recipesDir, "missing-schema.yaml"),
      validContractV1({
        requiredArtifactSchemas: ["openreaper.analysis.item_audio.v1"],
        produces: [
          "produces:",
          "  - type: artifact",
          "    schema: openreaper.analysis.item_audio.v1",
          "    read_scope: artifact",
          '    ref_prefix: "artifact:analysis:analysis:"',
        ],
      }),
    );

    const result = await listRecipes(["core"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes).toEqual([]);
    expect(result.result.warnings[0]?.error).toMatch(
      /required artifact schema "openreaper\.analysis\.item_audio\.v1" is not registered/,
    );
    expect(result.result.warnings[0]?.error).toMatch(/produces\.0\.schema/);
  });

  it("contract v1 validates required packs against enabled packs", async () => {
    await fs.writeFile(
      path.join(recipesDir, "missing-pack.yaml"),
      validContractV1({ requiredPacks: ["core", "analysis"] }),
    );

    const result = await listRecipes(["core"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes).toEqual([]);
    expect(result.result.warnings[0]?.error).toMatch(
      /required pack "analysis" is not enabled/,
    );
  });

  it("malformed YAML → skipped with warning, ok stays true", async () => {
    await fs.writeFile(
      path.join(recipesDir, "broken.yaml"),
      "id: x\ndescription: y\nsteps:\n  - this is: : invalid\n   nested wrong",
    );
    await fs.writeFile(
      path.join(recipesDir, "good.yaml"),
      "id: good\ndescription: still loadable\n",
    );
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes).toHaveLength(1);
    expect(result.result.recipes[0]?.id).toBe("good");
    expect(result.result.warnings).toHaveLength(1);
    expect(result.result.warnings[0]?.pack).toBe("core");
    expect(result.result.warnings[0]?.file).toBe("broken.yaml");
    expect(result.result.warnings[0]?.error).toMatch(/YAML parse/);
  });

  it("missing required envelope field → schema warning, ok stays true", async () => {
    await fs.writeFile(
      path.join(recipesDir, "no-id.yaml"),
      "description: no id here\n",
    );
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes).toEqual([]);
    expect(result.result.warnings).toHaveLength(1);
    expect(result.result.warnings[0]?.pack).toBe("core");
    expect(result.result.warnings[0]?.error).toMatch(/schema validation failed/);
  });

  it("recipe ids cannot contain colons because qualified_id owns the colon", async () => {
    await fs.writeFile(
      path.join(recipesDir, "bad-id.yaml"),
      "id: core:bad\ndescription: ambiguous id\n",
    );
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes).toEqual([]);
    expect(result.result.warnings).toHaveLength(1);
    expect(result.result.warnings[0]?.error).toMatch(/without ':'/);
  });

  it("skips duplicate qualified ids within the same pack", async () => {
    await fs.writeFile(
      path.join(recipesDir, "a.yaml"),
      "id: duplicate\ndescription: first\n",
    );
    await fs.writeFile(
      path.join(recipesDir, "b.yaml"),
      "id: duplicate\ndescription: second\n",
    );
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes).toHaveLength(1);
    expect(result.result.recipes[0]?.description).toBe("first");
    expect(result.result.warnings).toHaveLength(1);
    expect(result.result.warnings[0]?.error).toMatch(
      /duplicate recipe qualified_id core:duplicate/,
    );
  });

  it("non-yaml files are ignored", async () => {
    await fs.writeFile(path.join(recipesDir, "README.md"), "# notes");
    await fs.writeFile(path.join(recipesDir, "ignored.json"), "{}");
    await fs.writeFile(
      path.join(recipesDir, "only.yaml"),
      "id: only\ndescription: a recipe\n",
    );
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes).toHaveLength(1);
    expect(result.result.recipes[0]?.id).toBe("only");
  });

  it("re-reads on every call (no caching)", async () => {
    const file = path.join(recipesDir, "live.yaml");
    await fs.writeFile(file, "id: v1\ndescription: first\n");
    const first = await listRecipes();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.result.recipes[0]?.description).toBe("first");

    await fs.writeFile(file, "id: v1\ndescription: second\n");
    const second = await listRecipes();
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.result.recipes[0]?.description).toBe("second");
  });

  it("recipes are returned in sorted filename order", async () => {
    await fs.writeFile(
      path.join(recipesDir, "b.yaml"),
      "id: b\ndescription: b\n",
    );
    await fs.writeFile(
      path.join(recipesDir, "a.yaml"),
      "id: a\ndescription: a\n",
    );
    const result = await listRecipes();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.recipes.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("resolveRecipeRoots maps enabled packs to deterministic recipe roots", () => {
    delete process.env.STREETLIGHT_RECIPES_DIR;
    const roots = resolveRecipeRoots(["core", "pack_contract_fixture"]);
    expect(roots.map((r) => r.pack)).toEqual([
      "core",
      "pack_contract_fixture",
    ]);
    expect(roots[0]?.recipes_dir).toMatch(/\/recipes$/);
    expect(roots[1]?.recipes_dir).toMatch(
      /\/reaper\/packs\/pack_contract_fixture\/recipes$/,
    );
  });

  it("loads fixture-pack recipes with pack ownership and qualified ids", async () => {
    delete process.env.STREETLIGHT_RECIPES_DIR;
    const result = await listRecipes(["core", "pack_contract_fixture"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fixture = result.result.recipes.find(
      (recipe) => recipe.qualified_id === "pack_contract_fixture:fixture_pack_smoke",
    );
    expect(fixture?.pack).toBe("pack_contract_fixture");
    expect(fixture?.id).toBe("fixture_pack_smoke");
    expect(result.result.recipe_roots.map((root) => root.pack)).toEqual([
      "core",
      "pack_contract_fixture",
    ]);
  });

  it("loads analysis-owned contract v1 fixture recipe when analysis pack is enabled", async () => {
    delete process.env.STREETLIGHT_RECIPES_DIR;
    const result = await listRecipes(["core", "analysis"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fixture = result.result.recipes.find(
      (recipe) => recipe.qualified_id === "analysis:analysis_loop_candidate_probe",
    ) as Record<string, unknown> | undefined;
    expect(fixture?.pack).toBe("analysis");
    expect(fixture?.contract_version).toBe(1);
    expect(fixture?.execution_model).toBe("agent_step");
    expect(fixture?.required_templates).toEqual(["item_audio_analyze"]);
    expect(fixture?.required_read_scopes).toEqual(["selection", "artifact"]);
    expect(fixture?.required_artifact_schemas).toEqual([
      "openreaper.analysis.item_audio.v1",
    ]);
    expect(result.result.warnings).not.toContainEqual(
      expect.objectContaining({ pack: "analysis" }),
    );
  });
});
