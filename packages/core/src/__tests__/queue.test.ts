import { describe, it, expect, beforeEach } from "vitest";
import {
  makeCommandId,
  _resetCounterForTests,
  _setRngForTests,
} from "../queue.js";

describe("makeCommandId", () => {
  beforeEach(() => {
    _resetCounterForTests();
  });

  it("produces the documented format with millisecond + counter + random", () => {
    _setRngForTests(() => 0); // suffix = 000000
    const id = makeCommandId(new Date("2026-06-27T12:00:00.123Z"));
    expect(id).toMatch(/^cmd_20260627120000123_\d{3}_[0-9a-f]{6}$/);
  });

  it("counter advances within the same millisecond", () => {
    _setRngForTests(() => 0);
    const now = new Date("2026-06-27T12:00:00.000Z");
    const a = makeCommandId(now);
    const b = makeCommandId(now);
    expect(a).not.toBe(b);
    expect(a.split("_")[2]).toBe("001");
    expect(b.split("_")[2]).toBe("002");
  });

  it("zero-pads counter to three digits and suffix to six hex", () => {
    _setRngForTests(() => 0);
    const id = makeCommandId(new Date("2026-06-27T12:00:00.000Z"));
    const parts = id.split("_");
    expect(parts[2]).toMatch(/^\d{3}$/);
    expect(parts[3]).toMatch(/^[0-9a-f]{6}$/);
  });

  it("uses UTC, not local time", () => {
    _setRngForTests(() => 0);
    const id = makeCommandId(new Date("2026-12-31T23:59:59.999Z"));
    expect(id).toMatch(/^cmd_20261231235959999_/);
  });

  it("zero-pads milliseconds to three digits", () => {
    _setRngForTests(() => 0);
    const id = makeCommandId(new Date("2026-06-27T12:00:00.007Z"));
    expect(id).toMatch(/^cmd_20260627120000007_/);
  });

  it("preserves lexicographic order across milliseconds (FIFO unbroken)", () => {
    // Adjacent milliseconds — earlier ms must sort before later ms even when
    // counters and suffixes differ. This is what keeps the bridge's
    // table.sort() FIFO scan correct.
    _setRngForTests(() => 0.9); // late-bucket suffix on the earlier id
    const a = makeCommandId(new Date("2026-06-27T12:00:00.123Z"));
    _setRngForTests(() => 0); // early-bucket suffix on the later id
    const b = makeCommandId(new Date("2026-06-27T12:00:00.124Z"));
    expect([a, b].sort()).toEqual([a, b]);
  });

  it("random suffix lands in the expected hex range", () => {
    // 0xFFFFFF / 0x1000000 ≈ 0.9999999. The output should be the all-Fs suffix.
    _setRngForTests(() => 0xffffff / 0x1000000);
    const id = makeCommandId(new Date("2026-06-27T12:00:00.000Z"));
    expect(id.endsWith("_ffffff")).toBe(true);
  });
});
