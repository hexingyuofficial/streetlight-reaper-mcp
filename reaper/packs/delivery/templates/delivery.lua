-- Delivery pack templates.
--
-- Slice 24 is read-only: create a delivery plan artifact for one expected
-- WAV, then validate the file system into a pass/fail report artifact.
-- It deliberately does not render, master, upload, or mutate REAPER.

local M = {}

local PACK_DIR = (function()
  local src = debug.getinfo(1, "S").source
  if src:sub(1, 1) == "@" then src = src:sub(2) end
  local templates_dir = src:match("(.*/)") or "./"
  return templates_dir:gsub("templates/$", "")
end)()

local names = dofile(PACK_DIR .. "../core/lib/names.lua")

local PLAN_SCHEMA = "openreaper.delivery_plan.v1"
local REPORT_SCHEMA = "openreaper.delivery_report.v1"
local WAV_HEADER_BYTES = 12
local HASH_MOD = 4294967296

local function raise(code, message, recoverable)
  error({ code = code, message = message, recoverable = recoverable })
end

local function round6(value)
  if type(value) ~= "number" then return 0 end
  return math.floor(value * 1000000 + 0.5) / 1000000
end

local function path_join(dir, leaf)
  local last = dir:sub(-1)
  if last == "/" or last == "\\" then return dir .. leaf end
  return dir .. "/" .. leaf
end

local function dir_appears_to_exist(path)
  return reaper.EnumerateFiles(path, 0) ~= nil
      or reaper.EnumerateSubdirectories(path, 0) ~= nil
end

local function validate_output_dir(output_dir, errs)
  local MAX_PROBE_ATTEMPTS = 5
  for attempt = 1, MAX_PROBE_ATTEMPTS do
    local probe = path_join(
      output_dir,
      ".openreaper_delivery_probe_" .. tostring(reaper.time_precise())
        .. "_" .. tostring(attempt))
    if not reaper.file_exists(probe) then
      local f = io.open(probe, "w")
      if f then
        f:close()
        os.remove(probe)
        return
      end
      break
    end
  end

  if reaper.file_exists(output_dir) or dir_appears_to_exist(output_dir) then
    raise(errs.OUTPUT_DIR_NOT_WRITABLE,
      "Could not write probe file into output_dir (regular file, "
        .. "permissions, or other): " .. output_dir)
  end
  raise(errs.OUTPUT_DIR_MISSING,
    "output_dir does not exist: " .. output_dir)
end

local function file_exists(path)
  local f = io.open(path, "rb")
  if f then f:close(); return true end
  return false
end

local function file_size(path)
  local f = io.open(path, "rb")
  if not f then return nil end
  local size = f:seek("end")
  f:close()
  return size
end

local function read_wav_header(path)
  local f = io.open(path, "rb")
  if not f then return nil end
  local header = f:read(WAV_HEADER_BYTES)
  f:close()
  return header
end

local function sniff_wav_header(path)
  local header = read_wav_header(path)
  if type(header) ~= "string" or #header < WAV_HEADER_BYTES then
    return false, "file is shorter than a WAV header"
  end
  if header:sub(1, 4) ~= "RIFF" or header:sub(9, 12) ~= "WAVE" then
    return false, "file does not start with RIFF/WAVE"
  end
  return true, nil
end

local function hash_string(text)
  local h = 2166136261
  for i = 1, #text do
    h = (h * 131 + text:byte(i)) % HASH_MOD
  end
  return string.format("%08x", math.floor(h))
end

local function project_length()
  local length = reaper.GetProjectLength(0)
  if type(length) ~= "number" then return 0 end
  return round6(length)
end

local function count_regions()
  local count = 0
  local i = 0
  while true do
    local retval, isrgn = reaper.EnumProjectMarkers3(0, i)
    if retval == 0 then break end
    if isrgn then count = count + 1 end
    i = i + 1
  end
  return count
end

local function track_project_compact_hash()
  local parts = {}
  local track_count = reaper.CountTracks(0)
  parts[#parts + 1] = "tracks=" .. tostring(track_count)
  for i = 0, track_count - 1 do
    local track = reaper.GetTrack(0, i)
    if track then
      local _, guid = reaper.GetSetMediaTrackInfo_String(track, "GUID", "", false)
      local _, name = reaper.GetSetMediaTrackInfo_String(track, "P_NAME", "", false)
      parts[#parts + 1] = table.concat({
        tostring(i),
        tostring(guid or ""),
        tostring(name or ""),
        tostring(reaper.CountTrackMediaItems(track) or 0),
        tostring(reaper.GetMediaTrackInfo_Value(track, "I_FOLDERDEPTH") or 0),
        reaper.GetMediaTrackInfo_Value(track, "B_MUTE") ~= 0 and "m" or "",
        reaper.GetMediaTrackInfo_Value(track, "I_SOLO") ~= 0 and "s" or "",
        reaper.GetMediaTrackInfo_Value(track, "I_RECARM") ~= 0 and "r" or "",
      }, "|")
    end
  end
  return track_count, hash_string(table.concat(parts, ";"))
end

