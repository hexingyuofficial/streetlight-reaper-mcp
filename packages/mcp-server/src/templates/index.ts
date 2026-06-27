import type { CapabilityRegistry } from "@streetlight/core";
import { itemPitchDefinition } from "./item-pitch.js";

/**
 * Register every v0.1 core-pack template with the MCP server's registry.
 *
 * Adding a template means:
 *   1. drop a file under packages/mcp-server/src/templates/
 *   2. export its CapabilityDefinition
 *   3. add one line below
 *   4. add the Lua handler to reaper/packs/core/templates/ and wire it
 *      into reaper/packs/core/manifest.lua
 *
 * `call_template` validation is driven entirely by what's registered here;
 * there is no per-template special-casing in the tool layer. New templates
 * just appear in the registry and become callable.
 */
export function registerCoreTemplates(registry: CapabilityRegistry): void {
  registry.register(itemPitchDefinition);
}
