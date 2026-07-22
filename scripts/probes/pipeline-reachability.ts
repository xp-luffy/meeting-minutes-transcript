/**
 * PIPELINE REACHABILITY PROBE
 *
 * The anti-circularity question is NOT "can this check fail in isolation".
 * It is: "for a draft the GENERATOR actually produced, can this check reach
 * every status?" A check whose PASS state is unreachable through the real
 * pipeline is permanent noise. A check whose FAIL state is unreachable is
 * a rubber stamp.
 */
import { generateMinutesRuleBased } from "../../lib/minutes-engine";
import { runAssurance } from "../../lib/assurance";

const mk = (over: any = {}) => ({
  id: "m1",
  company_name: "Acme Sdn Bhd",
  meeting_type: "Board Meeting",
  meeting_date: "2026-07-01",
  venue: "Boardroom",
  chairperson: "Ms Lee",
  attendees: [
    { name: "Ms Lee", role: "Chairperson" },
    { name: "Mr Tan", role: "Director" },
    { name: "Ms Wong", role: "Director" },
  ],
  quorum_met: true,
  status: "draft",
  created_at: "2026-07-01",
  ...over,
});

// Transcripts written as a real cosec would paste them — every one of these
// EXPLICITLY contains the facts the checks look for.
const TRANSCRIPTS: Record<string, string> = {
  T1_everything_said: `Chairman: I call this meeting to order. A quorum is present.
Ms Lee: Before we begin, Mr Tan wishes to declare his interest in the Beta Holdings transaction.
Mr Tan: I declare my interest in Beta Holdings and will abstain.
Chairman: The minutes of the previous meeting are confirmed as a true and correct record.
Chairman: RESOLVED THAT the audited financial statements for the year ended 31 December 2025 be approved.
Ms Wong: Carried unanimously.
Mr Tan: I will circulate the signed accounts to all directors by 15 August 2026.
Chairman: There being no other business, the meeting was closed at 11.00am.`,

  T2_no_close_no_interest: `Chairman: A quorum is present.
Chairman: RESOLVED THAT the appointment of Ms Chan as company secretary be approved.
Ms Wong: Carried.
Mr Tan: I will file the Form 49 with SSM by 30 July 2026.`,

  T3_interest_refused: `Chairman: A quorum is present.
Ms Lee: Mr Tan, do you have an interest in Beta Holdings?
Mr Tan: I refuse to declare my interest in that matter.
Chairman: RESOLVED THAT the Beta Holdings purchase be approved.
Ms Wong: Carried.
Chairman: The meeting was closed.`,
};

console.log("=== GENERATOR -> CHECKER, END TO END ===\n");

const observed: Record<string, Set<string>> = {};

for (const [name, transcript] of Object.entries(TRANSCRIPTS)) {
  const meeting = mk();
  const gen = generateMinutesRuleBased(meeting, transcript);

  const result = runAssurance({
    meeting: {
      meeting_type: meeting.meeting_type,
      chairperson: meeting.chairperson,
      attendees: meeting.attendees,
      quorum_met: gen.quorum_met,
    },
    bodyHtml: gen.minutes_body_html,
    resolutions: gen.resolutions.map((r: any) => ({
      resolution_number: r.number,
      resolution_text: r.text,
      outcome: r.outcome,
    })),
    actionItems: gen.action_items.map((a: any) => ({
      description: a.description,
      owner_name: a.owner,
      owner_entity_id: null,
      due_date: a.due_date,
    })),
    transcriptText: transcript,
  });

  console.log(`--- ${name}  score=${result.score} ---`);
  for (const c of result.checks) {
    (observed[c.key] ??= new Set()).add(c.status);
    if (c.status !== "pass") console.log(`   ${c.status.toUpperCase().padEnd(15)} ${c.key}`);
  }

  // Did the generator carry the fact into the body at all?
  const body = gen.minutes_body_html;
  const facts = {
    "close statement in TRANSCRIPT": /clos(ed)?|adjourn/i.test(transcript),
    "close statement in BODY": /clos(ed)?|adjourn/i.test(body),
    "interest declaration in TRANSCRIPT": /declar/i.test(transcript),
    "interest declaration in BODY": /declar/i.test(body),
    "prev-minutes confirmation in TRANSCRIPT": /previous (meeting|minutes)/i.test(transcript),
    "prev-minutes confirmation in BODY": /previous (meeting|minutes)/i.test(body),
  };
  console.log("   fact carriage:");
  for (const [k, v] of Object.entries(facts)) console.log(`      ${v ? "yes" : "NO "}  ${k}`);
  console.log();
}

console.log("\n=== PIPELINE REACHABILITY ===");
for (const k of Object.keys(observed).sort()) {
  const s = [...observed[k]];
  const canPass = s.includes("pass");
  const canFlag = s.includes("fail") || s.includes("warn");
  const verdict = canPass && canFlag ? "ok" : canPass ? "*** NEVER FLAGS via pipeline ***" : "*** NEVER PASSES via pipeline ***";
  console.log(k.padEnd(30), s.join(",").padEnd(20), verdict);
}
