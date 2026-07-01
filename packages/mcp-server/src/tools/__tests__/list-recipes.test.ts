import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { listRecipes, resolveRecipeRoots } from "../list-recipes.js";

const ORIG_ENV = process.env.STREETLIGHT_RECIPES_DIR;

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
});
