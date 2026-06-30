import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { CapabilityRegistry } from "@streetlight/core";
import { FileQueueClient } from "../../transport/file-queue.js";
import { startFakeBridge } from "../../transport/__tests__/fake-bridge.js";
import { callTemplate } from "../call-template.js";
import { listTemplates } from "../list-templates.js";
import { registerCoreTemplates } from "../../templates/index.js";

function fakeTemplateOk(
  template: string,
  changedIds: string[],
): { ok: true; result: unknown } {
  return {
    ok: true,
    result: {
      template,
      changed_count: changedIds.length,
      changed_ids: changedIds,
      truncated: false,
    },
  };
}

describe("callTemplate(track_color)", () => {
  let queueDir: string;
  let client: FileQueueClient;
  let registry: CapabilityRegistry;

  beforeEach(async () => {
    queueDir = await fs.mkdtemp(path.join(os.tmpdir(), "streetlight-tcol-"));
    client = new FileQueueClient({
      queueDir,
      initialPollIntervalMs: 10,
      maxPollIntervalMs: 20,
    });
    await client.init();
    registry = new CapabilityRegistry();
    registerCoreTemplates(registry);
  });

  afterEach(async () => {
    await fs.rm(queueDir, { recursive: true, force: true });
  });

  it("happy path: returns the track GUID in the locked envelope", async () => {
    const bridge = startFakeBridge(queueDir, () =>
      fakeTemplateOk("track_color", ["guid:{TRACK-COLOR}"]),
    );
    try {
      const result = await callTemplate(client, registry, {
        name: "track_color",
        params: { track_id: "last_result:track:0", color: "#2D9CDB" },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.template).toBe("track_color");
        expect(result.result.changed_count).toBe(1);
        expect(result.result.changed_ids).toEqual(["guid:{TRACK-COLOR}"]);
        expect(result.result.truncated).toBe(false);
      }
    } finally {
      await bridge.stop();
    }
  });

  it("on-wire: uppercase color reaches the bridge unchanged", async () => {
    const bridge = startFakeBridge(queueDir, () =>
      fakeTemplateOk("track_color", ["guid:{T}"]),
    );
    try {
      await callTemplate(client, registry, {
        name: "track_color",
        params: { track_id: "track:Drums", color: "#000000" },
      });
      expect(bridge.seen).toHaveLength(1);
      expect(bridge.seen[0]?.name).toBe("track_color");
      expect(bridge.seen[0]?.params).toEqual({
        track_id: "track:Drums",
        color: "#000000",
      });
      expect(bridge.seen[0]?.expected_delta).toEqual({
        count: 1,
        fields: [
          {
            scope: "track",
            field: "I_CUSTOMCOLOR_HEX",
            param_path: "color",
            nullable: true,
          },
        ],
      });
    } finally {
      await bridge.stop();
    }
  });

  it("on-wire: null color reaches the bridge as null for clear", async () => {
    const bridge = startFakeBridge(queueDir, () =>
      fakeTemplateOk("track_color", ["guid:{T}"]),
    );
    try {
      await callTemplate(client, registry, {
        name: "track_color",
        params: { track_id: "last_result:track:0", color: null },
      });
      expect(bridge.seen[0]?.params).toEqual({
        track_id: "last_result:track:0",
        color: null,
      });
    } finally {
      await bridge.stop();
    }
  });

  it("surfaces TRACK_NOT_FOUND from the bridge", async () => {
    const bridge = startFakeBridge(queueDir, () => ({
      ok: false,
      error: {
        code: "TRACK_NOT_FOUND",
        message: "No track named 'Nope'",
        recoverable: true,
      },
    }));
    try {
      const result = await callTemplate(client, registry, {
        name: "track_color",
        params: { track_id: "track:Nope", color: "#2D9CDB" },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("TRACK_NOT_FOUND");
    } finally {
      await bridge.stop();
    }
  });

  it("PARAMS_INVALID: missing track_id, no bridge round-trip", async () => {
    const bridge = startFakeBridge(queueDir, () =>
      fakeTemplateOk("track_color", []),
    );
    try {
      const result = await callTemplate(client, registry, {
        name: "track_color",
        params: { color: "#2D9CDB" },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("PARAMS_INVALID");
      expect(bridge.seen).toHaveLength(0);
    } finally {
      await bridge.stop();
    }
  });

  it("PARAMS_INVALID: rejects lowercase hex to keep verify string comparison stable", async () => {
    const bridge = startFakeBridge(queueDir, () =>
      fakeTemplateOk("track_color", []),
    );
    try {
      const result = await callTemplate(client, registry, {
        name: "track_color",
        params: { track_id: "track:Drums", color: "#2d9cdb" },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("PARAMS_INVALID");
      expect(bridge.seen).toHaveLength(0);
    } finally {
      await bridge.stop();
    }
  });

  it("PARAMS_INVALID: rejects malformed colors", async () => {
    const bridge = startFakeBridge(queueDir, () =>
      fakeTemplateOk("track_color", []),
    );
    try {
      const result = await callTemplate(client, registry, {
        name: "track_color",
        params: { track_id: "track:Drums", color: "2D9CDB" },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("PARAMS_INVALID");
      expect(bridge.seen).toHaveLength(0);
    } finally {
      await bridge.stop();
    }
  });

  it("list_templates exposes the color field verification contract", () => {
    const result = listTemplates(registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const trackColor = result.result.templates.find((t) => t.name === "track_color");
    expect(trackColor).toMatchObject({
      name: "track_color",
      risk: "write_safe",
      mutates: true,
      undoable: true,
      entity_kind: "track",
      undo_flags: ["TRACKCFG"],
      idempotent: true,
      expectedDelta: {
        count: 1,
        fields: [
          {
            scope: "track",
            field: "I_CUSTOMCOLOR_HEX",
            paramPath: "color",
            nullable: true,
          },
        ],
      },
    });
    expect(trackColor?.examples).toEqual([
      {
        description: "Set the most recently changed track to blue.",
        params: { track_id: "last_result:track:0", color: "#2D9CDB" },
      },
      {
        description: "Clear the most recently changed track's custom color.",
        params: { track_id: "last_result:track:0", color: null },
      },
    ]);
  });
});
