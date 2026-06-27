-- refs.lua — reference resolution for Streetlight templates.
--
-- The TS side (`packages/core/src/refs.ts`) parses references into a tagged
-- union; the bridge actually resolves them against REAPER state. Step 3 only
-- ships `selected:N` and `guid:{...}` resolvers. `last_result:item:N` and
-- `track:Name/item:N` come in Step 4 (read side) — the dispatcher already
-- updates the `last_result` table on every successful mutating command, so
-- there is nothing to backfill once those parsers land.
--
-- Return convention: handlers expect either
--   (item, nil)               — success
--   (nil, error_code, msg)    — typed failure; bubbles to dispatcher
--
-- Error codes match packages/core/src/errors.ts. Strings only — no objects.

local M = {}

local function parse_selected_index(s)
  -- "selected:N" where N is a non-negative integer.
  local n = s:match("^selected:(%d+)$")
  if not n then return nil end
  return tonumber(n)
end

local function parse_guid_ref(s)
  -- "guid:{...}" — keep the braces, they're part of REAPER's GUID format.
  local g = s:match("^guid:(%b{})$")
  if not g then return nil end
  return g
end

local function resolve_selected(index)
  local total = reaper.CountSelectedMediaItems(0)
  if index < 0 or index >= total then
    return nil,
      "ITEM_NOT_FOUND",
      "selected:" .. tostring(index) .. " out of range (selection has "
        .. total .. " item" .. (total == 1 and "" or "s") .. ")"
  end
  local item = reaper.GetSelectedMediaItem(0, index)
  if not item then
    return nil,
      "ITEM_NOT_FOUND",
      "REAPER returned nil for selected:" .. tostring(index)
  end
  return item, nil
end

local function resolve_guid(guid)
  -- Linear scan: O(items in project). REAPER 7 exposes no faster API for
  -- GUID lookup. Profiling has not flagged this yet; revisit if it does.
  local count = reaper.CountMediaItems(0)
  for i = 0, count - 1 do
    local item = reaper.GetMediaItem(0, i)
    local _, this_guid = reaper.GetSetMediaItemInfo_String(item, "GUID", "", false)
    if this_guid == guid then
      return item, nil
    end
  end
  return nil, "ITEM_NOT_FOUND", "No item with GUID " .. tostring(guid)
end

-- Resolve a logical item reference to a REAPER MediaItem handle.
--
-- The `last_result` arg is the dispatcher's per-session memory of the most
-- recent mutating command's outputs. Step 3 does not yet read it (only the
-- TS side parses `last_result:item:N` as a valid ref kind; the bridge
-- replies REF_INVALID for now). Passing it through keeps the call site
-- stable for Step 4.
function M.resolve_item(ref, _last_result)
  if type(ref) ~= "string" or ref == "" then
    return nil, "REF_INVALID", "Item reference must be a non-empty string"
  end

  local sel_idx = parse_selected_index(ref)
  if sel_idx ~= nil then return resolve_selected(sel_idx) end

  local guid = parse_guid_ref(ref)
  if guid ~= nil then return resolve_guid(guid) end

  -- Step 4 will recognize `last_result:item:N` and `track:Name/item:N`.
  -- Until then they parse on the TS side but fail here, by design.
  if ref:match("^last_result:") or ref:match("^track:") then
    return nil,
      "REF_INVALID",
      "Reference kind not implemented in v0.1 Step 3: " .. ref
  end

  return nil, "REF_INVALID", "Unrecognized item reference: " .. ref
end

return M
