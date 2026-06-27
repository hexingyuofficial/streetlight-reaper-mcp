import { z } from "zod";
import {
  ErrorCodes,
  err,
  type CallTemplateResult,
  type CapabilityRegistry,
  type Result,
} from "@streetlight/core";
import type { FileQueueClient } from "../transport/file-queue.js";

/**
 * Input shape for the agent-facing `call_template` MCP tool.
 *
 * `params` is opaque at this layer — the per-template Zod schema in the
 * registry validates it. We do not enumerate parameter shapes here, so
 * adding a template never touches this file.
 */
export const CallTemplateInput = z.object({
  name: z.string().min(1),
  params: z.unknown().optional(),
});
export type CallTemplateInput = z.infer<typeof CallTemplateInput>;

/**
 * Default timeout for `call_template`. Five seconds is generous for the
 * mutating templates Step 3–5 ship (item_pitch, region_create, etc.);
 * `render_region` will pass a longer timeout explicitly.
 */
export const DEFAULT_CALL_TEMPLATE_TIMEOUT_MS = 5000;

/**
 * MCP-facing wrapper for `call_template`.
 *
 * Validation chain:
 *   1. The input itself must shape up (`name` is a non-empty string).
 *   2. The named template must exist in the registry → otherwise
 *      `TEMPLATE_NOT_FOUND` is returned WITHOUT touching the queue.
 *   3. `params` must pass the template's registered Zod schema → otherwise
 *      `PARAMS_INVALID` is returned WITHOUT touching the queue.
 *   4. Only then do we write a wire command with kind="template",
 *      name=<template>, params=<validated params>.
 *
 * The result the bridge ships back is the locked `CallTemplateResult` shape.
 * No descriptor data ever rides along — see docs/RESPONSE_BUDGET.md.
 *
 * Mutation-timeout semantics (read this before adding auto-retry anywhere):
 * if the bridge has already picked up the command file (moved it to
 * `running/`) when our timeout fires, REAPER may still apply the mutation
 * but we will return `BRIDGE_NOT_RUNNING`. Agents must NOT auto-retry
 * mutating templates on this error code — re-running can double-apply. The
 * recovery path is to call `get_state` and inspect actual state.
 */
export async function callTemplate(
  client: FileQueueClient,
  registry: CapabilityRegistry,
  input: unknown,
  timeoutMs: number = DEFAULT_CALL_TEMPLATE_TIMEOUT_MS,
): Promise<Result<CallTemplateResult>> {
  const shape = CallTemplateInput.safeParse(input);
  if (!shape.success) {
    return err(
      ErrorCodes.PARAMS_INVALID,
      shape.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    );
  }

  const def = registry.get(shape.data.name);
  if (!def) {
    return err(
      ErrorCodes.TEMPLATE_NOT_FOUND,
      `No template registered with name "${shape.data.name}"`,
    );
  }

  const params = def.params.safeParse(shape.data.params ?? {});
  if (!params.success) {
    return err(
      ErrorCodes.PARAMS_INVALID,
      params.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    );
  }

  return client.send<CallTemplateResult>(
    "template",
    params.data,
    { timeoutMs },
    def.name,
  );
}
