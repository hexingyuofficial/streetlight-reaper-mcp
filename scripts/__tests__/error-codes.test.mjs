import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  diffLuaErrorCodeLiteralUsage,
  diffUnknownLuaErrorCodes,
  findLuaErrorCodeReferences,
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
          raise(code or 'TRACK_NOT_FOUND', "no track")
          return nil, 'REF_INVALID', "bad ref"
          error({ code = "NOPE", message = "bad" })
          error({ code = 'BAD_SINGLE_QUOTE', message = "bad" })
        `,
      },
    ];

    expect(findLuaErrorCodeLiterals(files)).toEqual([
      { path: "handler.lua", code: "NOPE", kind: "code-field" },
      { path: "handler.lua", code: "BAD_SINGLE_QUOTE", kind: "code-field" },
      { path: "handler.lua", code: "ITEM_NOT_FOUND", kind: "raise" },
      { path: "handler.lua", code: "TRACK_NOT_FOUND", kind: "raise" },
      { path: "handler.lua", code: "REF_INVALID", kind: "resolver-return" },
    ]);
    expect(diffUnknownLuaErrorCodes(files, ["ITEM_NOT_FOUND", "REF_INVALID", "TRACK_NOT_FOUND"])).toEqual([
      "handler.lua: unknown error code NOPE",
      "handler.lua: unknown error code BAD_SINGLE_QUOTE",
    ]);
  });

  it("finds unknown generated-code member references", () => {
    const files = [
      {
        path: "handler.lua",
        text: `
          raise(ctx.errs.ITEM_NOT_FOUND, "no item")
          raise(errs.PARAMS_INVALD, "typo")
          error({ code = ERRS.INTERNAL_ERROR, message = "bad" })
        `,
      },
    ];

    expect(findLuaErrorCodeReferences(files)).toEqual([
      { path: "handler.lua", code: "ITEM_NOT_FOUND", kind: "ctx.errs-ref" },
      { path: "handler.lua", code: "PARAMS_INVALD", kind: "errs-ref" },
      { path: "handler.lua", code: "INTERNAL_ERROR", kind: "ERRS-ref" },
    ]);
    expect(diffUnknownLuaErrorCodes(files, ["INTERNAL_ERROR", "ITEM_NOT_FOUND"])).toEqual([
      "handler.lua: unknown error code PARAMS_INVALD",
    ]);
  });

  it("rejects known Lua error codes used as string literals", () => {
    const files = [
      {
        path: "handler.lua",
        text: `
          raise(code or "TRACK_NOT_FOUND", "no track")
          return nil, 'REF_INVALID', "bad ref"
          error({ code = ERRS.INTERNAL_ERROR, message = "ok" })
          error({ code = 'PARAMS_INVALID', message = "bad" })
        `,
      },
    ];

    expect(diffLuaErrorCodeLiteralUsage(files, ["PARAMS_INVALID", "REF_INVALID", "TRACK_NOT_FOUND"])).toEqual([
      "handler.lua: code-field uses string-literal error code PARAMS_INVALID; use errs.PARAMS_INVALID or ERRS.PARAMS_INVALID",
      "handler.lua: raise uses string-literal error code TRACK_NOT_FOUND; use errs.TRACK_NOT_FOUND or ERRS.TRACK_NOT_FOUND",
      "handler.lua: resolver-return uses string-literal error code REF_INVALID; use errs.REF_INVALID or ERRS.REF_INVALID",
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
