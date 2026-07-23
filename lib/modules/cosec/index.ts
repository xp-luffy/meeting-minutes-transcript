import type { ModuleDefinition } from "../types";

/**
 * Company Secretarial — the original vertical, expressed as a module.
 *
 * The meeting types mirror the five categories meetingTypeCategory() has always
 * produced (audit, agm, egm, board, committee) so this module is a faithful
 * description of current behaviour, not a redesign. When the assurance and
 * generation engines are switched to read meeting_type_id (a later gated step),
 * these definitions replace the substring dispatch — but the identities here
 * must match what migration 0043 seeded, or the composite FK rejects a meeting.
 */
export const cosec: ModuleDefinition = {
  id: "cosec",
  vocabulary: {
    moduleLabel: "Company Secretarial",
    recordNoun: { singular: "minutes", plural: "minutes" },
    decisionNoun: { singular: "resolution", plural: "resolutions" },
    commitmentNoun: { singular: "action item", plural: "action items" },
    ownerNoun: "responsible officer",
    counterpartyNoun: "company",
    convenerNoun: "chairperson",
    confirmerNoun: "director",
    governingDocNoun: "constitution",
    attestationText: "I confirm these minutes are an accurate record of the meeting.",
  },
  meetingTypes: [
    { id: "board", label: "Board Meeting", numberPrefix: "BD", narrativeHeading: "Deliberations", quorumSubjectPlural: "directors", useFormalCapsHeading: false },
    { id: "agm", label: "Annual General Meeting", numberPrefix: "AGM", narrativeHeading: "Deliberations", quorumSubjectPlural: "members", useFormalCapsHeading: true },
    { id: "egm", label: "Extraordinary General Meeting", numberPrefix: "EGM", narrativeHeading: "Deliberations", quorumSubjectPlural: "members", useFormalCapsHeading: true },
    { id: "audit", label: "Audit Committee Meeting", numberPrefix: "AC", narrativeHeading: "Deliberations", quorumSubjectPlural: "members", useFormalCapsHeading: false },
    { id: "committee", label: "Committee Meeting", numberPrefix: "CM", narrativeHeading: "Deliberations", quorumSubjectPlural: "members", useFormalCapsHeading: false },
  ],
  defaultMeetingTypeId: "committee",
  governingDocType: "constitution",
  shareKind: "attestation",
};
