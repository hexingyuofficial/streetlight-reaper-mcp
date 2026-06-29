import { z } from "zod";
import type { ProjectState, Result } from "@streetlight/core";
import type { FileQueueClient } from "../transport/file-queue.js";

/**
 * The full set of scopes named in ARCHITECTURE.md. Slice 01 implements
 * `selection`, `project`, `tracks`, and `regions`; `render` remains a
 * reserved spelling that the bridge rejects with SCOPE_NOT_IMPLEMENTED.
 */
export const GetStateScope = z.enum([
  "project",
  "tracks",
  "selection",
  "regions",
  "render",
]);
export type GetStateScope = z.infer<typeof GetStateScope>;

/**
 * Response-budget backstop. See docs/RESPONSE_BUDGET.md.
 *
 * `limit` defaults to 50 and clamps to `[1, 200]`. The bridge applies the same
 * clamp; the TS-side clamp is a defense-in-depth so an LLM asking for a
 * 10000-item read gets a sensible response without round-tripping into Lua.
 */
export const DEFAULT_GET_STATE_LIMIT = 50;
export const MAX_GET_STATE_LIMIT = 200;
export const MIN_GET_STATE_LIMIT = 1;

export const GetStateInclude = z.enum(["fx"]);
export type GetStateInclude = z.infer<typeof GetStateInclude>;

export const GetStateInput = z
  .object({
    scope: GetStateScope.default("selection"),
    limit: z
      .number()
      .int()
      .min(MIN_GET_STATE_LIMIT)
      .max(MAX_GET_STATE_LIMIT)
      .default(DEFAULT_GET_STATE_LIMIT),
    include: z.array(GetStateInclude).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.include && input.include.length > 0 && input.scope !== "tracks") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["include"],
        message: "include is only valid with scope='tracks'",
      });
    }
  });
export type GetStateInput = z.infer<typeof GetStateInput>;

/** Read REAPER project state. Returns a Result; never throws. */
export async function getState(
  client: FileQueueClient,
  input: Partial<GetStateInput> = {},
  timeoutMs = 5000,
): Promise<Result<ProjectState>> {
  const parsed = GetStateInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "PARAMS_INVALID",
        message: parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; "),
        recoverable: true,
      },
    };
  }
  return client.send<ProjectState>("get_state", parsed.data, { timeoutMs });
}
