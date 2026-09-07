import { describe, expect, it } from "vitest";
import { deriveConstraints } from "@/lib/ai/analysis";
import type { EvidenceItem, Match, Requirement } from "@/domain/types";

const requirement: Requirement = { id: "location", label: "Work onsite", category: "location_or_work_mode", priority: "core", sources: [{ sourceBlockId: "job:block:1", exactQuote: "Work onsite" }], mayBeHardConstraint: true };
const evidence = (reviewState: EvidenceItem["reviewState"]): EvidenceItem => ({ id: "fact", claim: "Remote only", sourceBlockId: "resume:block:1", exactQuote: "I can work remotely only.", type: "constraint_fact", strength: "direct", tags: [], reviewState });
const conflicting = (relationship: Match["links"][number]["relationship"]): Match => ({ requirementId: "location", proposedStatus: "conflicting_evidence", status: "conflicting_evidence", links: [{ evidenceId: "fact", relationship }], gap: null, rationale: null });

describe("hard-constraint policy", () => {
  it("does not confirm a blocker from pending evidence", () => expect(deriveConstraints([requirement], [conflicting("direct")], [evidence("pending")])).toEqual([]));
  it("does not confirm a blocker from transferable evidence", () => expect(deriveConstraints([requirement], [conflicting("transferable")], [evidence("verified")])).toEqual([]));
  it("confirms only a direct verified constraint fact", () => expect(deriveConstraints([requirement], [conflicting("direct")], [evidence("verified")])[0]?.status).toBe("confirmed"));
  it("never treats a technical requirement as a hard constraint", () => expect(deriveConstraints([{ ...requirement, category: "technical_skill" }], [conflicting("direct")], [evidence("verified")])).toEqual([]));
});
