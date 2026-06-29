#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HEADER =
  "-- AUTO-GENERATED from packages/core/src/errors.ts by scripts/error-codes.mjs.\n" +
  "-- Do not edit by hand. Run `npm run gen:error-codes` to regenerate.\n\n";

function sorted(values) {
  return [...values].sort();
}

export function parseErrorCodesTs(text) {
  const blockMatch = text.match(/export const ErrorCodes\s*=\s*\{([\s\S]*?)\}\s*as const;/);
  if (!blockMatch) {
    throw new Error("ErrorCodes object not found");
  }
  const codes = new Set();
  for (const match of blockMatch[1].matchAll(/([A-Z_]+)\s*:\s*"([A-Z_]+)"/g)) {
    if (match[1] !== match[2]) {
      throw new Error(`ErrorCodes key/value mismatch: ${match[1]} !== ${match[2]}`);
    }
    codes.add(match[1]);
  }
  if (codes.size === 0) {
    throw new Error("No error codes parsed");
  }
  return sorted(codes);
}

export function generateErrorCodesLua(codes) {
  codes = sorted(codes);
  const width = Math.max(...codes.map((code) => code.length));
  const lines = codes.map(
    (code) => `  ${code.padEnd(width)} = "${code}",`,
  );
  return `${HEADER}return {\n${lines.join("\n")}\n}\n`;
}

export function findLuaErrorCodeLiterals(files) {
  const found = [];
  const patterns = [
    /\bcode\s*=\s*"([A-Z_]+)"/g,
    /\braise\([^)]*"([A-Z_]+)"/g,
    /\breturn\s+nil\s*,\s*"([A-Z_]+)"/g,
  ];

  for (const file of files) {
    for (const pattern of patterns) {
      for (const match of file.text.matchAll(pattern)) {
        found.push({
          path: file.path,
          code: match[1],
        });
      }
    }
  }
  return found;
}

export function diffUnknownLuaErrorCodes(files, knownCodes) {
  const known = new Set(knownCodes);
  return findLuaErrorCodeLiterals(files)
    .filter((hit) => !known.has(hit.code))
    .map((hit) => `${hit.path}: unknown error code ${hit.code}`);
}

async function walkLuaFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkLuaFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".lua") && entry.name !== "error_codes.lua") {
      out.push(full);
    }
  }
  return out;
}

async function repoPaths() {
  const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  return {
    repoRoot,
    errorsTs: path.join(repoRoot, "packages/core/src/errors.ts"),
    luaOut: path.join(repoRoot, "reaper/packs/core/error_codes.lua"),
    luaRoot: path.join(repoRoot, "reaper/packs/core"),
  };
}

async function readKnownCodes(paths) {
  const errorsText = await fs.readFile(paths.errorsTs, "utf8");
  return parseErrorCodesTs(errorsText);
}

async function cmdGenerate() {
  const paths = await repoPaths();
  const codes = await readKnownCodes(paths);
  await fs.writeFile(paths.luaOut, generateErrorCodesLua(codes));
  process.stdout.write(`Generated ${path.relative(paths.repoRoot, paths.luaOut)} (${codes.length} codes).\n`);
}

async function cmdCheckFresh() {
  const paths = await repoPaths();
  const codes = await readKnownCodes(paths);
  const expected = generateErrorCodesLua(codes);
  const actual = await fs.readFile(paths.luaOut, "utf8");
  if (actual !== expected) {
    process.stderr.write("reaper/packs/core/error_codes.lua is stale. Run `npm run gen:error-codes`.\n");
    process.exit(1);
  }

  const luaFiles = await Promise.all(
    (await walkLuaFiles(paths.luaRoot)).map(async (filePath) => ({
      path: path.relative(paths.repoRoot, filePath),
      text: await fs.readFile(filePath, "utf8"),
    })),
  );
  const unknown = diffUnknownLuaErrorCodes(luaFiles, codes);
  if (unknown.length > 0) {
    process.stderr.write("Unknown Lua error codes:\n");
    for (const entry of unknown) process.stderr.write(`- ${entry}\n`);
    process.exit(1);
  }

  process.stdout.write(`Streetlight error codes fresh (${codes.length} codes).\n`);
}

async function main() {
  const cmd = process.argv[2] ?? "check";
  if (cmd === "generate") return cmdGenerate();
  if (cmd === "check") return cmdCheckFresh();
  throw new Error(`Unknown command: ${cmd}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`${e?.stack ?? e}\n`);
    process.exit(1);
  });
}
