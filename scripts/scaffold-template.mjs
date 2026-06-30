#!/usr/bin/env node

/**
 * Template scaffolder — Slice 18.
 *
 * This is intentionally plan-only. It validates a small descriptor and prints
 * deterministic skeletons/snippets for a future template author to paste and
 * finish. It does not write files, update registries, edit Lua, or guess
 * ReaScript business logic.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TEMPLATES_SUBDIR = "packages/mcp-server/src/templates";
const TEMPLATE_HELPER_FILES = new Set(["_shared.ts", "index.ts"]);

export const SUPPORTED_ENTITY_KINDS = ["item", "track", "region"];
export const SUPPORTED_RISKS = ["read", "write_safe", "filesystem"];
export const UNSUPPORTED_RISKS_THIS_SLICE = ["destructive", "unsafe_eval"];
export const SUPPORTED_UNDO_FLAGS = ["TRACKCFG", "FX", "ITEMS", "MISCCFG", "FREEZE"];

const LUA_MODULE_BY_ENTITY_KIND = {
  item: "item.lua",
  track: "track.lua",
  region: "region.lua",
};

const MANIFEST_TEMPLATE_TABLE_BY_ENTITY_KIND = {
  item: "item_templates",
  track: "track_templates",
  region: "region_templates",
};

export function templateSlug(name) {
  return name.replace(/_/g, "-");
}

export function toPascalCase(name) {
  return name
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
}

export function toCamelCase(name) {
  const pascal = toPascalCase(name);
  return `${pascal.charAt(0).toLowerCase()}${pascal.slice(1)}`;
}

export function validateTemplateName(name) {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("--name must be a non-empty snake_case string");
  }
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(name)) {
    throw new Error(
      `--name must be snake_case (lowercase letters, numbers, single underscores): ${name}`,
    );
  }
  return name;
}

export function parseBooleanStrict(value, flagName) {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${flagName} must be explicitly true or false`);
}

export function parseUndoFlags(values) {
  for (const entry of values) {
    if (String(entry).trim().length === 0) {
      throw new Error("--undo-flags values must be non-empty");
    }
  }

  const rawParts = values.flatMap((entry) => String(entry).split(","));
  const flags = rawParts.map((part) => part.trim()).filter((part) => part.length > 0);
  if (flags.length === 0) return [];

  const seen = new Set();
  for (const flag of flags) {
    if (!SUPPORTED_UNDO_FLAGS.includes(flag)) {
      throw new Error(
        `Unsupported --undo-flags value "${flag}". Allowed: ${SUPPORTED_UNDO_FLAGS.join(", ")}`,
      );
    }
    if (seen.has(flag)) {
      throw new Error(`Duplicate --undo-flags value "${flag}"`);
    }
    seen.add(flag);
  }
  return flags;
}

function needValue(argv, index, flagName) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flagName} requires a value`);
  }
  return value;
}

export function parseScaffoldArgs(argv) {
  const raw = {
    dryRun: false,
    undoFlags: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") {
      raw.dryRun = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      raw.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected positional argument "${token}"`);
    }

    const [flagName, inlineValue] = token.split("=", 2);
    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      const value = needValue(argv, i, flagName);
      i += 1;
      return value;
    };

    switch (flagName) {
      case "--name":
        raw.name = readValue();
        break;
      case "--pack":
        raw.pack = readValue();
        break;
      case "--entity-kind":
        raw.entityKind = readValue();
        break;
      case "--risk":
        raw.risk = readValue();
        break;
      case "--undoable":
        raw.undoable = readValue();
        break;
      case "--undo-flags":
        raw.undoFlags.push(readValue());
        break;
      case "--idempotent":
        raw.idempotent = readValue();
        break;
      default:
        throw new Error(`Unknown flag "${flagName}"`);
    }
  }

  return raw;
}

export function normalizeScaffoldOptions(raw, { existingSlugs = [] } = {}) {
  if (raw.help) return { help: true };
  if (!raw.dryRun) {
    throw new Error("Slice 18 scaffolder is dry-run only; pass --dry-run");
  }

  const missing = [];
  for (const key of ["name", "entityKind", "risk", "undoable", "idempotent"]) {
    if (raw[key] === undefined) missing.push(key);
  }
  if (missing.length > 0) {
    throw new Error(`Missing required flags: ${missing.map(flagForKey).join(", ")}`);
  }

  const name = validateTemplateName(raw.name);
  const slug = templateSlug(name);
  const existing = existingSlugs instanceof Set ? existingSlugs : new Set(existingSlugs);
  if (existing.has(slug)) {
    throw new Error(`Template "${name}" would collide with existing file slug "${slug}"`);
  }

  const pack = raw.pack ?? "core";
  if (pack !== "core") {
    throw new Error(`Only --pack core is supported in Slice 18 (got "${pack}")`);
  }

  const entityKind = raw.entityKind;
  if (!SUPPORTED_ENTITY_KINDS.includes(entityKind)) {
    const extra =
      entityKind === "render"
        ? " (render templates are deferred because their artifact contract is special)"
        : "";
    throw new Error(
      `Unsupported --entity-kind "${entityKind}"${extra}. Allowed: ${SUPPORTED_ENTITY_KINDS.join(", ")}`,
    );
  }

  const risk = raw.risk;
  if (UNSUPPORTED_RISKS_THIS_SLICE.includes(risk)) {
    throw new Error(`--risk ${risk} is intentionally unsupported in Slice 18`);
  }
  if (!SUPPORTED_RISKS.includes(risk)) {
    throw new Error(`Unsupported --risk "${risk}". Allowed: ${SUPPORTED_RISKS.join(", ")}`);
  }

  const undoable = parseBooleanStrict(raw.undoable, "--undoable");
  const idempotent = parseBooleanStrict(raw.idempotent, "--idempotent");
  const undoFlags = parseUndoFlags(raw.undoFlags ?? []);

  if (undoable && undoFlags.length === 0) {
    throw new Error("--undo-flags is required when --undoable true");
  }
  if (!undoable && undoFlags.length > 0) {
    throw new Error("--undo-flags must be omitted when --undoable false");
  }

  return {
    name,
    slug,
    pack,
    entityKind,
    risk,
    undoable,
    undoFlags,
    idempotent,
    dryRun: true,
  };
}

function flagForKey(key) {
  return {
    entityKind: "--entity-kind",
    idempotent: "--idempotent",
    name: "--name",
    risk: "--risk",
    undoable: "--undoable",
  }[key] ?? `--${key}`;
}

function tsString(value) {
  return JSON.stringify(value);
}

function tsArray(values) {
  return `[${values.map(tsString).join(", ")}]`;
}

export function buildScaffoldPlan(options) {
  const pascal = toPascalCase(options.name);
  const camel = toCamelCase(options.name);
  const tsPath = `${TEMPLATES_SUBDIR}/${options.slug}.ts`;
  const testPath = `packages/mcp-server/src/tools/__tests__/${options.slug}.test.ts`;
  const luaPath = `reaper/packs/${options.pack}/templates/${LUA_MODULE_BY_ENTITY_KIND[options.entityKind]}`;
  const manifestPath = `reaper/packs/${options.pack}/manifest.lua`;
  const registryPath = `${TEMPLATES_SUBDIR}/index.ts`;

  const identifiers = {
    pascal,
    camel,
    params: `${pascal}Params`,
    result: `${pascal}Result`,
    definition: `${camel}Definition`,
  };

  return {
    ...options,
    identifiers,
    paths: {
      ts: tsPath,
      test: testPath,
      lua: luaPath,
      manifest: manifestPath,
      registry: registryPath,
    },
    wouldCreate: [tsPath, testPath],
    manualModify: [registryPath, luaPath, manifestPath],
  };
}

export function renderTsSkeleton(plan) {
  const d = plan.identifiers;
  const expectedDelta =
    plan.undoable
      ? `\n  expectedDelta: {\n    count: 1,\n    // TODO: add creates/maybeCreates/deletes or fields[] once the handler behavior is known.\n  },`
      : "";
  return `import { z } from "zod";
import { callTemplateResultSchema, defineTemplate } from "./_shared.js";

const ${d.params} = z
  .object({
    // TODO: add parameters and .describe(...) strings agents can read.
  })
  .strict();

const ${d.result} = callTemplateResultSchema(${tsString(plan.name)});

export const ${d.definition} = defineTemplate({
  name: ${tsString(plan.name)},
  description: "TODO: describe ${plan.name}.",
  pack: ${tsString(plan.pack)},
  risk: ${tsString(plan.risk)},
  mutates: true,
  undoable: ${String(plan.undoable)},
  entity_kind: ${tsString(plan.entityKind)},
  undo_flags: ${tsArray(plan.undoFlags)},
  idempotent: ${String(plan.idempotent)},${expectedDelta}
  params: ${d.params},
  result: ${d.result},
  examples: [
    {
      description: "TODO: positive example an agent can copy.",
      params: {
        // TODO: fill with params that pass ${d.params}.strict().
      },
    },
  ],
});
`;
}

export function renderLuaTodo(plan) {
  return `-- In ${plan.paths.lua}, add a handler named M.${plan.name}.
-- TODO: resolve refs first via ctx.refs, validate runtime-only preconditions,
-- perform the real reaper.* calls, call reaper.UpdateArrange() when visible,
-- and return { changed_ids = { ... } } for entity_kind=${plan.entityKind}.
function M.${plan.name}(params, ctx)
  local errs = ctx.errs

  -- TODO: implement ${plan.name}; use errs.<CODE>, never raw string error codes.
  error({ code = errs.INTERNAL_ERROR, message = "${plan.name} scaffold is not implemented" })
end
`;
}

export function renderManifestTodo(plan) {
  const undoFlags =
    plan.undoFlags.length > 0
      ? `  undo_flags = ${plan.undoFlags.map((flag) => `undo.UNDO_STATE_${flag}`).join(" | ")},`
      : "  -- undo_flags omitted because undoable=false";
  return `-- In ${plan.paths.manifest}, add templates.${plan.name}.
templates.${plan.name} = {
  handler = ${MANIFEST_TEMPLATE_TABLE_BY_ENTITY_KIND[plan.entityKind]}.${plan.name},
  undoable = ${String(plan.undoable)},
  undo_label = "Streetlight: ${plan.name}",
${undoFlags}
  entity_kind = ${tsString(plan.entityKind)},
}
`;
}

export function renderRegistryTodo(plan) {
  return `// In ${plan.paths.registry}:
import { ${plan.identifiers.definition} } from "./${plan.slug}.js";

// Inside registerCoreTemplates(...)
registry.register(${plan.identifiers.definition});
`;
}

export function renderTestTodo(plan) {
  return `// In ${plan.paths.test}:
// TODO: add PARAMS_INVALID tests, fake-bridge happy-path envelope tests,
// expectedDelta/list_templates assertions, and any bridge-surfaced domain
// error pass-through cases for ${plan.name}.
`;
}

export function formatScaffoldPlan(plan) {
  const lines = [
    "OpenReaper template scaffold dry-run",
    "=====================================",
    "",
    "WARNING: dry-run only. No files were written.",
    "WARNING: TODO skeletons are intentionally not lint-clean until filled.",
    "",
    "Metadata",
    "--------",
    `name: ${plan.name}`,
    `slug: ${plan.slug}`,
    `pack: ${plan.pack}`,
    `entity_kind: ${plan.entityKind}`,
    `risk: ${plan.risk}`,
    `undoable: ${String(plan.undoable)}`,
    `undo_flags: ${plan.undoFlags.length > 0 ? plan.undoFlags.join(", ") : "<none>"}`,
    `idempotent: ${String(plan.idempotent)}`,
    `definition export: ${plan.identifiers.definition}`,
    "",
    "Would create",
    "------------",
    ...plan.wouldCreate.map((entry) => `- ${entry}`),
    "",
    "Manual modifications",
    "--------------------",
    ...plan.manualModify.map((entry) => `- ${entry}`),
    "",
    `TS skeleton: ${plan.paths.ts}`,
    "-----------------------------",
    "```ts",
    renderTsSkeleton(plan).trimEnd(),
    "```",
    "",
    `Lua handler TODO: ${plan.paths.lua}`,
    "-------------------------------",
    "```lua",
    renderLuaTodo(plan).trimEnd(),
    "```",
    "",
    `Manifest TODO: ${plan.paths.manifest}`,
    "------------------------------------",
    "```lua",
    renderManifestTodo(plan).trimEnd(),
    "```",
    "",
    `Registry TODO: ${plan.paths.registry}`,
    "----------------------------------",
    "```ts",
    renderRegistryTodo(plan).trimEnd(),
    "```",
    "",
    `Test TODO: ${plan.paths.test}`,
    "-------------------------------",
    "```ts",
    renderTestTodo(plan).trimEnd(),
    "```",
    "",
  ];
  return `${lines.join("\n")}`;
}

export function usage() {
  return `Usage:
  npm run scaffold:template -- --name track_color --entity-kind track --risk write_safe --undoable true --undo-flags TRACKCFG --idempotent true --dry-run

Required flags:
  --name            snake_case template name
  --entity-kind     one of: ${SUPPORTED_ENTITY_KINDS.join(", ")}
  --risk            one of: ${SUPPORTED_RISKS.join(", ")}
  --undoable        true or false
  --idempotent      true or false
  --dry-run         required; Slice 18 writes nothing

Optional flags:
  --pack            only "core" is supported in Slice 18 (default: core)
  --undo-flags      comma-separated or repeatable; required when undoable=true
`;
}

export async function readExistingTemplateSlugs(repoRoot) {
  const dir = path.join(repoRoot, TEMPLATES_SUBDIR);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name)
    .filter((name) => !TEMPLATE_HELPER_FILES.has(name))
    .map((name) => name.replace(/\.ts$/, ""))
    .sort();
}

async function cmdScaffold() {
  const raw = parseScaffoldArgs(process.argv.slice(2));
  if (raw.help) {
    process.stdout.write(usage());
    return;
  }

  const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const existingSlugs = await readExistingTemplateSlugs(repoRoot);
  const options = normalizeScaffoldOptions(raw, { existingSlugs });
  const plan = buildScaffoldPlan(options);
  process.stdout.write(formatScaffoldPlan(plan));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cmdScaffold().catch((e) => {
    process.stderr.write(`${e?.stack ?? e}\n`);
    process.exit(1);
  });
}
