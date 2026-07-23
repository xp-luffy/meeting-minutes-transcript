import type { ModuleDefinition, ModuleId, MeetingTypeDefinition } from "./types";
import { cosec } from "./cosec";
import { consulting } from "./consulting";

/**
 * The module registry. The one place that knows every vertical exists.
 *
 * Adding vertical #3 is: one folder under lib/modules/, one import here, one row
 * in the `modules` table, one row per meeting type in `meeting_types`. Nothing
 * else. That is what "a config file, not a fork" means concretely.
 */
export const MODULES: Record<ModuleId, ModuleDefinition> = { cosec, consulting };

/**
 * Resolve a module by id, FAIL-SAFE toward cosec.
 *
 * Legacy rows have module_id NULL and every one of them is a cosec record by
 * definition (0043 backfilled them). An unknown id is logged and falls back
 * rather than throwing, because a rendering path should degrade to the original
 * vertical, never crash — the same fail-closed-toward-the-safe-default instinct
 * the RLS layer uses. cosec is the safe default because it is the stricter
 * vertical: its share gate is the attestation gate, not the looser
 * acknowledgement one.
 */
export function resolveModule(id: string | null | undefined): ModuleDefinition {
  if (!id) return MODULES.cosec;
  const m = MODULES[id as ModuleId];
  if (!m) {
    console.error(`[modules] unknown module_id "${id}" — falling back to cosec`);
    return MODULES.cosec;
  }
  return m;
}

/** Resolve a meeting type within a module, fail-safe toward the module default. */
export function resolveMeetingType(
  module: ModuleDefinition,
  typeId: string | null | undefined,
): MeetingTypeDefinition {
  const t = typeId ? module.meetingTypes.find((mt) => mt.id === typeId) : undefined;
  if (!t) {
    return (
      module.meetingTypes.find((mt) => mt.id === module.defaultMeetingTypeId) ??
      module.meetingTypes[0]
    );
  }
  return t;
}