local function build_fingerprint(region, output_dir, expected_filename)
  local region_count = count_regions()
  local length_seconds = project_length()
  local track_count, track_project_hash = track_project_compact_hash()
  local source = table.concat({
    "region=" .. tostring(region.name),
    "start=" .. string.format("%.6f", round6(region.pos)),
    "end=" .. string.format("%.6f", round6(region.rgnend)),
    "output_dir=" .. tostring(output_dir),
    "filename=" .. tostring(expected_filename),
    "regions=" .. tostring(region_count),
    "project=" .. string.format("%.6f", length_seconds),
    "tracks=" .. tostring(track_count),
    "track_project_hash=" .. tostring(track_project_hash),
  }, ";")
  return {
    value = "delivery:" .. hash_string(source),
    basis = {
      region_name = region.name,
      region_start = round6(region.pos),
      region_end = round6(region.rgnend),
      region_count = region_count,
      project_length_seconds = length_seconds,
      track_count = track_count,
      track_project_hash = track_project_hash,
      output_dir = output_dir,
      expected_filename = expected_filename,
    },
  }
end

local function ensure_artifacts(ctx)
  if not ctx.artifacts then
    raise(ctx.errs.INTERNAL_ERROR, "Artifact helper was not provided to template context", false)
  end
end

local function validate_region(region, errs)
  local ok, msg = names.validate_region_name(region.name)
  if not ok then raise(errs.REGION_NAME_INVALID, msg) end
end

local function resolve_region(region_id, ctx)
  local region, code, msg = ctx.refs.resolve_region(region_id, ctx.last_result)
  if not region then
    raise(code or ctx.errs.REGION_NOT_FOUND, msg or "Region not found")
  end
  validate_region(region, ctx.errs)
  return region
end

local function read_plan_artifact(plan_ref, ctx)
  local read = ctx.artifacts:read(plan_ref, "payload")
  if not read or read.ok ~= true then
    local e = read and read.error or nil
    raise(
      (e and e.code) or ctx.errs.ARTIFACT_INVALID,
      (e and e.message) or ("Could not read delivery plan artifact: " .. tostring(plan_ref)),
      e and e.recoverable
    )
  end

  local artifact = read.result and read.result.artifact
  if type(artifact) ~= "table"
      or artifact.owner_pack ~= "delivery"
      or artifact.scope ~= "plan"
      or artifact.schema ~= PLAN_SCHEMA
      or type(artifact.payload) ~= "table" then
    raise(ctx.errs.ARTIFACT_INVALID,
      "Artifact is not an openreaper.delivery_plan.v1 plan: " .. tostring(plan_ref))
  end
  return artifact
end

local function validate_plan_payload(plan, plan_ref, errs)
  if type(plan) ~= "table"
      or plan.schema ~= PLAN_SCHEMA
      or type(plan.region) ~= "table"
      or type(plan.region.name) ~= "string"
      or plan.region.name == ""
      or type(plan.region.start) ~= "number"
      or type(plan.region["end"]) ~= "number"
      or type(plan.output) ~= "table"
      or type(plan.output.output_dir) ~= "string"
      or plan.output.output_dir == ""
      or type(plan.output.expected_filename) ~= "string"
      or plan.output.expected_filename == ""
      or type(plan.output.expected_path) ~= "string"
      or plan.output.expected_path == ""
      or type(plan.fingerprint) ~= "table"
      or type(plan.fingerprint.value) ~= "string"
      or plan.fingerprint.value == "" then
    raise(errs.ARTIFACT_INVALID,
      "Delivery plan payload is invalid: " .. tostring(plan_ref))
  end
  local name_ok, name_msg = names.validate_region_name(plan.region.name)
  if not name_ok then
    raise(errs.ARTIFACT_INVALID,
      "Delivery plan payload has invalid region name: " .. tostring(name_msg))
  end
end

local function make_check(name, ok, message)
  return {
    name = name,
    ok = ok and true or false,
    message = message or (ok and "ok" or "failed"),
  }
end

local function check_stale(plan, ctx)
  local region, code, msg = ctx.refs.resolve_region("region:" .. plan.region.name, ctx.last_result)
  if not region then
    return false, msg or code or "planned region is no longer resolvable", nil
  end

  local fingerprint = build_fingerprint(region, plan.output.output_dir, plan.output.expected_filename)
  if fingerprint.value ~= plan.fingerprint.value then
    return false, "current project state does not match delivery plan fingerprint", fingerprint
  end
  return true, "ok", fingerprint
end

local function summarize_checks(checks)
  local passed = 0
  for _, check in ipairs(checks) do
    if check.ok then passed = passed + 1 end
  end
  return passed, #checks
end

local function all_checks_ok(checks)
  for _, check in ipairs(checks) do
    if not check.ok then return false end
  end
  return true
end

