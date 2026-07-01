import { z } from "zod";
import { callTemplateResultSchema, defineTemplate } from "../../templates/_shared.js";

const FixtureTrackRenameParams = z
  .object({
    track_id: z
      .string()
      .min(1)
      .describe(
        'Logical track reference. Supports "track:Name", "guid:{...}", and "last_result:track:N".',
      ),
    name: z
      .string()
      .min(1)
      .describe("New track name. Must be non-empty."),
  })
  .strict();

const FixtureTrackRenameResult = callTemplateResultSchema("fixture_track_rename");

export const fixtureTrackRenameDefinition = defineTemplate({
  name: "fixture_track_rename",
  description:
    "Fixture-pack template used to prove non-core pack loading; renames a track.",
  pack: "pack_contract_fixture",
  risk: "write_safe",
  mutates: true,
  undoable: true,
  entity_kind: "track",
  undo_flags: ["TRACKCFG"],
  idempotent: true,
  expectedDelta: {
    count: 1,
    fields: [{ scope: "track", field: "P_NAME", paramPath: "name" }],
  },
  params: FixtureTrackRenameParams,
  result: FixtureTrackRenameResult,
  examples: [
    {
      description: "Rename the most recently changed track through the fixture pack.",
      params: {
        track_id: "last_result:track:0",
        name: "Fixture Pack Smoke",
      },
    },
  ],
});
