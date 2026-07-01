import { describe, expect, it } from "vitest";
import { CORE_PACK_ID, isValidPackId, parseEnabledPacks } from "../packs.js";

describe("pack helpers", () => {
  it("defaults to core when input is absent or blank", () => {
    expect(parseEnabledPacks()).toEqual([CORE_PACK_ID]);
    expect(parseEnabledPacks("")).toEqual([CORE_PACK_ID]);
    expect(parseEnabledPacks("   ")).toEqual([CORE_PACK_ID]);
  });

  it("parses comma-separated pack ids in order", () => {
    expect(parseEnabledPacks("core,pack_contract_fixture")).toEqual([
      "core",
      "pack_contract_fixture",
    ]);
    expect(parseEnabledPacks(" core , pack_contract_fixture ")).toEqual([
      "core",
      "pack_contract_fixture",
    ]);
  });

  it("validates pack ids", () => {
    expect(isValidPackId("core")).toBe(true);
    expect(isValidPackId("pack_contract_fixture")).toBe(true);
    expect(isValidPackId("Pack")).toBe(false);
    expect(isValidPackId("pack-contract")).toBe(false);
    expect(isValidPackId("1pack")).toBe(false);
  });

  it("rejects duplicate pack ids", () => {
    expect(() => parseEnabledPacks("core,core")).toThrow(/Duplicate pack id/);
  });

  it("requires core", () => {
    expect(() => parseEnabledPacks("pack_contract_fixture")).toThrow(
      /must include core/,
    );
  });

  it("requires core to be first", () => {
    expect(() => parseEnabledPacks("pack_contract_fixture,core")).toThrow(
      /must start with core/,
    );
  });
});
