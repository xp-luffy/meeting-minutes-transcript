/**
 * ANTI-CIRCULARITY PROBE (empirical)
 *
 * For every check key in lib/assurance.ts, prove it can reach BOTH `pass` and
 * `fail`/`warn` using fixtures the generator did not produce. A key that only
 * ever reaches one status is inert.
 */
import { runAssurance } from "../../lib/assurance";

type Row = { name: string; statuses: Record<string, string>; score: number };

const GOOD_BODY = `
<h2>Minutes of Board Meeting</h2>
<h3>Attendance &amp; Quorum</h3>
<p>A quorum of directors was present and confirmed at the outset of the meeting.</p>
<p>The Chairman noted that the minutes of the previous meeting were confirmed as a true and correct record.</p>
<p>Mr Tan declared his interest in the proposed transaction.</p>
<h3>Close</h3>
<p>There being no other business, the meeting was closed at 11.00am.</p>
`;

const EMPTY_BODY = `<h2>Minutes of Board Meeting</h2><h3>Attendance &amp; Quorum</h3><p>Matters were discussed.</p>`;

const goodMeeting = {
  meeting_type: "Board Meeting",
  chairperson: "Ms Lee",
  attendees: [
    { name: "Ms Lee", role: "Chairperson" },
    { name: "Mr Tan", role: "Director" },
    { name: "Ms Wong", role: "Director" },
  ],
  quorum_met: true,
};

const goodRes = [
  {
    resolution_number: "BR-2026-01",
    resolution_text: "RESOLVED THAT the audited financial statements for the year ended 31 December 2025 be and are hereby approved.",
    outcome: "carried",
  },
];

const goodActions = [
  { description: "Circulate the audited accounts to all directors", owner_name: "Mr Tan", owner_entity_id: "e1", due_date: "2026-08-01" },
];

const TRANSCRIPT_WITH_UNDERTAKING =
  "Chairman: I confirm the minutes of the previous meeting. Mr Tan: I will circulate the audited accounts to all directors by August. Chairman: Noted.";

function run(name: string, input: any): Row {
  const r = runAssurance(input);
  const statuses: Record<string, string> = {};
  for (const c of r.checks) statuses[c.key] = c.status;
  return { name, statuses, score: r.score };
}

const rows: Row[] = [];

// --- Fixture 1: the "everything correct" case ---------------------------
rows.push(
  run("A_all_good", {
    meeting: goodMeeting,
    bodyHtml: GOOD_BODY,
    resolutions: goodRes,
    actionItems: goodActions,
    transcriptText: TRANSCRIPT_WITH_UNDERTAKING,
  }),
);

// --- Fixture 2: deliberately deficient, hand-written (NOT generator output) ---
rows.push(
  run("B_deficient", {
    meeting: { meeting_type: "Board Meeting", chairperson: null, attendees: [], quorum_met: null },
    bodyHtml: EMPTY_BODY,
    resolutions: [],
    actionItems: [{ description: "Someone should do the thing", owner_name: "TBC", owner_entity_id: null, due_date: null }],
    transcriptText:
      "Chairman: We refer to the previous minutes. Someone will prepare the tax computation before year end. Also the secretary shall file the annual return.",
  }),
);

// --- Fixture 3: the ADVERSARIAL case — the generator's OWN template text,
//     but with the underlying facts absent. This is the circularity test.
rows.push(
  run("C_template_text_no_facts", {
    meeting: { meeting_type: "Board Meeting", chairperson: null, attendees: [], quorum_met: null },
    bodyHtml: GOOD_BODY, // engine-shaped prose
    resolutions: [],
    actionItems: [],
    transcriptText: "Nothing of substance was discussed.",
  }),
);

// --- Fixture 4: engine's HONEST no-quorum sentence -----------------------
rows.push(
  run("D_engine_no_quorum_sentence", {
    meeting: { ...goodMeeting, quorum_met: false },
    bodyHtml:
      `<h3>Attendance &amp; Quorum</h3><p>The meeting proceeded without a confirmed quorum; this should be reviewed before finalisation.</p><p>The meeting was closed.</p>`,
    resolutions: goodRes,
    actionItems: goodActions,
    transcriptText: TRANSCRIPT_WITH_UNDERTAKING,
  }),
);

