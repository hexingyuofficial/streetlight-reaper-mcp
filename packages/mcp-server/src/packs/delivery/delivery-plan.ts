import { z } from "zod";
import { callTemplateResultSchema, defineTemplate } from "../../templates/_shared.js";

const DeliveryPlanParams = z
  .object({
    region_id: z
      .string()
      .min(1)
      .describe("Region reference to deliver, e.g. region:var_01 or last_result:region:0."),
    output_dir: z
      .string()
      .min(1)
      .describe("Absolute directory where render_region is expected to write the WAV."),
    cleanup_plan_ref: z
      .string()
      .min(1)
      .optional()
      .describe("Optional cleanup plan artifact ref used only as provenance."),
    cleanup_fingerprint: z
      .string()
      .min(1)
      .optional()
      .describe("Optional cleanup-plan fingerprint copied as provenance without dereferencing."),
  })
  .strict();

const DeliveryPlanResult = callTemplateResultSchema("delivery_plan");

export const deliveryPlanDefinition = defineTemplate({
  name: "delivery_plan",
  description:
    "Create a delivery plan artifact for one region and its expected WAV output. Does not render or mutate REAPER.",
  pack: "delivery",
  risk: "filesystem",
  mutates: false,
  undoable: false,
  entity_kind: "artifact",
  undo_flags: [],
  idempotent: false,
  artifact: {
    kind: "json",
    scope: "plan",
    ref_prefix: "artifact:delivery:plan:",
    read_scope: "artifact",
    updates_last_result: false,
    schema: "openreaper.delivery_plan.v1",
  },
  params: DeliveryPlanParams,
  result: DeliveryPlanResult,
  examples: [
    {
      description: "Plan delivery for an already-created region.",
      params: {
        region_id: "region:var_01",
        output_dir: "/tmp/openreaper-delivery",
      },
    },
  ],
});
