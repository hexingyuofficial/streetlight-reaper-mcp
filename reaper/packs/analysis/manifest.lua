-- Analysis pack manifest.
--
-- Enable explicitly:
--   STREETLIGHT_ENABLED_PACKS=core,analysis
-- or, in REAPER before loading the bridge:
--   _G.STREETLIGHT_ENABLED_PACKS = "core,analysis"

local PACK_DIR = (function()
  local src = debug.getinfo(1, "S").source
  if src:sub(1, 1) == "@" then src = src:sub(2) end
  return src:match("(.*/)") or "./"
end)()

local analysis_templates = dofile(PACK_DIR .. "templates/analysis.lua")

return {
  name = "analysis",
  version = "0.1.0",
  templates = {
    item_audio_analyze = {
      handler     = analysis_templates.item_audio_analyze,
      undoable    = false,
      entity_kind = "artifact",
      artifact = {
        kind = "json",
        scope = "analysis",
        ref_prefix = "artifact:analysis:analysis:",
        read_scope = "artifact",
        updates_last_result = false,
        schema = "openreaper.analysis.item_audio.v1",
      },
    },
  },
}
