-- verify.lua — structural before/after checks for mutating templates.
--
-- Slice 04 verified entity-count deltas. Slice 06 adds a deliberately small
-- field-level readback for four in-place templates. Slice 08 lets nullable
-- field descriptors coerce explicit json.null params to expected value 0.

local M = {}

function M.count_regions()
  local total = 0
  local i = 0
  while true do
    local retval, isrgn = reaper.EnumProjectMarkers3(0, i)
    if retval == 0 then break end
    if isrgn then total = total + 1 end
    i = i + 1
  end
  return total
end

function M.snapshot()
  return {
    items   = reaper.CountMediaItems(0),
    tracks  = reaper.CountTracks(0),
    regions = M.count_regions(),
  }
end

function M.diff(before, after)
  return {
    items   = after.items   - before.items,
    tracks  = after.tracks  - before.tracks,
    regions = after.regions - before.regions,
  }
end

local function entity_key(entity_kind)
  if entity_kind == "item" then return "items" end
  if entity_kind == "track" then return "tracks" end
  if entity_kind == "region" then return "regions" end
  return nil
end

function M.check(expected, changed_ids, delta, entity_kind, changed_count_override)
  if type(expected) ~= "table" then return "expected_delta must be an object" end
  if type(changed_ids) ~= "table" then changed_ids = {} end

  local changed_count = changed_count_override
  if type(changed_count) ~= "number" then changed_count = #changed_ids end
  local count = expected.count
  if count == "any" then
    if changed_count < 1 then return "changed_count=0 but expected >=1" end
  elseif type(count) == "number" then
    if changed_count ~= count then
      return ("changed_count=%d but expected=%d"):format(changed_count, count)
    end
  else
    return "expected_delta.count must be a number or 'any'"
  end

  local key = entity_key(entity_kind)
  if not key then
    return ("verify: unknown entity_kind=%s"):format(tostring(entity_kind))
  end
  local d = delta[key]
  if type(d) ~= "number" then
    return ("verify: missing delta_%s"):format(key)
  end

  local count_val = count == "any" and changed_count or count
  if expected.creates then
    if count == "any" then
      if d < count_val then
        return ("delta_%s=%d but expected >=%d (creates)"):format(key, d, count_val)
      end
    elseif d ~= count_val then
      return ("delta_%s=%d but expected +%d (creates)"):format(key, d, count_val)
    end
  elseif expected.maybeCreates then
    if d ~= 0 and d ~= count_val then
      return ("delta_%s=%d but expected 0 or +%d (maybeCreates)"):format(key, d, count_val)
    end
  elseif expected.deletes then
    if d ~= -count_val then
      return ("delta_%s=%d but expected -%d (deletes)"):format(key, d, count_val)
    end
  else
    if d ~= 0 then
      return ("delta_%s=%d but expected 0 (in-place)"):format(key, d)
    end
  end

  return nil
end

local function parse_guid_ref(ref)
  if type(ref) ~= "string" then return nil end
  return ref:match("^guid:(%b{})$")
end

local function find_item_by_guid(guid)
  local count = reaper.CountMediaItems(0)
  for i = 0, count - 1 do
    local item = reaper.GetMediaItem(0, i)
    local _, this_guid = reaper.GetSetMediaItemInfo_String(item, "GUID", "", false)
    if this_guid == guid then return item end
  end
  return nil
end

local function find_track_by_guid(guid)
  local count = reaper.CountTracks(0)
  for i = 0, count - 1 do
    local track = reaper.GetTrack(0, i)
    local _, this_guid = reaper.GetSetMediaTrackInfo_String(track, "GUID", "", false)
    if this_guid == guid then return track end
  end
  return nil
end

local function read_item_field(handle, field)
  return true, reaper.GetMediaItemInfo_Value(handle, field)
end

local function read_take_field(handle, field)
  local take = reaper.GetActiveTake(handle)
  if not take then return false, nil, "active take not found" end
  return true, reaper.GetMediaItemTakeInfo_Value(take, field)
