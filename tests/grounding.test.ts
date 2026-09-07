import { describe, expect, it } from "vitest";
import { decideRecommendation } from "@/domain/recommendation";
import { segmentDocument } from "@/lib/grounding/segmentation";
import { quoteIsInBlock, validateAndDowngradeMatch } from "@/lib/grounding/validators";
import type { EvidenceItem, Requirement } from "@/domain/types";

const blocks = segmentDocument({ id: "resume", title: "Resume", kind: "resume", text: "Experience\n\nBuilt React features in production." });
const direct: EvidenceItem = { id: "e1", claim: "Built React features", sourceBlockId: "resume:block:2", exactQuote: "Built React features in production.", type: "production_experience", strength: "direct", tags: [], reviewState: "verified" };
const req: Requirement = { id: "r1", label: "React", category: "technical_skill", priority: "core", sources: [{ sourceBlockId: "job:block:1", exactQuote: "React" }], mayBeHardConstraint: false };

describe("grounding invariants", () => {
  it("segments unchanged source text deterministically", () => expect(segmentDocument({ id: "resume", title: "Resume", kind: "resume", text: "A\n\nB" })).toEqual(segmentDocument({ id: "resume", title: "Resume", kind: "resume", text: "A\n\nB" })));
  it("accepts a quote only when it is a normalized substring", () => { expect(quoteIsInBlock("React   features in production.", blocks[1])).toBe(true); expect(quoteIsInBlock("Invented GraphQL work", blocks[1])).toBe(false); });
  it("downgrades strong matches without direct evidence", () => { const result = validateAndDowngradeMatch({ requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "transferable" }] }, [direct]); expect(result.status).toBe("partial_match"); });
  it("does not allow uncomputed year requirements to become strong", () => { const result = validateAndDowngradeMatch({ requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] }, [direct], { ...req, label: "3+ years of React production experience" }); expect(result.status).toBe("partial_match"); });
  it("uses the JD quote rather than trusting a simplified model label for year guards", () => { const result = validateAndDowngradeMatch({ requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] }, [direct], { ...req, label: "React experience", sources: [{ sourceBlockId: "job:block:1", exactQuote: "3+ years of React" }] }); expect(result.status).toBe("partial_match"); });
  it("downgrades partial matches without evidence", () => { const result = validateAndDowngradeMatch({ requirementId: "r1", proposedStatus: "partial_match", links: [] }, []); expect(result.status).toBe("no_evidence_provided"); });
  it("returns skip for a confirmed hard constraint", () => expect(decideRecommendation([req], [], [{ requirementId: "r1", status: "confirmed", detail: "Required work authorization conflicts", evidenceIds: ["e1"] }])).toBe("skip"));
  it("returns apply only when core support reaches its explicit threshold", () => {
    const requirements = [req, { ...req, id: "r2" }, { ...req, id: "r3" }];
    const matches = requirements.map((item) => ({ requirementId: item.id, proposedStatus: "strong_match" as const, status: "strong_match" as const, links: [{ evidenceId: "e1", relationship: "direct" as const }] }));
    expect(decideRecommendation(requirements, matches, [])).toBe("apply");
  });
});
