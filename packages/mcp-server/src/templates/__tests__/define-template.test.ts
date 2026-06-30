import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CapabilityRegistry,
  type CapabilityDefinition,
  type CapabilityMetadata,
} from "@streetlight/core";
import { listTemplates } from "../../tools/list-templates.js";
import { callTemplateResultSchema, defineTemplate } from "../_shared.js";
import { itemPitchDefinition } from "../item-pitch.js";
import { trackRenameDefinition } from "../track-rename.js";

const itemPitchExpectedDelta = {
  count: 1,
  fields: [
    {
      scope: "take",
      field: "D_PITCH",
      paramPath: "semitones",
      tolerance: 1e-6,
    },
  ],
};

const trackRenameExpectedDelta = {
  count: 1,
  fields: [
    {
      scope: "track",
      field: "P_NAME",
      paramPath: "name",
    },
  ],
};

function makePilotRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registry.register(itemPitchDefinition);
  registry.register(trackRenameDefinition);
  return registry;
}

function jsonSchemaDefinition(schema: unknown, name: string): Record<string, unknown> {
  expect(schema).toBeDefined();
  const root = schema as {
    $ref?: string;
    definitions?: Record<string, Record<string, unknown>>;
  };
  expect(root.$ref).toBe(`#/definitions/${name}`);
  expect(root.definitions).toBeDefined();
  const definition = root.definitions?.[name];
  expect(definition).toBeDefined();
  return definition ?? {};
}

function assertParamsSchema(
  metadata: CapabilityMetadata,
  expected: {
    required: string[];
    properties: Record<string, Record<string, unknown>>;
  },
): void {
  const schema = jsonSchemaDefinition(metadata.params_schema, `${metadata.name}.params`);
  expect(schema.type).toBe("object");
  expect(schema.required).toEqual(expected.required);
  expect(schema.additionalProperties).toBe(false);
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  expect(Object.keys(properties).sort()).toEqual([...expected.required].sort());
  for (const [name, expectedProperty] of Object.entries(expected.properties)) {
    expect(properties[name]).toMatchObject(expectedProperty);
    expect(typeof properties[name]?.description).toBe("string");
  }
}

function assertResultEnvelopeSchema(metadata: CapabilityMetadata): void {
  const schema = jsonSchemaDefinition(metadata.result_schema, `${metadata.name}.result`);
  expect(schema.type).toBe("object");
  expect(schema.required).toEqual([
    "template",
    "changed_count",
    "changed_ids",
    "truncated",
  ]);
  expect(schema.additionalProperties).toBe(false);

  const properties = schema.properties as Record<string, Record<string, unknown>>;
  expect(properties.template).toEqual({
    type: "string",
    const: metadata.name,
  });
  expect(properties.changed_count).toEqual({
    type: "integer",
    minimum: 0,
  });
  expect(properties.changed_ids).toEqual({
    type: "array",
    items: { type: "string" },
    maxItems: 50,
  });
  expect(properties.truncated).toEqual({ type: "boolean" });
}

function expectPilotMetadata(metadata: CapabilityMetadata[]): void {
  const itemPitch = metadata.find((template) => template.name === "item_pitch");
  expect(itemPitch).toBeDefined();
  if (itemPitch) {
    expect(itemPitch.risk).toBe("write_safe");
    expect(itemPitch.mutates).toBe(true);
    expect(itemPitch.undoable).toBe(true);
    expect(itemPitch.entity_kind).toBe("item");
    expect(itemPitch.undo_flags).toEqual(["ITEMS"]);
    expect(itemPitch.idempotent).toBe(true);
    expect(itemPitch.expectedDelta).toEqual(itemPitchExpectedDelta);
    expect(itemPitch.examples).toEqual([
      {
        description: "Pitch the first selected item down one octave.",
        params: { item_id: "selected:0", semitones: -12 },
      },
    ]);
    assertParamsSchema(itemPitch, {
      required: ["item_id", "semitones"],
      properties: {
        item_id: { type: "string", minLength: 1 },
        semitones: { type: "number", minimum: -24, maximum: 24 },
      },
    });
    assertResultEnvelopeSchema(itemPitch);
  }

  const trackRename = metadata.find((template) => template.name === "track_rename");
  expect(trackRename).toBeDefined();
  if (trackRename) {
    expect(trackRename.risk).toBe("write_safe");
    expect(trackRename.mutates).toBe(true);
    expect(trackRename.undoable).toBe(true);
    expect(trackRename.entity_kind).toBe("track");
    expect(trackRename.undo_flags).toEqual(["TRACKCFG"]);
    expect(trackRename.idempotent).toBe(true);
    expect(trackRename.expectedDelta).toEqual(trackRenameExpectedDelta);
    expect(trackRename.examples).toEqual([
      {
        description: "Rename the most recently changed track.",
        params: { track_id: "last_result:track:0", name: "Impacts" },
      },
    ]);
    assertParamsSchema(trackRename, {
      required: ["track_id", "name"],
      properties: {
        track_id: { type: "string", minLength: 1 },
        name: { type: "string", minLength: 1 },
      },
    });
    assertResultEnvelopeSchema(trackRename);
  }
}

describe("defineTemplate", () => {
  it("returns the exact definition object it receives", () => {
    const Params = z.object({ item_id: z.string().min(1) }).strict();
    const Result = callTemplateResultSchema("identity_probe");
    const definition = {
      name: "identity_probe",
      description: "Probe identity behavior.",
      pack: "test",
      risk: "read",
      mutates: false,
      undoable: false,
      entity_kind: "item",
      undo_flags: [],
      idempotent: true,
      params: Params,
      result: Result,
      examples: [{ params: { item_id: "selected:0" } }],
    } satisfies CapabilityDefinition<typeof Params, typeof Result> & {
      name: "identity_probe";
    };

    expect(defineTemplate(definition)).toBe(definition);
  });

  it("keeps pilot metadata stable through CapabilityRegistry", () => {
    const registry = makePilotRegistry();
    expectPilotMetadata(registry.list());
  });

  it("keeps pilot metadata stable through list_templates", () => {
    const registry = makePilotRegistry();
    const result = listTemplates(registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectPilotMetadata(result.result.templates);
  });
});
