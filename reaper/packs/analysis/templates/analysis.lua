-- Analysis pack templates.
--
-- Slice 25 gives agents a bounded, factual "ear" for in-project audio
-- items. It writes compact JSON artifacts and deliberately does not mutate
-- REAPER, create loop candidates, run arbitrary analyzers, or call external
-- tools.

local M = {}

local SCHEMA = "openreaper.analysis.item_audio.v1"
local MAX_RANGE_SECONDS = 120
local MAX_SILENCE_SEGMENTS = 200
local MAX_ARTIFACT_JSON_BYTES = 49152
local DEFAULT_SAMPLE_RATE = 44100
local BLOCK_SAMPLES = 4096
local SILENCE_THRESHOLD = 0.0001 -- -80 dBFS amplitude.
local EPSILON = 0.000000000001

local function raise(code, message, recoverable)
  error({ code = code, message = message, recoverable = recoverable })
end

local function round6(value)
  if type(value) ~= "number" then return 0 end
  return math.floor(value * 1000000 + 0.5) / 1000000
end

local function round3(value)
  if type(value) ~= "number" then return 0 end
  return math.floor(value * 1000 + 0.5) / 1000
end

local function dbfs(value)
  if type(value) ~= "number" or value <= 0 then return -120 end
  local db = 20 * (math.log(value) / math.log(10))
  if db < -120 then return -120 end
  return round3(db)
end

local function ensure_artifacts(ctx)
  if not ctx.artifacts then
    raise(ctx.errs.INTERNAL_ERROR, "Artifact helper was not provided to template context", false)
  end
end

local function item_guid_ref(item, errs)
  local _, guid = reaper.GetSetMediaItemInfo_String(item, "GUID", "", false)
  if not guid or guid == "" then
    raise(errs.INTERNAL_ERROR, "REAPER returned no GUID for analyzed item", false)
  end
  return "guid:" .. guid
end

local function take_name(take)
  if not take then return "" end
  if type(reaper.GetTakeName) ~= "function" then return "" end
  return reaper.GetTakeName(take) or ""
end

local function source_name(take)
  local source = take and reaper.GetMediaItemTake_Source(take)
  if not source then return "" end
  if type(reaper.GetMediaSourceFileName) ~= "function" then return "" end
  local ok, first, second = pcall(reaper.GetMediaSourceFileName, source, "")
  if not ok then return "" end
  if type(second) == "string" then return second end
  if type(first) == "string" then return first end
  return ""
end

local function file_readable(path)
  if type(path) ~= "string" or path == "" then return false end
  local f = io.open(path, "rb")
  if not f then return false end
  f:close()
  return true
end

local function source_available(take)
  local source = take and reaper.GetMediaItemTake_Source(take)
  if not source then return false end
  if type(reaper.GetMediaSourceLength) == "function" then
    local ok, length = pcall(reaper.GetMediaSourceLength, source)
    if ok and type(length) == "number" and length <= 0 then return false end
  end
  local name = source_name(take)
  if name ~= "" and not file_readable(name) then return false end
  return true
end

