export const CORE_PACK_ID = "core";
export const PACK_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

export function isValidPackId(value: string): boolean {
  return PACK_ID_PATTERN.test(value);
}

export function parseEnabledPacks(input?: string | null): string[] {
  if (input === undefined || input === null || input.trim() === "") {
    return [CORE_PACK_ID];
  }

  const ids = input
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (ids.length === 0) return [CORE_PACK_ID];

  const seen = new Set<string>();
  for (const id of ids) {
    if (!isValidPackId(id)) {
      throw new Error(`Invalid pack id: ${id}`);
    }
    if (seen.has(id)) {
      throw new Error(`Duplicate pack id: ${id}`);
    }
    seen.add(id);
  }

  if (!seen.has(CORE_PACK_ID)) {
    throw new Error(`Enabled packs must include ${CORE_PACK_ID}`);
  }
  if (ids[0] !== CORE_PACK_ID) {
    throw new Error(`Enabled packs must start with ${CORE_PACK_ID}`);
  }

  return ids;
}
