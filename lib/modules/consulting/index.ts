import type { ModuleDefinition } from "../types";

/**
 * Professional Services — the second vertical. Consultants and agencies selling
 * billable work, where the product is scope-creep defence: a client-confirmed
 * record of what was agreed.
 *
 * Note the deliberate absences. There is no convener (a client call has no
 * chairperson) and no quorum on any meeting type (quorumSubjectPlural is null) —
 * quorum is a company-law concept that does not transfer. The share is an
 * ACKNOWLEDGEMENT, not an attestation: the client agrees the summary is
 * accurate, which is not the statutory act a director performs, so it is allowed
 * on a draft rather than gated behind review.
 *
 * The governing document is the signed SOW, checked the same way a constitution
 * supplies a quorum rule — a named, dated, in-force document, or null for
 * unknown, never a default.
 */
export const consulting: ModuleDefinition = {
  id: "consulting",
  vocabulary: {
    moduleLabel: "Professional Services",
    recordNoun: { singular: "decision memo", plural: "decision memos" },
    decisionNoun: { singular: "decision", plural: "decisions" },
    commitmentNoun: { singular: "commitment", plural: "commitments" },
    ownerNoun: "owner",
    counterpartyNoun: "client",
    convenerNoun: null,
    confirmerNoun: "client contact",
    governingDocNoun: "statement of work",
    attestationText: "I acknowledge this is an accurate summary of what we agreed.",
  },
  meetingTypes: [
    { id: "discovery", label: "Discovery Call", numberPrefix: "DSC", narrativeHeading: "What we discussed", quorumSubjectPlural: null, useFormalCapsHeading: false },
    { id: "kickoff", label: "Kickoff", numberPrefix: "KO", narrativeHeading: "What we discussed", quorumSubjectPlural: null, useFormalCapsHeading: false },
    { id: "status", label: "Status Update", numberPrefix: "ST", narrativeHeading: "What we discussed", quorumSubjectPlural: null, useFormalCapsHeading: false },
    { id: "qbr", label: "Quarterly Business Review", numberPrefix: "QBR", narrativeHeading: "What we discussed", quorumSubjectPlural: null, useFormalCapsHeading: false },
    { id: "escalation", label: "Escalation", numberPrefix: "ESC", narrativeHeading: "What we discussed", quorumSubjectPlural: null, useFormalCapsHeading: false },
  ],
  defaultMeetingTypeId: "status",
  governingDocType: "sow",
  shareKind: "acknowledgement",
};
