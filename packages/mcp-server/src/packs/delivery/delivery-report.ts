import { z } from "zod";
import { callTemplateResultSchema, defineTemplate } from "../../templates/_shared.js";

const DeliveryReportParams = z
  .object({
    delivery_plan_ref: z
      .string()
      .min(1)
      .describe("Artifact ref produced by delivery_plan."),
  })
  .strict();

const DeliveryReportResult = callTemplateResultSchema("delivery_report");

export const deliveryReportDefinition = defineTemplate({
  name: "delivery_report",
  description:
    "Validate a delivery plan's expected WAV output and write a pass/fail report artifact.",
  pack: "delivery",
  risk: "filesystem",
  mutates: false,
  undoable: false,
  entity_kind: "artifact",
  undo_flags: [],
  idempotent: false,
  artifact: {
    kind: "json",
    scope: "report",
    ref_prefix: "artifact:delivery:report:",
    read_scope: "artifact",
    updates_last_result: false,
    schema: "openreaper.delivery_report.v1",
  },
  params: DeliveryReportParams,
  result: DeliveryReportResult,
  examples: [
    {
      description: "Validate the WAV expected by a delivery_plan artifact.",
      params: {
        delivery_plan_ref:
          "artifact:delivery:plan:art_20260701010101999_000_ab12cd",
      },
    },
  ],
});
