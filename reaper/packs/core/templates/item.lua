-- templates/item.lua — item-scoped templates.
--
-- Each handler is `function(params, ctx) -> { changed_ids = {...} }`.
--   `params` has already been validated by the TS-side Zod schema; do not
--           re-validate types here. Only validate runtime-only conditions
--           (item exists, take exists, etc).
--   `ctx`    is `{ refs = refs_module, last_result = bridge_table }`.
--           Hand `last_result` to refs so Step 4's `last_result:item:N`
--           resolution lands without churn here.
--
-- Errors are raised via `error({ code = "...", message = "..." })`. The
-- dispatcher catches and translates these into proper error envelopes.
-- DO NOT `error("string")` — typed codes are part of the protocol.
--
-- The result table is `{ changed_ids = { "guid:{...}", ... } }`. The
-- dispatcher reads ONLY this field. Any other field (e.g. you sneak in a
-- descriptor) is silently dropped. See docs/RESPONSE_BUDGET.md.

local M = {}

local function raise(code, message)
  error({ code = code, message = message })
end

local function get_item_guid_ref(item)
  local _, guid = reaper.GetSetMediaItemInfo_String(item, "GUID", "", false)
  if not guid or guid == "" then
    raise("INTERNAL_ERROR", "REAPER returned no GUID for the mutated item")
  end
  return "guid:" .. guid
end

-- item_pitch: set the active take's D_PITCH to `params.semitones`.
--
-- Note: pitch is a TAKE property in REAPER, not a media item property.
-- An empty MIDI item with no takes can be selected but cannot be pitched —
-- TAKE_NOT_FOUND is the correct error there.
function M.item_pitch(params, ctx)
  local item, code, msg = ctx.refs.resolve_item(params.item_id, ctx.last_result)
  if not item then raise(code or "ITEM_NOT_FOUND", msg or "Item not found") end

  local take = reaper.GetActiveTake(item)
  if not take then
    raise("TAKE_NOT_FOUND", "Item has no active take to pitch")
  end

  reaper.SetMediaItemTakeInfo_Value(take, "D_PITCH", params.semitones)
  -- Without UpdateArrange the item properties dialog will not refresh until
  -- the user clicks somewhere. Cheap and idempotent; call it.
  reaper.UpdateArrange()

  return { changed_ids = { get_item_guid_ref(item) } }
end

return M
