import { z } from "zod";
import { callTemplateResultSchema, defineTemplate } from "../../templates/_shared.js";

const ANALYSIS_FEATURES = [
  "loudness",
  "peaks",
  "silence",
  "transients",
  "loop_candidates",
  "click_risk",
] as const;
const DEFAULT_ANALYSIS_FEATURES = ["loudness", "peaks", "silence"] as const;
const CLICK_RISK_MIN_DURATION_SECONDS = 0.05;
const CLICK_RISK_MAX_DURATION_SECONDS = 8.0;

const TimeRange = z
  .object({
    start: z
      .number()
      .finite()
      .min(0)
      .describe("Start offset in item-local seconds."),
    end: z
      .number()
      .finite()
      .positive()
      .describe("End offset in item-local seconds. Must be greater than start."),
  })
  .strict()
  .refine((value) => value.end > value.start, {
    message: "time_range.end must be greater than time_range.start",
    path: ["end"],
  });

const LoopWindow = z
  .object({
    start: z
      .number()
      .finite()
      .min(0)
      .describe("Loop start in item-local seconds."),
    end: z
      .number()
      .finite()
      .positive()
      .describe("Loop end in item-local seconds. Must be greater than start."),
  })
  .strict()
  .refine((value) => value.end > value.start, {
    message: "loop_window.end must be greater than loop_window.start",
    path: ["end"],
  })
  .refine(
    (value) => value.end - value.start >= CLICK_RISK_MIN_DURATION_SECONDS,
    {
      message: `loop_window duration must be at least ${CLICK_RISK_MIN_DURATION_SECONDS} seconds`,
      path: ["end"],
    },
  )
  .refine(
    (value) => value.end - value.start <= CLICK_RISK_MAX_DURATION_SECONDS,
    {
      message: `loop_window duration must be at most ${CLICK_RISK_MAX_DURATION_SECONDS} seconds`,
      path: ["end"],
    },
  );

const ItemAudioAnalyzeParams = z
  .object({
    item_id: z
      .string()
      .min(1)
      .describe("Item reference to analyze, e.g. selected:0, guid:{...}, or last_result:item:0."),
    features: z
      .array(z.enum(ANALYSIS_FEATURES))
      .min(1)
      .max(ANALYSIS_FEATURES.length)
      .optional()
      .default([...DEFAULT_ANALYSIS_FEATURES])
      .describe(
        "Feature set for analysis. Defaults to loudness, peaks, and silence; transients, loop_candidates, and click_risk must be requested explicitly.",
      ),
    time_range: TimeRange.optional().describe(
      "Optional item-local analysis window in seconds. Omitted means the whole item.",
    ),
    loop_window: LoopWindow.optional().describe(
      "Item-local loop boundary to score when features includes click_risk. Required for standalone click_risk; same-call loop_candidates may supply the best candidate when omitted.",
    ),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [i, feature] of value.features.entries()) {
      if (seen.has(feature)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["features", i],
          message: `Duplicate analysis feature: ${feature}`,
        });
      }
      seen.add(feature);
    }
    const hasClickRisk = seen.has("click_risk");
    const hasLoopCandidates = seen.has("loop_candidates");
    if (value.loop_window && !hasClickRisk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["loop_window"],
        message: "loop_window is only valid when features includes click_risk",
      });
    }
    if (hasClickRisk && !value.loop_window && !hasLoopCandidates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["loop_window"],
        message:
          "loop_window is required when click_risk is requested without loop_candidates",
      });
    }
  });

const ItemAudioAnalyzeResult = callTemplateResultSchema("item_audio_analyze");

export const itemAudioAnalyzeDefinition = defineTemplate({
  name: "item_audio_analyze",
  description:
    "Analyze one in-project audio item and write a bounded JSON analysis artifact. Reports RMS dBFS, sample peaks, silence segments, opt-in transient candidates, opt-in loop candidate intervals, and opt-in loop-boundary click risk.",
  pack: "analysis",
  risk: "filesystem",
  mutates: false,
  undoable: false,
  entity_kind: "artifact",
  undo_flags: [],
  idempotent: false,
  artifact: {
    kind: "json",
    scope: "analysis",
    ref_prefix: "artifact:analysis:analysis:",
    read_scope: "artifact",
    updates_last_result: false,
    schema: "openreaper.analysis.item_audio.v1",
  },
  params: ItemAudioAnalyzeParams,
  result: ItemAudioAnalyzeResult,
  examples: [
    {
      description: "Analyze the selected item's loudness, peaks, and silence.",
      params: {
        item_id: "selected:0",
      },
    },
    {
      description: "Analyze a bounded item-local window.",
      params: {
        item_id: "last_result:item:0",
        features: ["loudness", "peaks", "silence"],
        time_range: { start: 0, end: 1.5 },
      },
    },
    {
      description: "Analyze transient candidates only.",
      params: {
        item_id: "selected:0",
        features: ["transients"],
      },
    },
    {
      description: "Analyze loop candidate intervals only.",
      params: {
        item_id: "selected:0",
        features: ["loop_candidates"],
      },
    },
    {
      description: "Score click risk for an explicit item-local loop window.",
      params: {
        item_id: "selected:0",
        features: ["click_risk"],
        loop_window: { start: 0.2, end: 1.2 },
      },
    },
    {
      description: "Find loop candidates and score click risk for the best one.",
      params: {
        item_id: "selected:0",
        features: ["loop_candidates", "click_risk"],
      },
    },
  ],
});
