# OpenReaper Public Story

This document is the living source for how to talk about OpenReaper in
public: README copy, demo scripts, Bilibili / YouTube descriptions, and
short social posts. Keep it accurate. Update it after major slices,
especially when a capability becomes live-smoked in REAPER.

Naming rule:

- Public project name: **OpenReaper**
- R&D / studio line: **developed by Streetlight Studio**
- Internal kernel / package code name: **Streetlight** for now
- Public phrasing when both matter:
  **OpenReaper, powered by the Streetlight kernel**

## One-Line Positioning

OpenReaper is an MCP bridge that lets AI agents operate REAPER through a
small, auditable set of tools, with typed references, locked result
envelopes, live REAPER smoke tests, and a verification loop that checks
whether the DAW actually changed the way the agent claimed. It is
developed by Streetlight Studio and powered by the Streetlight kernel.

Shorter:

> An AI-control layer for REAPER that is built like a verified automation
> kernel, not a pile of one-off scripts.

## What Is Actually Working Now

- A file-based MCP bridge between agents and REAPER.
- Fixed 5-tool MCP surface: `ping`, `get_state`, `call_template`,
  `list_templates`, and `list_recipes`.
- Template-driven write actions for tracks, items, media import,
  regions, and render.
- Multi-step recipe demo: build 8 impact variations, create regions,
  render WAVs, and keep the output directory clean of REAPER sidecars.
- Read scopes for project, tracks, regions, selection, and track FX
  projection.
- Typed references:
  `selected:N`, `guid:{...}`, `last_result:<kind>:N`, `track:Name`,
  and `region:Name`.
- Locked success envelope for mutating calls:
  `{ template, changed_count, changed_ids, truncated }`.
- Shared TS / Lua error-code discipline, including generated Lua
  constants and literal audits.
- Risk gate in `call_template`.
- Startup launcher / setup flow for easier install on another Mac.
- Kernel hardening through Slice 10: structural `expectedDelta`,
  field-level verification for the high-confidence item / track setters,
  optional / nullable field semantics, creates / maybeCreates boundaries,
  and real REAPER live smokes.

## The Big Difference

Most automation demos show that an agent can call a tool. OpenReaper is
trying to prove something stronger:

> The agent can call a tool, the bridge can predict what should change,
> REAPER can report what actually changed, and the bridge can reject the
> result if those do not match.

That is the core story. It is not "AI can click buttons." It is
"AI actions in a DAW can become inspectable, bounded, and testable."

## Technical Moats

### 1. Small Tool Surface, Expanding Capability

OpenReaper does not add one MCP tool per REAPER action. The MCP surface
stays small, and capabilities grow as templates. This makes it easier for
agents to discover, reason about, and call the system.

Public phrasing:

> Instead of exposing hundreds of raw tools, OpenReaper keeps the agent
> interface tiny and lets capability grow behind a template registry.

### 2. Typed References Instead Of Fragile Selection

Agents should not depend on "whatever is currently selected" across a
multi-step workflow. OpenReaper supports durable refs and `last_result`
buckets so recipes can chain safely.

Public phrasing:

> The bridge treats project objects as typed references, so multi-step
> workflows can say "use the item I just created" instead of hoping the
> selection did not drift.

### 3. Locked Result Envelope

Every mutating template returns the same compact shape. This protects
agent context budget and keeps every template from inventing its own
response contract.

Public phrasing:

> Every write action returns the same small envelope, so agents get
> predictable outputs instead of custom JSON for every command.

### 4. Verified Writes

The hardening work is building `expectedDelta` and field-level checks:
the template declares what should change, and the bridge verifies the
actual REAPER state after the call.

Public phrasing:

> OpenReaper does not just trust that a command succeeded. For supported
> templates, it checks the resulting REAPER state and returns a typed
> `VERIFY_FAILED` if the DAW does not match the contract.

### 5. Real DAW Smoke Tests

The project uses TypeScript tests for the MCP/server surface and repeated
live REAPER smoke runs for the bridge behavior. A lot of bugs were caught
only in REAPER, not in fake tests.

