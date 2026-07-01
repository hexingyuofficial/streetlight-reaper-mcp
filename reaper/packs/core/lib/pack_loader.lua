-- lib/pack_loader.lua — repo-local static pack loading for the bridge.
--
-- Slice 20B keeps the contract intentionally small:
--   * enabled packs are static for a bridge lifetime;
--   * `core` is always required;
--   * manifests are loaded from reaper/packs/<pack>/manifest.lua;
--   * template names are globally unique across enabled packs;
--   * entity bucket declarations must agree across packs.

local M = {}

local PACK_ID_PATTERN = "^[a-z][a-z0-9_]*$"

local function split_csv(value)
  local out = {}
  for part in tostring(value):gmatch("[^,]+") do
    local trimmed = part:match("^%s*(.-)%s*$")
    if trimmed ~= "" then out[#out + 1] = trimmed end
  end
  return out
end

local function validate_pack_id(id)
  return type(id) == "string" and id:match(PACK_ID_PATTERN) ~= nil
end

function M.parse_enabled_packs(input)
  local packs = {}
  if type(input) == "table" then
    for i = 1, #input do packs[#packs + 1] = input[i] end
  elseif type(input) == "string" and input ~= "" then
    packs = split_csv(input)
  end

  if #packs == 0 then packs = { "core" } end

  local seen = {}
  local has_core = false
  for _, id in ipairs(packs) do
    if not validate_pack_id(id) then
      error("Invalid pack id: " .. tostring(id))
    end
    if seen[id] then
      error("Duplicate pack id: " .. tostring(id))
    end
    seen[id] = true
    if id == "core" then has_core = true end
  end
  if not has_core then
    error("Enabled packs must include core")
  end
  if packs[1] ~= "core" then
    error("Enabled packs must start with core")
  end

  return packs
end

local function merge_entity_bucket(combined, by_bucket, pack, kind, bucket)
  if type(kind) ~= "string" or kind == "" or type(bucket) ~= "string" or bucket == "" then
    error("Pack '" .. pack .. "' declares an invalid entity_buckets entry")
  end

  local existing_bucket = combined.entity_buckets[kind]
  if pack ~= "core" and existing_bucket == nil then
    error("Pack '" .. pack .. "' declares new entity_kind '" .. kind
      .. "'; Slice 20B non-core packs may only reuse core entity kinds")
  end
  if existing_bucket ~= nil and existing_bucket ~= bucket then
    error("Entity bucket conflict for kind '" .. kind .. "': "
      .. existing_bucket .. " vs " .. bucket .. " in pack '" .. pack .. "'")
  end

  local existing_kind = by_bucket[bucket]
  if existing_kind ~= nil and existing_kind ~= kind then
    error("Entity bucket name conflict for bucket '" .. bucket .. "': "
      .. existing_kind .. " vs " .. kind .. " in pack '" .. pack .. "'")
  end

  combined.entity_buckets[kind] = bucket
  by_bucket[bucket] = kind
end

function M.load_packs(script_dir, enabled_packs, opts)
  opts = opts or {}
  local log = opts.log or function(_) end
  local combined = {
    name = table.concat(enabled_packs, ","),
    version = "multi",
    entity_buckets = {},
    templates = {},
    packs = {},
  }
  local bucket_to_kind = {}

  for _, pack in ipairs(enabled_packs) do
    local manifest_path = script_dir .. "packs/" .. pack .. "/manifest.lua"
    local manifest = dofile(manifest_path)
    if type(manifest) ~= "table" then
      error("Pack '" .. pack .. "' manifest did not return a table")
    end
    if manifest.name ~= pack then
      error("Pack manifest name mismatch: expected '" .. pack .. "', got '" .. tostring(manifest.name) .. "'")
    end
    if type(manifest.version) ~= "string" or manifest.version == "" then
      error("Pack '" .. pack .. "' manifest must declare a version")
    end

    combined.packs[#combined.packs + 1] = {
      name = pack,
      version = manifest.version,
    }

    for kind, bucket in pairs(manifest.entity_buckets or {}) do
      merge_entity_bucket(combined, bucket_to_kind, pack, kind, bucket)
    end

    if type(manifest.templates) ~= "table" then
      error("Pack '" .. pack .. "' manifest.templates is required")
    end

    local count = 0
    for name, entry in pairs(manifest.templates) do
      if combined.templates[name] ~= nil then
        error("Duplicate template name '" .. name .. "' in pack '" .. pack .. "'")
      end
      if type(entry) ~= "table" then
        error("Template '" .. tostring(name) .. "' in pack '" .. pack .. "' is not a table")
      end
      entry.pack = pack
      combined.templates[name] = entry
      count = count + 1
    end

    log("loaded pack '" .. pack .. "' v" .. manifest.version .. " (" .. tostring(count) .. " templates)")
  end

  return combined
end

return M
