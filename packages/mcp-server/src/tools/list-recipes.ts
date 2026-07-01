import { promises as fs, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { z } from "zod";
import {
  CapabilityRegistry,
  PACK_ID_PATTERN,
  parseEnabledPacks,
  type Result,
  ok,
} from "@streetlight/core";
import { registerEnabledTemplates } from "../templates/index.js";

const RECIPE_ID_PATTERN = /^[a-z][a-z0-9_]*$/;
const RECIPE_CONTRACT_VERSION = 1;
const RECIPE_EXECUTION_MODEL = "agent_step";
const KNOWN_READ_SCOPES = [
  "project",
  "tracks",
  "selection",
  "regions",
  "artifact",
  "render",
] as const;

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

const RecipeContractPointSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
  })
  .passthrough();

const RecipeContractProducesSchema = z
  .object({
    type: z.string().min(1),
    schema: z.string().min(1).optional(),
    read_scope: z.literal("artifact").optional(),
    ref_prefix: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
  })
  .passthrough();

const RecipeContractFixtureSmokeSchema = z
  .object({
    description: z.string().min(1),
    steps: z.array(z.unknown()).optional(),
  })
  .passthrough();

/**
 * Slice 29 contract v1 is metadata-only. It validates recipe discoverability
 * and references, but does not validate Jinja placeholders, template params,
 * or execute anything.
 */
const RecipeContractV1Schema = z
  .object({
    contract_version: z.literal(RECIPE_CONTRACT_VERSION),
    execution_model: z.literal(RECIPE_EXECUTION_MODEL),
    required_packs: z.array(
      z
        .string()
        .min(1)
        .regex(PACK_ID_PATTERN, "pack id must be lower_snake_case"),
    ),
    required_templates: z.array(z.string().min(1)),
    required_read_scopes: z.array(z.enum(KNOWN_READ_SCOPES)),
    required_artifact_schemas: z.array(z.string().min(1)),
    produces: z.array(RecipeContractProducesSchema),
    approval_points: z.array(RecipeContractPointSchema),
    assertions: z.array(RecipeContractPointSchema),
    fixture_smoke: RecipeContractFixtureSmokeSchema,
  })
  .passthrough();

export type RecipeMetadata = z.infer<typeof RecipeEnvelopeSchema> & {
  pack: string;
  qualified_id: string;
};
type RecipeEnvelope = z.infer<typeof RecipeEnvelopeSchema>;
type RecipeContractV1 = z.infer<typeof RecipeContractV1Schema>;

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

interface RecipeContractValidationContext {
  enabledPacks: Set<string>;
  templateNames: Set<string>;
  artifactSchemas: Set<string>;
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

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("; ");
}

function buildContractValidationContext(
  enabledPacks: string[],
): RecipeContractValidationContext {
  const registry = new CapabilityRegistry();
  registerEnabledTemplates(registry, enabledPacks);
  const definitions = registry.rawDefinitions();
  return {
    enabledPacks: new Set(enabledPacks),
    templateNames: new Set(definitions.map((definition) => definition.name)),
    artifactSchemas: new Set(
      definitions
        .map((definition) => definition.artifact?.schema)
        .filter((schema): schema is string => typeof schema === "string"),
    ),
  };
}

function validateContractReferences(
  recipe: RecipeContractV1,
  context: RecipeContractValidationContext,
): string[] {
  const errors: string[] = [];

  for (const pack of recipe.required_packs) {
    if (!context.enabledPacks.has(pack)) {
      errors.push(`required pack "${pack}" is not enabled`);
    }
  }

  for (const template of recipe.required_templates) {
    if (!context.templateNames.has(template)) {
      errors.push(`required template "${template}" is not registered`);
    }
  }

  for (const schema of recipe.required_artifact_schemas) {
    if (!context.artifactSchemas.has(schema)) {
      errors.push(`required artifact schema "${schema}" is not registered`);
    }
  }

  for (const [i, produced] of recipe.produces.entries()) {
    if (
      produced.schema !== undefined &&
      !context.artifactSchemas.has(produced.schema)
    ) {
      errors.push(
        `produces.${i}.schema "${produced.schema}" is not registered`,
      );
    }
  }

  return errors;
}

function validateRecipeContract(
  recipe: RecipeEnvelope,
  context: RecipeContractValidationContext,
): string | null {
  const raw = recipe as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(raw, "contract_version")) {
    return null;
  }
  if (raw["contract_version"] !== RECIPE_CONTRACT_VERSION) {
    return `unsupported recipe contract_version ${String(raw["contract_version"])}`;
  }

  const parsed = RecipeContractV1Schema.safeParse(recipe);
  if (!parsed.success) {
    return `contract v1 validation failed: ${formatZodIssues(parsed.error)}`;
  }

  const referenceErrors = validateContractReferences(parsed.data, context);
  if (referenceErrors.length > 0) {
    return `contract v1 reference validation failed: ${referenceErrors.join("; ")}`;
  }

  return null;
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
  const contractContext = buildContractValidationContext(enabledPacks);
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
        const contractError = validateRecipeContract(
          loaded.recipe,
          contractContext,
        );
        if (contractError !== null) {
          const warning: RecipeWarning = {
            pack: root.pack,
            file: name,
            error: contractError,
          };
          warnings.push(warning);
          process.stderr.write(
            `[streetlight-mcp] list_recipes: skipping ${root.pack}/${name} — ${warning.error}\n`,
          );
          continue;
        }
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
