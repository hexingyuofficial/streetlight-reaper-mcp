-- Delivery pack manifest.
--
-- Enable explicitly:
--   STREETLIGHT_ENABLED_PACKS=core,delivery
-- or, in REAPER before loading the bridge:
--   _G.STREETLIGHT_ENABLED_PACKS = "core,delivery"

local PACK_DIR = (function()
  local src = debug.getinfo(1, "S").source
  if src:sub(1, 1) == "@" then src = src:sub(2) end
  return src:match("(.*/)") or "./"
end)()

local delivery_templates = dofile(PACK_DIR .. "templates/delivery.lua")

return {
  name = "delivery",
  version = "0.1.0",
  templates = {
    delivery_plan = {
      handler     = delivery_templates.delivery_plan,
      undoable    = false,
      entity_kind = "artifact",
      artifact = {
        kind = "json",
        scope = "plan",
        ref_prefix = "artifact:delivery:plan:",
        read_scope = "artifact",
        updates_last_result = false,
        schema = "openreaper.delivery_plan.v1",
      },
    },
    delivery_report = {
      handler     = delivery_templates.delivery_report,
      undoable    = false,
      entity_kind = "artifact",
      artifact = {
        kind = "json",
        scope = "report",
        ref_prefix = "artifact:delivery:report:",
        read_scope = "artifact",
        updates_last_result = false,
        schema = "openreaper.delivery_report.v1",
      },
    },
  },
}