// --- Fixture 5: maisca definitional quorum boilerplate only --------------
rows.push(
  run("E_maisca_definitional_only", {
    meeting: { ...goodMeeting, minutes_format: "maisca", quorum_met: true },
    bodyHtml:
      `<h3>Quorum</h3><p>In accordance with the Terms of Reference, 3 members of the Committee including the Chairman or Deputy Chairman present shall form a quorum.</p><p>The meeting was adjourned.</p>`,
    resolutions: goodRes,
    actionItems: goodActions,
    transcriptText: TRANSCRIPT_WITH_UNDERTAKING,
  }),
);

// --- Fixture 6: quorum_rule supplied and NOT met -------------------------
rows.push(
  run("F_quorum_rule_not_met", {
    meeting: {
      ...goodMeeting,
      attendees: [{ name: "Ms Lee", role: "Company Secretary" }],
      quorum_rule: { threshold: 3, total: 5, citation: "Constitution, in force 12 Jun 2026" },
    },
    bodyHtml: GOOD_BODY,
    resolutions: goodRes,
    actionItems: goodActions,
    transcriptText: TRANSCRIPT_WITH_UNDERTAKING,
  }),
);

// --- Fixture 7: quorum_rule supplied and MET ----------------------------
rows.push(
  run("G_quorum_rule_met", {
    meeting: {
      ...goodMeeting,
      quorum_rule: { threshold: 2, total: 5, citation: "Constitution, in force 12 Jun 2026" },
    },
    bodyHtml: GOOD_BODY,
    resolutions: goodRes,
    actionItems: goodActions,
    transcriptText: TRANSCRIPT_WITH_UNDERTAKING,
  }),
);

// --- Fixture 8: interest declaration REFUSED ----------------------------
rows.push(
  run("H_interest_refused", {
    meeting: goodMeeting,
    bodyHtml: GOOD_BODY.replace("Mr Tan declared his interest in the proposed transaction.", "Mr Tan refused to declare his interest in the proposed transaction."),
    resolutions: goodRes,
    actionItems: goodActions,
    transcriptText: TRANSCRIPT_WITH_UNDERTAKING,
  }),
);

// --- Fixture 9: negated close -------------------------------------------
rows.push(
  run("I_negated_close", {
    meeting: goodMeeting,
    bodyHtml: GOOD_BODY.replace("There being no other business, the meeting was closed at 11.00am.", "The meeting was not closed; members walked out and no adjournment was moved."),
    resolutions: goodRes,
    actionItems: goodActions,
    transcriptText: TRANSCRIPT_WITH_UNDERTAKING,
  }),
);

// --- Fixture 10: malformed resolution -----------------------------------
rows.push(
  run("J_malformed_resolution", {
    meeting: goodMeeting,
    bodyHtml: GOOD_BODY,
    resolutions: [{ resolution_number: null, resolution_text: "Approved.", outcome: "" }],
    actionItems: goodActions,
    transcriptText: TRANSCRIPT_WITH_UNDERTAKING,
  }),
);

// ---------------------------------------------------------------------------
// Report: for each key, which statuses were ever observed?
// ---------------------------------------------------------------------------
const allKeys = new Set<string>();
for (const r of rows) for (const k of Object.keys(r.statuses)) allKeys.add(k);

console.log("=== PER-FIXTURE ===");
for (const r of rows) {
  console.log(`\n${r.name}  score=${r.score}`);
  for (const [k, v] of Object.entries(r.statuses)) {
    if (v !== "pass") console.log(`   ${v.toUpperCase().padEnd(15)} ${k}`);
  }
}

console.log("\n\n=== REACHABILITY MATRIX (the real result) ===");
console.log("key".padEnd(30), "observed statuses", "  VERDICT");
let inert = 0;
for (const k of [...allKeys].sort()) {
  const seen = new Set<string>();
  for (const r of rows) if (r.statuses[k]) seen.add(r.statuses[k]);
  const canPass = seen.has("pass");
  const canFlag = seen.has("fail") || seen.has("warn");
  const verdict = canPass && canFlag ? "OK (bidirectional)" : canPass ? "*** NEVER FLAGS ***" : "*** NEVER PASSES ***";
  if (!(canPass && canFlag)) inert++;
  console.log(k.padEnd(30), [...seen].join(",").padEnd(22), verdict);
}
console.log(`\n${inert} inert check(s) out of ${allKeys.size}`);
