-- lib/entity_buckets.lua — manifest-driven LAST_RESULT bucket helpers.
--
-- Pure Lua, no REAPER API. The bridge uses this module at startup so the
-- entity-kind routing table is derived from manifest.entity_buckets instead
-- of hard-coded inside finalize_template.

local M = {}

local LEGACY_BUCKETS = {
  item   = "items",
  track  = "tracks",
  region = "regions",
  render = "renders",
}

local function env_truthy_off(value)
  if value == nil or value == "" then return false end
  local lowered = string.lower(tostring(value))
  return lowered == "0"
    or lowered == "false"
    or lowered == "off"
    or lowered == "no"
end

function M.strict_manifest_enabled(env_value)
  -- Default ON. The env escape hatch is for local bring-up only; release
  -- builds should fail fast when a template declares an unknown entity_kind.
  return not env_truthy_off(env_value)
end

function M.build_entity_bucket_map(manifest, opts)
  opts = opts or {}
  local strict = opts.strict
  if strict == nil then strict = true end
  local log = opts.log or function(_) end
  local declared = manifest and manifest.entity_buckets
  local buckets = {}

  if type(declared) ~= "table" then
    if strict then
      error("manifest.entity_buckets is required when STREETLIGHT_STRICT_MANIFEST is on")
    end
    log("WARNING: manifest.entity_buckets missing; using legacy item/track/region/render buckets")
    declared = LEGACY_BUCKETS
  end

  for kind, bucket in pairs(declared) do
    if type(kind) == "string" and kind ~= "" and type(bucket) == "string" and bucket ~= "" then
      buckets[kind] = bucket
    elseif strict then
      error("manifest.entity_buckets contains an invalid entry")
    else
      log("WARNING: ignoring invalid entity_buckets entry '" .. tostring(kind) .. "'")
    end
  end

  for name, entry in pairs(manifest.templates or {}) do
    local kind = type(entry) == "table" and entry.entity_kind or nil
    if type(kind) ~= "string" or kind == "" or buckets[kind] == nil then
      local msg = "template '" .. tostring(name) .. "' declares unknown entity_kind '" .. tostring(kind) .. "'"
      if strict then error(msg) end
      log("WARNING: " .. msg .. "; runtime fallback will use 'items'")
    end
  end

  return buckets
end

function M.make_last_result(entity_buckets)
  local last = {}
  for _, bucket in pairs(entity_buckets) do
    last[bucket] = {}
  end
  return last
end

return M
