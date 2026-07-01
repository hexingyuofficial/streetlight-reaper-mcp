import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

async function readRepoFile(relPath) {
  return fs.readFile(path.join(repoRoot, relPath), "utf8");
}

describe("MCP server public tool wiring", () => {
  it("still exposes exactly the five public MCP tools", async () => {
    const index = await readRepoFile("packages/mcp-server/src/index.ts");
    const toolNames = Array.from(index.matchAll(/server\.tool\(\s*\n\s*"([^"]+)"/g))
      .map((match) => match[1]);

    expect(toolNames).toEqual([
      "ping",
      "get_state",
      "list_templates",
      "list_recipes",
      "call_template",
    ]);
  });

  it("describes recipe contract v1 without implying server-side execution", async () => {
    const index = await readRepoFile("packages/mcp-server/src/index.ts");

    const listRecipesStart = index.indexOf('server.tool(\n    "list_recipes"');
    expect(listRecipesStart).toBeGreaterThan(0);
    const listRecipesBlock = index.slice(listRecipesStart);

    expect(listRecipesBlock).toMatch(/contract_version:1 recipes expose metadata/);
    expect(listRecipesBlock).toMatch(/legacy recipes stay passthrough/);
    expect(listRecipesBlock).toMatch(/NOT server-executed/);
  });

  it("exposes and forwards Slice 14 call_template idempotency_key", async () => {
    const index = await readRepoFile("packages/mcp-server/src/index.ts");

    const callTemplateStart = index.indexOf('server.tool(\n    "call_template"');
    expect(callTemplateStart).toBeGreaterThan(0);
    const callTemplateBlock = index.slice(callTemplateStart);

    expect(callTemplateBlock).toMatch(/idempotency_key: z\s*\n\s*\.string\(\)\s*\n\s*\.min\(1\)\s*\n\s*\.max\(128\)/);
    expect(callTemplateBlock).toMatch(/\.regex\(\/\^\[\\x20-\\x7e\]\+\$\/,\s*"ASCII printable only, no control bytes"\)/);
    expect(callTemplateBlock).toMatch(/async \(\{ name, params, idempotency_key \}\)/);
    expect(callTemplateBlock).toMatch(/callTemplate\(client, registry, \{\s*name,\s*params,\s*idempotency_key,\s*\}\)/s);
    expect(callTemplateBlock).toMatch(/logical mutation or render/);
    expect(callTemplateBlock).not.toMatch(/render_region is a carve-out and ignores the key/);
    expect(callTemplateBlock).toMatch(/docs\/TEMPLATE_SPEC\.md § Idempotency/);
    expect(callTemplateBlock).toMatch(/BRIDGE_NOT_RUNNING without an idempotency_key/);
  });
});