local function normalize_features(features)
  local out = {}
  local seen = {}
  for i = 1, #features do
    local feature = features[i]
    if not seen[feature] then
      out[#out + 1] = feature
      seen[feature] = true
    end
  end
  return out
end

local function has_feature(features, name)
  for i = 1, #features do
    if features[i] == name then return true end
  end
  return false
end

local function resolve_item(params, ctx)
  local item, code, msg = ctx.refs.resolve_item(params.item_id, ctx.last_result)
  if not item then
    raise(code or ctx.errs.ITEM_NOT_FOUND, msg or "Item not found")
  end
  return item
end

local function analysis_window(params, item, errs)
  local item_pos = reaper.GetMediaItemInfo_Value(item, "D_POSITION") or 0
  local item_len = reaper.GetMediaItemInfo_Value(item, "D_LENGTH") or 0
  if item_len <= 0 then
    raise(errs.ANALYSIS_FAILED, "Item length must be greater than zero", true)
  end

  local local_start = 0
  local local_end = item_len
  if type(params.time_range) == "table" then
    local_start = params.time_range.start or 0
    local_end = params.time_range["end"] or item_len
  end

  if local_start < 0 or local_end <= local_start then
    raise(errs.PARAMS_INVALID, "time_range must be within the item and end > start", true)
  end
  if local_end > item_len then
    raise(errs.PARAMS_INVALID, "time_range.end exceeds item length", true)
  end

  local duration = local_end - local_start
  if duration > MAX_RANGE_SECONDS then
    raise(
      errs.PARAMS_INVALID,
      "analysis time_range exceeds " .. tostring(MAX_RANGE_SECONDS) .. " seconds",
      true
    )
  end

  return {
    item_position = item_pos,
    item_length = item_len,
    local_start = local_start,
    local_end = local_end,
    project_start = item_pos + local_start,
    project_end = item_pos + local_end,
    duration = duration,
  }
end

local function ensure_accessor_api(errs)
  if type(reaper.CreateTakeAudioAccessor) ~= "function"
      or type(reaper.DestroyAudioAccessor) ~= "function"
      or type(reaper.GetAudioAccessorSamples) ~= "function" then
    raise(errs.ANALYSIS_FAILED, "REAPER PCM accessor API is unavailable", false)
  end
end

local function close_silence_segment(state, end_time)
  if not state.silence_open then return end
  local segment = {
    start = round6(state.silence_start),
    ["end"] = round6(end_time),
    duration = round6(end_time - state.silence_start),
  }
  state.total_silence_seconds = state.total_silence_seconds + segment.duration
  if #state.silence_segments < MAX_SILENCE_SEGMENTS then
    state.silence_segments[#state.silence_segments + 1] = segment
  else
    state.silence_truncated = true
  end
  state.silence_open = false
  state.silence_start = nil
end

local function scan_audio(take, window, features, errs)
  ensure_accessor_api(errs)

  local sample_rate = DEFAULT_SAMPLE_RATE
  local channels = 2
  local accessor = reaper.CreateTakeAudioAccessor(take)
  if not accessor then
    raise(errs.AUDIO_SOURCE_OFFLINE, "Could not create audio accessor for take", true)
  end

  local state = {
    sample_frames = 0,
    sample_values = 0,
    sum_squares = 0,
    abs_peak = 0,
    positive_peak = 0,
    negative_peak = 0,
    silence_segments = {},
    silence_open = false,
    silence_start = nil,
    silence_truncated = false,
    total_silence_seconds = 0,
  }

  local ok, err_obj = pcall(function()
    local cursor = window.project_start
    while cursor < window.project_end - EPSILON do
      local remaining = window.project_end - cursor
      local frames = math.min(BLOCK_SAMPLES, math.max(1, math.ceil(remaining * sample_rate)))
      local request_duration = frames / sample_rate
      if cursor + request_duration > window.project_end then
        frames = math.max(1, math.floor((window.project_end - cursor) * sample_rate + 0.5))
        request_duration = frames / sample_rate
      end

      local buffer = reaper.new_array(frames * channels)
      local retval = reaper.GetAudioAccessorSamples(
        accessor,
        sample_rate,
        channels,
        cursor,
        frames,
        buffer
      )
      if retval == -1 then
        raise(errs.AUDIO_SOURCE_OFFLINE, "REAPER audio accessor returned an error", true)
      end

      if retval == 0 then
        close_silence_segment(state, cursor)
      else
        local block_peak = 0
        local values = frames * channels
        for i = 1, values do
          local value = buffer[i] or 0
          local abs_value = math.abs(value)
          state.sum_squares = state.sum_squares + value * value
          state.sample_values = state.sample_values + 1
          if abs_value > state.abs_peak then state.abs_peak = abs_value end
          if value > state.positive_peak then state.positive_peak = value end
          if value < state.negative_peak then state.negative_peak = value end
          if abs_value > block_peak then block_peak = abs_value end
        end
        state.sample_frames = state.sample_frames + frames

        if has_feature(features, "silence") then
          local block_start_local = cursor - window.project_start + window.local_start
          local block_end_local = math.min(window.local_end, block_start_local + request_duration)
          if block_peak <= SILENCE_THRESHOLD then
            if not state.silence_open then
              state.silence_open = true
              state.silence_start = block_start_local
            end
          else
            close_silence_segment(state, block_start_local)
          end
          if cursor + request_duration >= window.project_end - EPSILON then
            close_silence_segment(state, block_end_local)
          end
        end
      end

      cursor = cursor + request_duration
    end
  end)

  reaper.DestroyAudioAccessor(accessor)

  if not ok then error(err_obj) end
  if state.sample_values == 0 then
    raise(errs.AUDIO_SOURCE_OFFLINE, "No audio samples were available for analysis", true)
  end

  return state
end

local function build_feature_payload(scan, window, features, ctx)
  local computed = {}
  local payload = {}
  local summary = {}

  if has_feature(features, "loudness") then
    local rms = math.sqrt(scan.sum_squares / math.max(1, scan.sample_values))
    computed[#computed + 1] = "loudness"
    payload.loudness = {
      type = "rms_dbfs",
      rms_linear = round6(rms),
      rms_dbfs = dbfs(rms),
      note = "RMS dBFS, not LUFS",
    }
    summary.rms_dbfs = payload.loudness.rms_dbfs
  end

  if has_feature(features, "peaks") then
    computed[#computed + 1] = "peaks"
    payload.peaks = {
      type = "sample_peak",
      abs_peak_linear = round6(scan.abs_peak),
      abs_peak_dbfs = dbfs(scan.abs_peak),
      positive_peak_linear = round6(scan.positive_peak),
      negative_peak_linear = round6(scan.negative_peak),
      note = "Sample peak, not true peak",
    }
    summary.peak_dbfs = payload.peaks.abs_peak_dbfs
  end

  if has_feature(features, "silence") then
    computed[#computed + 1] = "silence"
    payload.silence = {
      threshold_linear = SILENCE_THRESHOLD,
      threshold_dbfs = dbfs(SILENCE_THRESHOLD),
      total_silence_seconds = round6(scan.total_silence_seconds),
      segments = ctx.json.array(scan.silence_segments),
      segment_count = #scan.silence_segments,
      truncated = scan.silence_truncated,
      cap = MAX_SILENCE_SEGMENTS,
    }
    summary.silence_count = #scan.silence_segments
    summary.silence_truncated = scan.silence_truncated
  end

  summary.computed_features = ctx.json.array(computed)
  summary.duration_seconds = round6(window.duration)
  summary.sample_frames = scan.sample_frames

  return summary, payload
end

local function write_analysis_artifact(ctx, summary, payload)
  local ok_encode, encoded_or_err = pcall(ctx.json.encode, {
    schema = SCHEMA,
    summary = summary,
    payload = payload,
  })
  if not ok_encode then
    raise(
      ctx.errs.ANALYSIS_FAILED,
      "Could not encode analysis artifact preflight: " .. tostring(encoded_or_err),
      false
    )
  end
  if #encoded_or_err > MAX_ARTIFACT_JSON_BYTES then
    raise(
      ctx.errs.RESPONSE_TOO_LARGE,
      "Analysis artifact exceeds the 49152 byte write-side cap",
      true
    )
  end

  local ref = ctx.artifacts:write_json({
    owner_pack = "analysis",
    scope = "analysis",
    producer_template = "item_audio_analyze",
    schema = SCHEMA,
    command_id = ctx.command_id,
    summary = summary,
    payload = payload,
  })
  return ref
end

function M.item_audio_analyze(params, ctx)
  local errs = ctx.errs
  ensure_artifacts(ctx)

  local item = resolve_item(params, ctx)
  local take = reaper.GetActiveTake(item)
  if not take then
    raise(errs.AUDIO_SOURCE_OFFLINE, "Item has no active take to analyze", true)
  end
  if not source_available(take) then
    raise(errs.AUDIO_SOURCE_OFFLINE, "Item source is offline or unavailable", true)
  end

  local features = normalize_features(params.features or { "loudness", "peaks", "silence" })
  local window = analysis_window(params, item, errs)
  local scan = scan_audio(take, window, features, errs)
  local feature_summary, feature_payload = build_feature_payload(scan, window, features, ctx)

  local payload = {
    schema = SCHEMA,
    source = {
      item_id = params.item_id,
      item_ref = item_guid_ref(item, errs),
      take_name = take_name(take),
      source_name = source_name(take),
    },
    time_range = {
      start = round6(window.local_start),
      ["end"] = round6(window.local_end),
      duration = round6(window.duration),
      project_start = round6(window.project_start),
      project_end = round6(window.project_end),
    },
    features = ctx.json.array(features),
    limits = {
      max_range_seconds = MAX_RANGE_SECONDS,
      max_silence_segments = MAX_SILENCE_SEGMENTS,
      max_artifact_json_bytes = MAX_ARTIFACT_JSON_BYTES,
      sample_rate = DEFAULT_SAMPLE_RATE,
      channels = 2,
      block_samples = BLOCK_SAMPLES,
    },
    loudness = feature_payload.loudness,
    peaks = feature_payload.peaks,
    silence = feature_payload.silence,
    warnings = ctx.json.array({
      "loudness is RMS dBFS, not LUFS",
      "peaks are sample peaks, not true peaks",
      "transients and loop_candidates are deferred",
    }),
  }

  local summary = {
    schema = SCHEMA,
    item_ref = payload.source.item_ref,
    duration_seconds = feature_summary.duration_seconds,
    computed_features = feature_summary.computed_features,
    rms_dbfs = feature_summary.rms_dbfs,
    peak_dbfs = feature_summary.peak_dbfs,
    silence_count = feature_summary.silence_count,
    silence_truncated = feature_summary.silence_truncated,
    sample_frames = feature_summary.sample_frames,
  }

  local ref = write_analysis_artifact(ctx, summary, payload)
  return { changed_ids = { ref } }
end

return M
