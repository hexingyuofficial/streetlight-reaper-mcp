import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  diffUnknownLuaErrorCodes,
  findLuaErrorCodeLiterals,
  generateErrorCodesLua,
  parseErrorCodesTs,
} from "../error-codes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

describe("error code generation", () => {
  it("parses the ErrorCodes object from TypeScript", () => {
    const codes = parseErrorCodesTs(`
export const ErrorCodes = {
  ITEM_NOT_FOUND: "ITEM_NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
`);
    expect(codes).toEqual(["INTERNAL_ERROR", "ITEM_NOT_FOUND"]);
  });

  it("generates deterministic Lua constants with an auto-generated header", () => {
    const lua = generateErrorCodesLua(["ITEM_NOT_FOUND", "INTERNAL_ERROR"]);
    expect(lua).toContain("AUTO-GENERATED");
    expect(lua).toContain('  INTERNAL_ERROR = "INTERNAL_ERROR",');
    expect(lua.indexOf('  INTERNAL_ERROR = "INTERNAL_ERROR",')).toBeLessThan(
      lua.indexOf('  ITEM_NOT_FOUND = "ITEM_NOT_FOUND",'),
    );
  });

  it("finds Lua raise/code literals and reports unknown values", () => {
    const files = [
      {
        path: "handler.lua",
        text: `
          raise("ITEM_NOT_FOUND", "no item")
          raise(code or "TRACK_NOT_FOUND", "no track")
          return nil, "REF_INVALID", "bad ref"
          error({ code = "NOPE", message = "bad" })
        `,
      },
    ];

    expect(findLuaErrorCodeLiterals(files)).toEqual([
      { path: "handler.lua", code: "NOPE" },
      { path: "handler.lua", code: "ITEM_NOT_FOUND" },
      { path: "handler.lua", code: "TRACK_NOT_FOUND" },
      { path: "handler.lua", code: "REF_INVALID" },
    ]);
    expect(diffUnknownLuaErrorCodes(files, ["ITEM_NOT_FOUND", "REF_INVALID", "TRACK_NOT_FOUND"])).toEqual([
      "handler.lua: unknown error code NOPE",
    ]);
  });

  it("committed error_codes.lua is fresh against errors.ts", async () => {
    const errorsText = await fs.readFile(
      path.join(repoRoot, "packages/core/src/errors.ts"),
      "utf8",
    );
    const codes = parseErrorCodesTs(errorsText);
    const expected = generateErrorCodesLua(codes);
    const actual = await fs.readFile(
      path.join(repoRoot, "reaper/packs/core/error_codes.lua"),
      "utf8",
    );

    expect(actual).toBe(expected);
  });
});
