-- Fixture pack track templates.
--
-- This pack is not a user-facing feature. It exists to prove the Slice 20B
-- pack-loading contract without parking future domain capabilities in core.

local M = {}

local function raise(code, message)
  error({ code = code, message = message })
end

local function get_track_guid_ref(track, errs)
  local _, guid = reaper.GetSetMediaTrackInfo_String(track, "GUID", "", false)
  if not guid or guid == "" then
    raise(errs.INTERNAL_ERROR, "REAPER returned no GUID for the mutated track")
  end
  return "guid:" .. guid
end

function M.fixture_track_rename(params, ctx)
  local errs = ctx.errs
  local track, code, msg = ctx.refs.resolve_track(params.track_id, ctx.last_result)
  if not track then raise(code or errs.TRACK_NOT_FOUND, msg or "Track not found") end

  reaper.GetSetMediaTrackInfo_String(track, "P_NAME", params.name, true)
  reaper.TrackList_AdjustWindows(false)

  return { changed_ids = { get_track_guid_ref(track, errs) } }
end

return M
