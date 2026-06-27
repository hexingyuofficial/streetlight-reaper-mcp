-- Streetlight core pack manifest.
--
-- The bridge dofile's this and uses the returned table to dispatch
-- `kind = "template"` commands. Templates are looked up by their
-- agent-facing name (matching the registration in
-- packages/mcp-server/src/templates/index.ts).
--
-- Entry shape:
--   handler    : function(params, ctx) -> { changed_ids = {...} } or raises
--   undoable   : whether to wrap the handler in undo.with_undo
--   undo_label : the string the user sees in REAPER's undo history
--   undo_flags : UNDO_STATE_* bitmask passed to Undo_EndBlock2
--
-- Path resolution: manifest figures out its own directory from
-- debug.getinfo and loads sibling template files itself, so the bridge
-- does not need to know the pack's internal layout.

local PACK_DIR = (function()
  local src = debug.getinfo(1, "S").source
  if src:sub(1, 1) == "@" then src = src:sub(2) end
  return src:match("(.*/)") or "./"
end)()

local undo = dofile(PACK_DIR .. "undo.lua")
local item_templates = dofile(PACK_DIR .. "templates/item.lua")

return {
  name = "core",
  version = "0.1.0",
  templates = {
    item_pitch = {
      handler    = item_templates.item_pitch,
      undoable   = true,
      undo_label = "Streetlight: item_pitch",
      undo_flags = undo.UNDO_STATE_ITEMS,
    },
  },
}
