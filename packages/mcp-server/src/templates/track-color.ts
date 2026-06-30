import { z } from "zod";
import { callTemplateResultSchema, defineTemplate } from "./_shared.js";

/**
 * `track_color` — set or clear a track's custom color.
 *
 * Agent-facing color stays portable: `#RRGGBB` for an enabled custom
 * color, `null` to clear. The Lua handler owns REAPER's native
 * I_CUSTOMCOLOR integer (`ColorToNative(...) | 0x1000000`) so agents do
 * not need to reason about platform-native color packing.
 */

const TrackColorParams = z
  .object({
    track_id: z
      .string()
      .min(1)
      .describe(
        'Logical track reference. Supports "track:Name", "guid:{...}", and "last_result:track:N".',
      ),
    color: z
      .string()
      .regex(/^#[0-9A-F]{6}$/)
      .nullable()
      .describe(
        'Custom color as uppercase "#RRGGBB", or null to clear the custom color. "#000000" is black, not clear.',
      ),
  })
  .strict();

const TrackColorResult = callTemplateResultSchema("track_color");

export const trackColorDefinition = defineTemplate({
  name: "track_color",
  description: "Set or clear a track custom color using a portable #RRGGBB value.",
  pack: "core",
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
  params: TrackColorParams,
  result: TrackColorResult,
  examples: [
    {
      description: "Set the most recently changed track to blue.",
      params: { track_id: "last_result:track:0", color: "#2D9CDB" },
    },
    {
      description: "Clear the most recently changed track's custom color.",
      params: { track_id: "last_result:track:0", color: null },
    },
  ],
});
