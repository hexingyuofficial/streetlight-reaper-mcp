import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CapabilityRegistry } from "../../packages/core/src/registry.ts";
import { registerCoreTemplates } from "../../packages/mcp-server/src/templates/index.ts";
import {
  MANIFEST_FORMAT_UNEXPECTED,
  buildRegistrySnapshot,
  diffManifestAlignment,
  parseManifestLua,
  stripLuaLineComments,
} from "../manifest-alignment.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const SAMPLE_MANIFEST = `
return {
  templates = {
    item_pitch = {
      handler = item_templates.item_pitch,
      undoable = true,
      undo_flags = undo.UNDO_STATE_ITEMS,
      entity_kind = "item",
    },
    media_import = {
      handler = media_templates.media_import,
      undoable = true,
      undo_flags = undo.UNDO_STATE_ITEMS | undo.UNDO_STATE_TRACKCFG,
      entity_kind = "item",
    },
    render_region = {
      handler = render_templates.render_region,
      undoable = false,
      entity_kind = "render",
    },
  },
}
`;

describe("manifest alignment helpers", () => {
  it("strips Lua line comments before parsing template entries", () => {
    expect(stripLuaLineComments('-- changed_ids = { "x" }\nitem = true')).toBe(
      "\nitem = true",
    );
  });

  it("parses manifest metadata for undoable and non-undoable templates", () => {
    const parsed = parseManifestLua(SAMPLE_MANIFEST);
    expect(parsed.get("item_pitch")).toEqual({
      undoable: true,
      undo_flags: ["ITEMS"],
      entity_kind: "item",
    });
    expect(parsed.get("media_import")).toEqual({
      undoable: true,
      undo_flags: ["ITEMS", "TRACKCFG"],
      entity_kind: "item",
    });
    expect(parsed.get("render_region")).toEqual({
      undoable: false,
      undo_flags: [],
      entity_kind: "render",
    });
  });

  it("rejects unsupported multi-line undo_flags expressions", () => {
    expect(() =>
      parseManifestLua(`
return { templates = {
  item_pitch = {
    undoable = true,
    undo_flags = undo.UNDO_STATE_ITEMS
      | undo.UNDO_STATE_TRACKCFG,
    entity_kind = "item",
  },
} }
`),
    ).toThrow(MANIFEST_FORMAT_UNEXPECTED);
  });

  it("reports field mismatches and missing templates", () => {
    const ts = new Map([
      ["item_pitch", { undoable: true, undo_flags: ["ITEMS"], entity_kind: "track" }],
      ["ts_only", { undoable: true, undo_flags: ["ITEMS"], entity_kind: "item" }],
    ]);
    const lua = parseManifestLua(SAMPLE_MANIFEST);
    const errors = diffManifestAlignment(ts, lua);

    expect(errors).toContain(
      'FIELD_MISMATCH:item_pitch.entity_kind: ts="track" lua="item"',
    );
    expect(errors).toContain("MISSING_IN_LUA:ts_only");
    expect(errors).toContain("MISSING_IN_TS:media_import");
    expect(errors).toContain("MISSING_IN_TS:render_region");
  });

  it("real core registry aligns with the real Lua manifest", async () => {
    const registry = new CapabilityRegistry();
    registerCoreTemplates(registry);
    const ts = buildRegistrySnapshot(registry);
    const manifest = await fs.readFile(
      path.join(repoRoot, "reaper/packs/core/manifest.lua"),
      "utf8",
    );
    const lua = parseManifestLua(manifest);

    expect(diffManifestAlignment(ts, lua)).toEqual([]);
  });
});
