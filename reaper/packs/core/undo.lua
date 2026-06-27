-- undo.lua — REAPER undo-block wrapper for mutating templates.
--
-- The whole point is: even if the handler errors mid-mutation,
-- `Undo_EndBlock2` MUST run. Otherwise REAPER's undo state gets stuck open
-- and the next session-saved project file is corrupt-ish (undo nesting
-- silently breaks subsequent undo grouping). pcall is non-negotiable here.

local M = {}

-- REAPER UNDO_STATE_* bit flags (mirrored from reaper-cmd-undo headers):
--   UNDO_STATE_ALL          = -1
--   UNDO_STATE_TRACKCFG     =  1
--   UNDO_STATE_FX           =  2
--   UNDO_STATE_ITEMS        =  4
--   UNDO_STATE_MISCCFG      =  8
--   UNDO_STATE_FREEZE       = 16
M.UNDO_STATE_TRACKCFG = 1
M.UNDO_STATE_FX       = 2
M.UNDO_STATE_ITEMS    = 4
M.UNDO_STATE_MISCCFG  = 8

-- with_undo(label, flags, fn)
--   label : Streetlight-prefixed string the user sees in REAPER's undo history
--   flags : UNDO_STATE_* bitmask describing what was changed
--   fn    : zero-arg function that performs the mutation and returns a value
--
-- Returns (ok, result_or_err). On the error path, `result_or_err` is whatever
-- the handler raised — it can be a string OR a table (we use tables to carry
-- typed error codes; see templates/item.lua). The caller (dispatcher) is
-- responsible for translating that into an error envelope.
function M.with_undo(label, flags, fn)
  reaper.Undo_BeginBlock()
  local ok, result_or_err = pcall(fn)
  -- EndBlock2 always runs. The label/flag describe the intended mutation;
  -- REAPER will collapse to a no-op undo step on the error path if nothing
  -- actually changed.
  reaper.Undo_EndBlock2(0, label, flags)
  return ok, result_or_err
end

return M
