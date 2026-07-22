/**
 * Proves checkInterestDeclarations can reach ALL THREE outcomes.
 *
 * It previously warned on 12 of 12 production drafts — 100% — which made it
 * noise rather than signal. The fix uses the transcript (which the function
 * always received and discarded) to ask whether a declaration was CALLED FOR.
 *
 * The tempting fix — have the generator emit "no interests were declared" so
 * the check passes — is the quorum_stated defect and would trade 12 honest
 * warnings for 12 fabricated passes. This probe guards against that: if the
 * WARN case ever stops firing, the check has become unfalsifiable again.
 */
import { runAssurance } from "../../lib/assurance";

const base = {
  meeting: {
    meeting_type: "Board Meeting",
    chairperson: "A Chair",
    attendees: [
      { name: "A Chair", role: "Chairman" },
      { name: "B Dir", role: "Director" },
    ],
    quorum_met: true,
  },
  resolutions: [
    {
      resolution_number: "BD-1",
      resolution_text: "RESOLVED THAT the contract be awarded to the approved supplier.",
      outcome: "carried",
    },
  ],
  actionItems: [
    { description: "File the contract", owner_name: "B Dir", owner_entity_id: "e1", due_date: "2026-08-01" },
  ],
};

const cases = [
  { expect: "warn", name: "trigger in transcript, NO declaration in body",
    transcript: "The board discussed awarding the contract to a related party. The tender was reviewed.",
    body: "<p>The board discussed the contract award.</p>" },
  { expect: "pass", name: "trigger in transcript, declaration IS in body",
    transcript: "The board discussed awarding the contract to a related party.",
    body: "<p>The Chairman declared his interest in the matter.</p>" },
  { expect: "not_applicable", name: "no trigger at all",
    transcript: "The board reviewed the marketing update and the quarterly figures.",
    body: "<p>The board reviewed the marketing update.</p>" },
  { expect: "warn", name: "trigger via 'his own company'",
    transcript: "The chairman proposed we buy services from his own company at market rate.",
    body: "<p>The board considered a services proposal.</p>" },
];

let failures = 0;
for (const c of cases) {
  const r = runAssurance({
    ...base,
    bodyHtml: c.body,
    transcriptText: c.transcript,
  } as Parameters<typeof runAssurance>[0]);
  const got = r.checks.find((x) => x.key === "interest_declarations")?.status ?? "MISSING";
  const ok = got === c.expect;
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FAIL"}  expected ${c.expect.padEnd(15)} got ${got.padEnd(15)} ${c.name}`);
}
const reached = new Set(["warn", "pass", "not_applicable"]);
console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${cases.length - failures}/${cases.length} cases; ${reached.size} outcomes must be reachable`);
if (failures > 0) process.exit(1);
