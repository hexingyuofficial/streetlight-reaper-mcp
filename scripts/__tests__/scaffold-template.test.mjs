import { describe, expect, it } from "vitest";
import {
  buildScaffoldPlan,
  formatScaffoldPlan,
  normalizeScaffoldOptions,
  parseBooleanStrict,
  parseScaffoldArgs,
  parseUndoFlags,
  renderManifestTodo,
  renderTsSkeleton,
  templateSlug,
  toCamelCase,
  toPascalCase,
  validateTemplateName,
} from "../scaffold-template.mjs";

function rawTrackColor(overrides = {}) {
  return {
    name: "track_color",
    entityKind: "track",
    risk: "write_safe",
    undoable: "true",
    undoFlags: ["TRACKCFG"],
    idempotent: "true",
    dryRun: true,
    ...overrides,
  };
}

function planForTrackColor(overrides = {}) {
  return buildScaffoldPlan(normalizeScaffoldOptions(rawTrackColor(overrides)));
}

describe("scaffold-template pure helpers", () => {
  it("converts names to slug and TS identifiers", () => {
    expect(templateSlug("track_color")).toBe("track-color");
    expect(toPascalCase("track_color")).toBe("TrackColor");
    expect(toCamelCase("track_color")).toBe("trackColor");
  });

  it("accepts strict snake_case names", () => {
    expect(validateTemplateName("item_gain")).toBe("item_gain");
    expect(validateTemplateName("track_color2")).toBe("track_color2");
  });

  it("rejects ambiguous or non-snake names", () => {
    for (const name of ["track-color", "trackColor", "track__color", "_track", "track_"]) {
      expect(() => validateTemplateName(name)).toThrow(/snake_case/);
    }
  });

  it("parses boolean flags only when explicitly true or false", () => {
    expect(parseBooleanStrict("true", "--undoable")).toBe(true);
    expect(parseBooleanStrict("false", "--undoable")).toBe(false);
    expect(() => parseBooleanStrict("yes", "--undoable")).toThrow(/true or false/);
  });

  it("parses comma-separated and repeatable undo flags", () => {
    expect(parseUndoFlags(["ITEMS,TRACKCFG", "FX"])).toEqual([
      "ITEMS",
      "TRACKCFG",
      "FX",
    ]);
  });

  it("rejects unknown or duplicate undo flags", () => {
    expect(() => parseUndoFlags(["NOPE"])).toThrow(/Unsupported/);
    expect(() => parseUndoFlags(["ITEMS,ITEMS"])).toThrow(/Duplicate/);
  });

  it("rejects explicitly empty undo flag values before normalizing", () => {
    expect(() => parseUndoFlags([""])).toThrow(/non-empty/);
    expect(() => parseUndoFlags(["   "])).toThrow(/non-empty/);
  });

  it("parses CLI flags including --flag=value syntax", () => {
    const raw = parseScaffoldArgs([
      "--name=track_color",
      "--entity-kind",
      "track",
      "--risk",
      "write_safe",
      "--undoable",
      "true",
      "--undo-flags",
      "TRACKCFG",
      "--idempotent=true",
      "--dry-run",
    ]);
    expect(raw).toMatchObject(rawTrackColor());
  });

  it("requires --dry-run and all descriptor flags", () => {
    expect(() => normalizeScaffoldOptions(rawTrackColor({ dryRun: false }))).toThrow(
      /dry-run only/,
    );
    const raw = rawTrackColor();
    delete raw.risk;
    expect(() => normalizeScaffoldOptions(raw)).toThrow(/--risk/);
  });

  it("defaults pack to core and rejects non-core packs", () => {
    expect(normalizeScaffoldOptions(rawTrackColor()).pack).toBe("core");
    expect(() => normalizeScaffoldOptions(rawTrackColor({ pack: "experimental" }))).toThrow(
      /Only --pack core/,
    );
  });

  it("rejects render entity_kind and destructive risk in Slice 18", () => {
    expect(() =>
      normalizeScaffoldOptions(rawTrackColor({ entityKind: "render" })),
    ).toThrow(/render templates are deferred/);
    expect(() =>
      normalizeScaffoldOptions(rawTrackColor({ risk: "destructive" })),
    ).toThrow(/intentionally unsupported/);
  });

  it("requires undo flags exactly when undoable is true", () => {
    expect(() => normalizeScaffoldOptions(rawTrackColor({ undoFlags: [] }))).toThrow(
      /required when --undoable true/,
    );
    expect(() =>
      normalizeScaffoldOptions(
        rawTrackColor({ undoable: "false", undoFlags: [""] }),
      ),
    ).toThrow(/non-empty/);
    expect(() =>
      normalizeScaffoldOptions(
        rawTrackColor({ undoable: "false", undoFlags: ["TRACKCFG"] }),
      ),
    ).toThrow(/must be omitted/);
    expect(
      normalizeScaffoldOptions(rawTrackColor({ undoable: "false", undoFlags: [] })),
    ).toMatchObject({ undoable: false, undoFlags: [] });
  });

  it("rejects names that would collide with existing template slugs", () => {
    expect(() =>
      normalizeScaffoldOptions(rawTrackColor(), { existingSlugs: ["track-color"] }),
    ).toThrow(/collide/);
  });

  it("builds deterministic target paths for an existing core entity module", () => {
    const plan = planForTrackColor();
    expect(plan.paths).toEqual({
      ts: "packages/mcp-server/src/templates/track-color.ts",
      test: "packages/mcp-server/src/tools/__tests__/track-color.test.ts",
      lua: "reaper/packs/core/templates/track.lua",
      manifest: "reaper/packs/core/manifest.lua",
      registry: "packages/mcp-server/src/templates/index.ts",
    });
    expect(plan.wouldCreate).toEqual([
      "packages/mcp-server/src/templates/track-color.ts",
      "packages/mcp-server/src/tools/__tests__/track-color.test.ts",
    ]);
  });

  it("renders a TS skeleton that uses defineTemplate and explicit result schema", () => {
    const ts = renderTsSkeleton(planForTrackColor());
    expect(ts).toContain('import { callTemplateResultSchema, defineTemplate } from "./_shared.js";');
    expect(ts).toContain('const TrackColorResult = callTemplateResultSchema("track_color");');
    expect(ts).toContain("export const trackColorDefinition = defineTemplate({");
    expect(ts).toContain('undo_flags: ["TRACKCFG"]');
    expect(ts).toContain("expectedDelta:");
  });

  it("omits expectedDelta skeleton when undoable=false", () => {
    const plan = planForTrackColor({ undoable: "false", undoFlags: [] });
    expect(renderTsSkeleton(plan)).not.toContain("expectedDelta:");
  });

  it("renders manifest undo flags as a Lua bitmask expression", () => {
    const manifest = renderManifestTodo(planForTrackColor({ undoFlags: ["ITEMS,TRACKCFG"] }));
    expect(manifest).toContain("handler = track_templates.track_color");
    expect(manifest).toContain('undo_label = "Streetlight: track_color"');
    expect(manifest).toContain("undo_flags = undo.UNDO_STATE_ITEMS | undo.UNDO_STATE_TRACKCFG");
    expect(manifest).not.toContain("{ undo.UNDO_STATE_ITEMS");
  });

  it("formats a dry-run plan with warnings and all TODO blocks", () => {
    const formatted = formatScaffoldPlan(planForTrackColor());
    expect(formatted).toContain("WARNING: dry-run only. No files were written.");
    expect(formatted).toContain("WARNING: TODO skeletons are intentionally not lint-clean");
    expect(formatted).toContain("TS skeleton: packages/mcp-server/src/templates/track-color.ts");
    expect(formatted).toContain("Lua handler TODO: reaper/packs/core/templates/track.lua");
    expect(formatted).toContain("Manifest TODO: reaper/packs/core/manifest.lua");
    expect(formatted).toContain("Registry TODO: packages/mcp-server/src/templates/index.ts");
    expect(formatted).toContain("Test TODO: packages/mcp-server/src/tools/__tests__/track-color.test.ts");
  });

  it("is deterministic for the same normalized plan", () => {
    const plan = planForTrackColor();
    expect(formatScaffoldPlan(plan)).toBe(formatScaffoldPlan(plan));
  });
});