Public phrasing:

> The bridge is tested both as software and as a DAW integration. The
> scary bugs were the real REAPER ones, so we made those part of the
> workflow.

### 6. Agent-Team Workflow

The project itself is being built by an agent team: Architect plans,
Codex implements, reviewer checks, REAPER smoke validates, user approves
key decisions.

Public phrasing:

> OpenReaper is also an experiment in building software with agents:
> one agent designs, one implements, one reviews, and the DAW is the final
> judge.

## Good Demo Story

Suggested video arc:

1. Start with the normal pain:
   "A sound designer has a sample and wants 8 useful variations, named,
   placed, regioned, rendered, and ready to audition."
2. Show the agent using OpenReaper, not mouse clicking.
3. Show the result in REAPER: tracks, items, regions, rendered WAVs.
4. Open the output folder: exactly the WAV files, no sidecars.
5. Show one failure case:
   deliberately wrong field check returns `VERIFY_FAILED` and does not
   pollute `LAST_RESULT`.
6. Explain the punchline:
   "The flashy part is AI controlling REAPER. The real part is that the
   bridge can verify what happened."

## Short Copy Blocks

### Bilibili / YouTube Description

OpenReaper is an MCP bridge for REAPER, developed by Streetlight Studio.
It lets AI agents operate a DAW through a small template registry instead
of a giant pile of raw tools. The focus is reliability: typed references,
locked response envelopes, real REAPER smoke tests, and field-level
verification that checks whether the project state actually changed as
expected.

This demo is early, but the direction is clear: AI agents should be able
to build sound-design variations, organize sessions, create regions,
render files, inspect tracks and FX, and eventually help with MIDI,
routing, automation, and mix workflows without becoming an untestable
script mess.

### One-Sentence Hook

I am building OpenReaper, an MCP bridge that lets AI agents control
REAPER, but the important part is not control. It is verification.

### More Dramatic Hook

The demo looks like an AI making sound-design variations in REAPER. The
thing underneath OpenReaper is a verified automation kernel for DAWs.

### Engineering Hook

OpenReaper treats DAW automation like an API contract: declared inputs,
typed refs, bounded outputs, expected deltas, actual deltas, and live
REAPER smoke tests.

## What Not To Overclaim Yet

Avoid saying:

- "It can make a full song by itself."
- "It can mix professionally."
- "It supports all REAPER actions."
- "It is production-ready for every studio."
- "Windows and Linux are fully verified."
- "It can control Serum / Splice / Soundly already."

Safer wording:

- "The architecture is designed to grow toward MIDI, FX, routing,
  automation, and library workflows."
- "The current public demo focuses on sound-design variation and render
  automation."
- "macOS + REAPER 7.71 has been the primary live-smoke environment so
  far."
- "The long-term goal is an agent-operable studio layer, but the current
  work is deliberately hardening the kernel first."

## Future "Science Fiction" Roadmap

These are the exciting directions, but mark them as roadmap until
implemented and live-smoked:

- MIDI generation and editing:
  create MIDI items, write notes, humanize, quantize, transpose, build
  chord / bass / rhythm layers.
- FX and automation:
  add FX, inspect parameters, set automatable parameters, write envelopes.
- Routing and session organization:
  folder tracks, sends, buses, stem groups, sidechain setup, naming and
  color conventions.
- Sound-library MCPs:
  Soundly / Splice / local sample-library search, tagging, auditioning,
  import into REAPER through OpenReaper refs.
- Instrument MCPs:
  long-term experiments around synth preset browsing / parameter maps,
  where the MCP can reason about available controls before writing them.
- Template factory:
  generate new REAPER templates from descriptors so capability breadth
  scales without hand-writing every tool.
- Faster transport:
  socket transport or batching while preserving the same MCP contract.

## Updating This Document

Update this file when:

- A slice becomes live-smoked.
- A roadmap item becomes real.
- A phrase becomes unsafe because the implementation changed.
- A new demo should be promoted.
- A bug teaches a useful public lesson.

Use this rule:

> If it is not implemented and live-smoked, write it as direction, not
> fact.
