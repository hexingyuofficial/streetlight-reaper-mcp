import { promises as fs, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { z } from "zod";
import { parseEnabledPacks, type Result, ok } from "@streetlight/core";

const RECIPE_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Envelope-only Zod schema per Step 7 decision A5: validate the top-level
 * shape (id/description/inputs/steps), passthrough everything else.
 * Placeholder syntax and template-param shapes are NOT validated here —
 * recipes are agent-readable docs, not server-executed. Agent runtime is
 * responsible for resolving `{{ ... }}` and template params.
 */
const RecipeEnvelopeSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(
        RECIPE_ID_PATTERN,
        "recipe id must be lower_snake_case without ':'",
      ),
    description: z.string().min(1),
    version: z.union([z.string(), z.number()]).optional(),
    inputs: z.record(z.unknown()).optional(),
    steps: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type RecipeMetadata = z.infer<typeof RecipeEnvelopeSchema> & {
  pack: string;
  qualified_id: string;
};
type RecipeEnvelope = z.infer<typeof RecipeEnvelopeSchema>;

export interface RecipeWarning {
  pack: string;
  file: string;
  error: string;
}

export interface RecipeRoot {
  pack: string;
  recipes_dir: string;
}

export interface ListRecipesResult {
  recipes: RecipeMetadata[];
  /** Back-compat pointer to the core recipe directory / env override. */
  recipes_dir: string;
  recipe_roots: RecipeRoot[];
  warnings: RecipeWarning[];
}

/**
 * Find the recipes directory. Priority:
 *   1. STREETLIGHT_RECIPES_DIR env override (absolute path)
 *   2. walk up from this module's path looking for a sibling `recipes/`
 *      directory — works from `src/` (vitest), `dist/` (compiled), or any
 *      depth inside `packages/<x>/`.
 * Returns an absolute path. The path may not exist on disk; the caller
 * surfaces that as a warning.
 */
export function resolveRecipesDir(): string {
  const override = process.env.STREETLIGHT_RECIPES_DIR;
  if (override && override.length > 0) {
    return path.resolve(override);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let depth = 0; depth < 8; depth++) {
    const candidate = path.join(dir, "recipes");
    try {
      const stat = statSync(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // not found at this level; keep walking
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fall back to a deterministic guess relative to this module so the path
  // shown in the warning points somewhere sensible.
  return path.resolve(here, "..", "..", "..", "..", "recipes");
}

function resolveRepoRootFromHere(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let depth = 0; depth < 8; depth++) {
    try {
      const recipes = statSync(path.join(dir, "recipes"));
      const reaper = statSync(path.join(dir, "reaper"));
      if (recipes.isDirectory() && reaper.isDirectory()) return dir;
    } catch {
      // keep walking
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(here, "..", "..", "..", "..");
}

export function resolveRecipeRoots(
  enabledPacks = parseEnabledPacks(process.env.STREETLIGHT_ENABLED_PACKS),
): RecipeRoot[] {
  const override = process.env.STREETLIGHT_RECIPES_DIR;
  if (override && override.length > 0) {
    return [{ pack: "core", recipes_dir: path.resolve(override) }];
  }

  const repoRoot = resolveRepoRootFromHere();
  return enabledPacks.map((pack) => {
    if (pack === "core") {
      return { pack, recipes_dir: path.join(repoRoot, "recipes") };
    }
    return {
      pack,
      recipes_dir: path.join(repoRoot, "reaper", "packs", pack, "recipes"),
    };
  });
}

async function loadOneRecipe(
  fullPath: string,
): Promise<
  { ok: true; recipe: RecipeEnvelope } | { ok: false; error: string }
> {
  let text: string;
  try {
    text = await fs.readFile(fullPath, "utf8");
  } catch (e) {
    return { ok: false, error: `read failed: ${(e as Error).message}` };
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(text);
  } catch (e) {
    return { ok: false, error: `YAML parse failed: ${(e as Error).message}` };
  }
  if (parsed === null || typeof parsed !== "object") {
    return { ok: false, error: "YAML root is not an object" };
  }
  const result = RecipeEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `schema validation failed: ${issues}` };
  }
  return { ok: true, recipe: result.data };
}

/**
 * Step 7 MVP tool. Re-reads every call per decision A3 — no caching.
 * Per A4: bad files emit a stderr warning AND surface in result.warnings;
 * never returns ok:false for a single bad recipe. The tool only fails if
 * the listing infrastructure itself breaks (e.g. EACCES on the dir).
 */
export async function listRecipes(
  enabledPacks = parseEnabledPacks(process.env.STREETLIGHT_ENABLED_PACKS),
): Promise<Result<ListRecipesResult>> {
  const recipeRoots = resolveRecipeRoots(enabledPacks);
  const recipesDir = recipeRoots[0]?.recipes_dir ?? resolveRecipesDir();
  const warnings: RecipeWarning[] = [];
  const recipes: RecipeMetadata[] = [];
  const seenQualifiedIds = new Set<string>();

  for (const root of recipeRoots) {
    let entries: string[];
    try {
      entries = await fs.readdir(root.recipes_dir);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        const warning: RecipeWarning = {
          pack: root.pack,
          file: root.recipes_dir,
          error: "recipes directory not found",
        };
        warnings.push(warning);
        process.stderr.write(
          `[streetlight-mcp] list_recipes: ${warning.error} for pack ${root.pack} at ${root.recipes_dir}\n`,
        );
        continue;
      }
      throw e;
    }
    const yamlFiles = entries
      .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      .sort();
    for (const name of yamlFiles) {
      const full = path.join(root.recipes_dir, name);
      const loaded = await loadOneRecipe(full);
      if (loaded.ok) {
        const qualifiedId = `${root.pack}:${loaded.recipe.id}`;
        if (seenQualifiedIds.has(qualifiedId)) {
          const warning: RecipeWarning = {
            pack: root.pack,
            file: name,
            error: `duplicate recipe qualified_id ${qualifiedId}`,
          };
          warnings.push(warning);
          process.stderr.write(
            `[streetlight-mcp] list_recipes: skipping ${root.pack}/${name} — ${warning.error}\n`,
          );
          continue;
        }
        seenQualifiedIds.add(qualifiedId);
        recipes.push({
          ...loaded.recipe,
          pack: root.pack,
          qualified_id: qualifiedId,
        });
      } else {
        const warning: RecipeWarning = {
          pack: root.pack,
          file: name,
          error: loaded.error,
        };
        warnings.push(warning);
        process.stderr.write(
          `[streetlight-mcp] list_recipes: skipping ${root.pack}/${name} — ${loaded.error}\n`,
        );
      }
    }
  }
  return ok({
    recipes,
    recipes_dir: recipesDir,
    recipe_roots: recipeRoots,
    warnings,
  });
}
