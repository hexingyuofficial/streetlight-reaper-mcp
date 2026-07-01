import type { CapabilityRegistry } from "@streetlight/core";
import { itemAudioAnalyzeDefinition } from "./item-audio-analyze.js";

export const ANALYSIS_PACK_ID = "analysis";

export function registerAnalysisTemplates(registry: CapabilityRegistry): void {
  registry.register(itemAudioAnalyzeDefinition);
}
