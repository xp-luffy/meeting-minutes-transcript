/**
 * Proves the module registry is internally consistent and — the part that
 * matters — that its meeting-type ids match what migration 0043 seeded into the
 * meeting_types table. If code and DB drift, the composite FK
 * (module_id, meeting_type_id) silently rejects new meetings at insert time,
 * which is a runtime failure a green build never sees. This is the seam that
 * scar #8 (repo/DB divergence) lives on.
 *
 * The DB half is a hardcoded mirror of the 0043 seed, on purpose: if someone
 * edits the migration, this probe must be updated in the same change, which
 * forces the two to be reconciled by a human rather than drifting.
 */
import { MODULES, resolveModule, resolveMeetingType } from "../../lib/modules/registry";
import type { Vocabulary } from "../../lib/modules/types";

// Mirror of migration 0043's meeting_types seed. Keep in lockstep with the SQL.
const DB_SEED: Record<string, string[]> = {
  cosec: ["board", "agm", "egm", "audit", "committee"],
  consulting: ["discovery", "kickoff", "status", "qbr", "escalation"],
};

const VOCAB_SLOTS: (keyof Vocabulary)[] = [
  "moduleLabel", "recordNoun", "decisionNoun", "commitmentNoun", "ownerNoun",
  "counterpartyNoun", "confirmerNoun", "governingDocNoun", "attestationText",
  // convenerNoun is intentionally nullable and excluded from the required set.
];

let failures = 0;
const fail = (msg: string) => { console.log(`FAIL  ${msg}`); failures++; };
const ok = (msg: string) => console.log(`OK    ${msg}`);

for (const [id, mod] of Object.entries(MODULES)) {
  // 1. id matches its key
  if (mod.id !== id) fail(`MODULES["${id}"].id is "${mod.id}"`);

  // 2. every code meeting-type id is seeded in the DB, and vice versa
  const codeIds = mod.meetingTypes.map((t) => t.id).sort();
  const dbIds = [...(DB_SEED[id] ?? [])].sort();
  if (JSON.stringify(codeIds) !== JSON.stringify(dbIds)) {
    fail(`${id}: meeting types drift — code [${codeIds}] vs DB seed [${dbIds}]`);
  } else {
    ok(`${id}: ${codeIds.length} meeting types match the 0043 seed`);
  }

  // 3. default meeting type actually exists
  if (!mod.meetingTypes.some((t) => t.id === mod.defaultMeetingTypeId)) {
    fail(`${id}: defaultMeetingTypeId "${mod.defaultMeetingTypeId}" is not a real type`);
  }

  // 4. required vocabulary slots are present and non-empty
  for (const slot of VOCAB_SLOTS) {
    const v = mod.vocabulary[slot];
    const empty = v == null || (typeof v === "string" && v.trim() === "") ||
      (typeof v === "object" && (!("singular" in v) || !v.singular));
    if (empty) fail(`${id}: vocabulary.${String(slot)} is empty`);
  }
}

// 5. fail-safe resolution never throws and always lands on cosec for junk
if (resolveModule(null).id !== "cosec") fail("resolveModule(null) is not cosec");
if (resolveModule("does-not-exist").id !== "cosec") fail("resolveModule(unknown) is not cosec");
if (resolveMeetingType(MODULES.cosec, "nonsense").id !== MODULES.cosec.defaultMeetingTypeId) {
  fail("resolveMeetingType(unknown) did not fall back to the default");
}
ok("fail-safe resolution lands on cosec / the module default");

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} problem(s)`);
if (failures > 0) process.exit(1);