function M.delivery_plan(params, ctx)
  local errs = ctx.errs
  ensure_artifacts(ctx)

  local region = resolve_region(params.region_id, ctx)
  validate_output_dir(params.output_dir, errs)

  local expected_filename = region.name .. ".wav"
  local expected_path = path_join(params.output_dir, expected_filename)
  local fingerprint = build_fingerprint(region, params.output_dir, expected_filename)

  local provenance = nil
  if params.cleanup_plan_ref or params.cleanup_fingerprint then
    provenance = {
      cleanup_plan_ref = params.cleanup_plan_ref,
      cleanup_fingerprint = params.cleanup_fingerprint,
      dereferenced = false,
    }
  end

  local ref = ctx.artifacts:write_json({
    owner_pack = "delivery",
    scope = "plan",
    producer_template = "delivery_plan",
    schema = PLAN_SCHEMA,
    command_id = ctx.command_id,
    summary = {
      schema = PLAN_SCHEMA,
      region_name = region.name,
      expected_filename = expected_filename,
      expected_path = expected_path,
      output_dir = params.output_dir,
      fingerprint = fingerprint.value,
    },
    payload = {
      schema = PLAN_SCHEMA,
      inputs = {
        region_id = params.region_id,
        output_dir = params.output_dir,
      },
      region = {
        name = region.name,
        start = round6(region.pos),
        ["end"] = round6(region.rgnend),
      },
      output = {
        output_dir = params.output_dir,
        expected_filename = expected_filename,
        expected_path = expected_path,
        extension = ".wav",
        producer_template = "render_region",
      },
      fingerprint = fingerprint,
      provenance = provenance,
      deferred = {
        loudness = "deferred",
        mastering = "deferred",
        multi_format = "deferred",
        upload = "deferred",
      },
    },
  })

  return { changed_ids = { ref } }
end

function M.delivery_report(params, ctx)
  ensure_artifacts(ctx)

  local plan_artifact = read_plan_artifact(params.delivery_plan_ref, ctx)
  local plan = plan_artifact.payload
  validate_plan_payload(plan, params.delivery_plan_ref, ctx.errs)
  local output = plan.output
  local expected_path = output.expected_path
  local expected_filename = output.expected_filename

  local checks = {}

  local stale_ok, stale_msg, current_fingerprint = check_stale(plan, ctx)
  checks[#checks + 1] = make_check("plan_fresh", stale_ok, stale_msg)

  local file_present = type(expected_path) == "string" and file_exists(expected_path)
  checks[#checks + 1] = make_check(
    "expected_file_exists",
    file_present,
    file_present and "ok" or ("expected file not found: " .. tostring(expected_path))
  )

  local size = file_present and file_size(expected_path) or nil
  checks[#checks + 1] = make_check(
    "expected_file_nonempty",
    type(size) == "number" and size > 0,
    (type(size) == "number" and size > 0) and "ok" or "expected WAV is empty or unreadable"
  )

  local filename_ok = type(expected_filename) == "string"
    and type(expected_path) == "string"
    and expected_path:sub(-#expected_filename) == expected_filename
  checks[#checks + 1] = make_check(
    "filename_matches_plan",
    filename_ok,
    filename_ok and "ok" or "expected path does not end with planned filename"
  )

  local ext_ok = type(expected_path) == "string" and expected_path:sub(-4):lower() == ".wav"
  checks[#checks + 1] = make_check(
    "extension_wav",
    ext_ok,
    ext_ok and "ok" or "expected path is not a .wav file"
  )

  local wav_ok, wav_msg = false, "expected file not found"
  if file_present then wav_ok, wav_msg = sniff_wav_header(expected_path) end
  checks[#checks + 1] = make_check("wav_header", wav_ok, wav_msg)

  local sidecar_rpp = type(expected_path) == "string" and (expected_path .. ".RPP") or ""
  local sidecar_bak = type(expected_path) == "string" and (expected_path .. ".RPP-bak") or ""
  local no_sidecar = not file_exists(sidecar_rpp) and not file_exists(sidecar_bak)
  checks[#checks + 1] = make_check(
    "no_reaper_sidecars",
    no_sidecar,
    no_sidecar and "ok" or "REAPER sidecar found next to WAV"
  )

  local passed, total = summarize_checks(checks)
  local overall_status = (all_checks_ok(checks) and "pass") or "fail"

  local ref = ctx.artifacts:write_json({
    owner_pack = "delivery",
    scope = "report",
    producer_template = "delivery_report",
    schema = REPORT_SCHEMA,
    command_id = ctx.command_id,
    summary = {
      schema = REPORT_SCHEMA,
      overall_status = overall_status,
      passed = passed,
      total = total,
      expected_path = expected_path,
      plan_ref = params.delivery_plan_ref,
    },
    payload = {
      schema = REPORT_SCHEMA,
      plan_ref = params.delivery_plan_ref,
      plan = {
        ref = plan_artifact.ref,
        created_at = plan_artifact.created_at,
        fingerprint = plan.fingerprint,
      },
      current_fingerprint = current_fingerprint,
      file = {
        expected_path = expected_path,
        expected_filename = expected_filename,
        exists = file_present,
        size_bytes = size,
      },
      checks = checks,
      overall_status = overall_status,
      deferred = {
        loudness = "deferred",
        mastering = "deferred",
        multi_format = "deferred",
        upload = "deferred",
      },
    },
  })

  return { changed_ids = { ref } }
end

return M
