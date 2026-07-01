import type { CapabilityRegistry } from "@streetlight/core";
import { deliveryPlanDefinition } from "./delivery-plan.js";
import { deliveryReportDefinition } from "./delivery-report.js";

export const DELIVERY_PACK_ID = "delivery";

export function registerDeliveryTemplates(registry: CapabilityRegistry): void {
  registry.register(deliveryPlanDefinition);
  registry.register(deliveryReportDefinition);
}