end

local function read_track_field(handle, field)
  if field == "P_NAME" then
    local ok, value = reaper.GetSetMediaTrackInfo_String(handle, field, "", false)
    if ok == false then return false, nil, "track string field not found" end
    return true, value
  end
  return true, reaper.GetMediaTrackInfo_Value(handle, field)
end

local FIELD_READERS = {
  item  = { entity_kind = "item",  resolve = find_item_by_guid,  read = read_item_field },
  take  = { entity_kind = "item",  resolve = find_item_by_guid,  read = read_take_field },
  track = { entity_kind = "track", resolve = find_track_by_guid, read = read_track_field },
}

local function param_path(field)
  return field.param_path or field.paramPath
end

local function values_match(expected, actual, tolerance)
  if type(expected) == "number" and type(actual) == "number" and type(tolerance) == "number" then
    return math.abs(expected - actual) <= tolerance
  end
  return expected == actual
end

local function mismatch(field, expected, actual, tolerance)
  return {
    scope     = field.scope,
    field     = field.field,
    expected  = expected,
    actual    = actual,
    tolerance = tolerance,
    ok        = false,
  }
end

function M.check_fields(expected, changed_ids, params, entity_kind, ctx)
  if type(expected) ~= "table" or type(expected.fields) ~= "table" then
    return nil
  end
  if type(changed_ids) ~= "table" or type(changed_ids[1]) ~= "string" then
    return nil
  end

  local failures = {}
  local guid = parse_guid_ref(changed_ids[1])
  if not guid then
    failures[#failures + 1] = {
      scope = "unknown",
      field = "changed_ids[1]",
      expected = "guid:{...}",
      actual = tostring(changed_ids[1]),
      ok = false,
    }
    return "changed_ids[1] is not a guid ref", failures
  end

  for i = 1, #expected.fields do
    local field = expected.fields[i]
    local reader = type(field) == "table" and FIELD_READERS[field.scope] or nil
    if not reader then
      failures[#failures + 1] = mismatch(
        { scope = tostring(field and field.scope), field = tostring(field and field.field) },
        "supported scope",
        tostring(field and field.scope),
        nil
      )
    elseif reader.entity_kind ~= entity_kind then
      failures[#failures + 1] = mismatch(field, reader.entity_kind, entity_kind, nil)
    else
      local handle = reader.resolve(guid)
      if not handle then
        failures[#failures + 1] = mismatch(field, "existing " .. entity_kind, "not found", nil)
      else
        local key = param_path(field)
        local raw_value = type(params) == "table" and params[key] or nil
        local expected_value = raw_value
        local should_read = true
        if raw_value == nil and field.optional == true then
          -- The descriptor says "verify this only when the caller supplied
          -- the param". Used by item_trim.start_offset in Slice 07.
          should_read = false
        elseif raw_value == nil then
          failures[#failures + 1] = mismatch(field, "present param", nil, field.tolerance)
          should_read = false
        elseif ctx and ctx.json and raw_value == ctx.json.null then
          if field.nullable == true then
            expected_value = 0
          else
            failures[#failures + 1] = mismatch(field, "non-null param", "json.null", field.tolerance)
            should_read = false
          end
        end

        if should_read then
          local ok_read, actual_value, read_err = reader.read(handle, field.field)
          local tolerance = field.tolerance
          if not ok_read then
            failures[#failures + 1] = mismatch(field, expected_value, read_err or "read failed", tolerance)
          elseif not values_match(expected_value, actual_value, tolerance) then
            failures[#failures + 1] = mismatch(field, expected_value, actual_value, tolerance)
          end
        end
      end
    end
  end

  if #failures == 0 then return nil end

  local first = failures[1]
  local reason = tostring(first.scope) .. "." .. tostring(first.field)
    .. " expected " .. tostring(first.expected)
    .. ", actual " .. tostring(first.actual)
  return reason, failures
end

return M
