# Analysis Pack

The `analysis` pack is opt-in:

```sh
STREETLIGHT_ENABLED_PACKS=core,analysis
```

It gives agents bounded facts about audio already inside the REAPER
project. Slice 25 ships one template, `item_audio_analyze`, which writes
one JSON artifact:

```text
artifact:analysis:analysis:<id>
```

Read details through:

```json
{ "scope": "artifact", "artifact_ref": "...", "view": "summary" }
{ "scope": "artifact", "artifact_ref": "...", "view": "payload" }
```

## Template

`item_audio_analyze`

- params:
  `{ item_id, features?, time_range? }`
- default features:
  `["loudness", "peaks", "silence"]`
- schema:
  `openreaper.analysis.item_audio.v1`
- maximum analysis range:
  `120` item-local seconds
- maximum silence segments:
  `200`

## Important Definitions

- `loudness` is RMS dBFS, not LUFS.
- `peaks` are sample peaks, not true peaks.
- `silence` uses a simple amplitude threshold and is not a musical
  phrase detector.
- Analysis uses REAPER PCM accessors and reads pre-FX item/take audio.

## Explicitly Deferred

No transients, loop candidates, click-risk metrics, external sample
search, embeddings, AI generation, OpenAudio integration, MIDI, FX,
routing, or scene/recipe execution lives in this pack yet.
