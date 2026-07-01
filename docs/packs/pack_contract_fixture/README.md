# Pack Contract Fixture

`pack_contract_fixture` is a test-only pack for Slice 20B. It proves that a
non-core pack can contribute:

- one TypeScript template definition,
- one Lua manifest entry and handler,
- one recipe directory,
- one docs namespace.

Enable it only for pack-contract verification:

```sh
STREETLIGHT_ENABLED_PACKS=core,pack_contract_fixture npm run check:manifest
STREETLIGHT_ENABLED_PACKS=core,pack_contract_fixture npm run check:template-authoring
```

For a live REAPER smoke, set this before loading `start_bridge.lua`:

```lua
_G.STREETLIGHT_ENABLED_PACKS = "core,pack_contract_fixture"
```

Then `list_templates` should include `fixture_track_rename`, and
`call_template fixture_track_rename` should rename a track using the same
track resolver and LAST_RESULT bucket as the core track templates.
