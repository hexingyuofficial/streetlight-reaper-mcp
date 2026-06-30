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
  it("exposes and forwards Slice 14 call_template idempotency_key", async () => {
    const index = await readRepoFile("packages/mcp-server/src/index.ts");

    const callTemplateStart = index.indexOf('server.tool(\n    "call_template"');
    expect(callTemplateStart).toBeGreaterThan(0);
    const callTemplateBlock = index.slice(callTemplateStart);

    expect(callTemplateBlock).toMatch(/idempotency_key: z\s*\n\s*\.string\(\)\s*\n\s*\.min\(1\)\s*\n\s*\.max\(128\)/);
    expect(callTemplateBlock).toMatch(/\.regex\(\/\^\[\\x20-\\x7e\]\+\$\/,\s*"ASCII printable only, no control bytes"\)/);
    expect(callTemplateBlock).toMatch(/async \(\{ name, params, idempotency_key \}\)/);
    expect(callTemplateBlock).toMatch(/callTemplate\(client, registry, \{\s*name,\s*params,\s*idempotency_key,\s*\}\)/s);
    expect(callTemplateBlock).toMatch(/docs\/TEMPLATE_SPEC\.md § Idempotency/);
    expect(callTemplateBlock).toMatch(/BRIDGE_NOT_RUNNING without an idempotency_key/);
  });
});
