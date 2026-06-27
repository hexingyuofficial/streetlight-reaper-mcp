/**
 * Descriptor types that flow back from the bridge to the agent.
 * Mutating templates MUST populate `id` with a guid:{...} reference so the
 * agent can promote `selected:` / `last_result:` references to stable ones.
 *
 * Naming convention: `name` and `track_name` are REQUIRED strings. When the
 * underlying REAPER object has no user-assigned name, the value is `""` —
 * "the user did not set a name" is real state, not a missing field. We never
 * return `null` or omit the key. See docs/RESPONSE_BUDGET.md §
 * "Empty Strings vs Missing Fields" for why this is locked.
 */

export interface ItemDescriptor {
  /** guid:{...} reference. Stable across commands and sessions. */
  id: string;
  /** Active take name. `""` when the take is unnamed. */
  name: string;
  /** Parent track name. `""` when the track is unnamed. */
  track_name: string;
  position: number;
  length: number;
}

export interface TrackDescriptor {
  /** guid:{...} reference. */
  id: string;
  /** Track name. `""` when the track is unnamed. */
  name: string;
  index: number;
}

export interface RegionDescriptor {
  /** Region names are user-facing references in v0.1; indices are not stable. */
  name: string;
  start: number;
  end: number;
}

/**
 * Response-budget metadata attached to every list-shaped response.
 * See docs/RESPONSE_BUDGET.md for the contract.
 *
 * - `total`         — true count in REAPER, regardless of what was returned.
 * - `returned`      — how many items are in this response.
 * - `truncated`     — `returned < total`, for whatever reason
 *                     (limit hit OR byte cap hit at item boundary).
 * - `response_bytes`— rough size of the items payload after JSON encoding.
 */
export interface ResponseBudgetMeta {
  total: number;
  returned: number;
  truncated: boolean;
  response_bytes: number;
}

export interface SelectionState extends ResponseBudgetMeta {
  items: ItemDescriptor[];
}

export interface ProjectState {
  selection: SelectionState;
}

/** REAPER major.minor.patch version string, e.g. "7.21". */
export type ReaperVersion = string;

/**
 * Locked v0.1 shape returned by every `call_template` invocation, regardless
 * of the underlying template. See docs/RESPONSE_BUDGET.md § `call_template`
 * for the rationale.
 *
 * Rules (enforced at the Lua dispatcher, not in individual templates):
 *
 * - `changed_count` is the **true** count of items the template mutated.
 * - `changed_ids` is capped at 50 GUIDs in mutation order. If
 *   `changed_count > 50` then `truncated: true` and the array contains the
 *   first 50.
 * - The result NEVER embeds `ItemDescriptor` or other rich payloads, even
 *   for single-item mutations. Agents read post-state via
 *   `get_state(ids=[...])` (v0.1: ids filter unimplemented — the agent
 *   reads `selection` and matches on returned GUIDs).
 *
 * This shape is the same for read-only, write-safe, filesystem-touching,
 * and (eventually) destructive templates. Bridge dispatcher normalizes —
 * individual handlers only return `{ changed_ids = [...] }`.
 */
export interface CallTemplateResult {
  template: string;
  changed_count: number;
  changed_ids: string[];
  truncated: boolean;
}
