import { describe, expect, it } from "vitest";
import { decideRecommendation } from "@/domain/recommendation";
import { segmentDocument } from "@/lib/grounding/segmentation";
import { extractTechnicalTokens, quoteIsInBlock, validateAndDowngradeMatch } from "@/lib/grounding/validators";
import type { EvidenceItem, Requirement } from "@/domain/types";

const blocks = segmentDocument({ id: "resume", title: "Resume", kind: "resume", text: "Experience\n\nBuilt React features in production." });
const direct: EvidenceItem = { id: "e1", claim: "Built React features", sourceBlockId: "resume:block:2", exactQuote: "Built React features in production.", type: "production_experience", strength: "direct", tags: [], reviewState: "verified" };
const req: Requirement = { id: "r1", label: "React", category: "technical_skill", priority: "core", sources: [{ sourceBlockId: "job:block:1", exactQuote: "React" }], mayBeHardConstraint: false };

describe("grounding invariants", () => {
  it("segments unchanged source text deterministically", () => expect(segmentDocument({ id: "resume", title: "Resume", kind: "resume", text: "A\n\nB" })).toEqual(segmentDocument({ id: "resume", title: "Resume", kind: "resume", text: "A\n\nB" })));
  it("accepts a quote only when it is a normalized substring", () => { expect(quoteIsInBlock("React   features in production.", blocks[1])).toBe(true); expect(quoteIsInBlock("Invented GraphQL work", blocks[1])).toBe(false); });
  it("downgrades strong matches without direct evidence", () => { const result = validateAndDowngradeMatch({ requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "transferable" }] }, [direct]); expect(result.status).toBe("partial_match"); });
  it("does not allow uncomputed year requirements to become strong", () => { const result = validateAndDowngradeMatch({ requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] }, [direct], { ...req, label: "3+ years of React production experience", sources: [{ sourceBlockId: "job:block:1", exactQuote: "3+ years of React production experience" }] }); expect(result.status).toBe("partial_match"); });
  it("uses the JD quote rather than trusting a simplified model label for year guards", () => { const result = validateAndDowngradeMatch({ requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] }, [direct], { ...req, label: "React experience", sources: [{ sourceBlockId: "job:block:1", exactQuote: "3+ years of React" }] }); expect(result.status).toBe("partial_match"); });
  it("downgrades partial matches without evidence", () => { const result = validateAndDowngradeMatch({ requirementId: "r1", proposedStatus: "partial_match", links: [] }, []); expect(result.status).toBe("no_evidence_provided"); });
  it("returns skip for a confirmed hard constraint", () => expect(decideRecommendation([req], [], [{ requirementId: "r1", status: "confirmed", detail: "Required work authorization conflicts", evidenceIds: ["e1"] }])).toBe("skip"));
  it("returns apply only when core support reaches its explicit threshold", () => {
    const requirements = [req, { ...req, id: "r2" }, { ...req, id: "r3" }];
    const matches = requirements.map((item) => ({ requirementId: item.id, proposedStatus: "strong_match" as const, status: "strong_match" as const, links: [{ evidenceId: "e1", relationship: "direct" as const }] }));
    expect(decideRecommendation(requirements, matches, [])).toBe("apply");
  });
  it("does not trust a claim for missing duration or technology facts", () => {
    const years = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] },
      [{ ...direct, claim: "5 years React", exactQuote: "Built frontend features in production." }],
      { ...req, category: "experience", sources: [{ sourceBlockId: "job:block:1", exactQuote: "5 years of React production experience" }] },
    );
    const technology = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] },
      [{ ...direct, claim: "React", exactQuote: "Built Python services in production." }],
      req,
    );
    expect(years.status).not.toBe("strong_match");
    expect(technology.status).toBe("no_evidence_provided");
  });

  it("does not derive JD facts from a model label or accept irrelevant valid IDs", () => {
    const labelOnly = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] },
      [{ ...direct, exactQuote: "Built React features in production." }],
      { ...req, label: "5 years React", sources: [{ sourceBlockId: "job:block:1", exactQuote: "Frontend experience" }] },
    );
    const inventedTech = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] },
      [direct],
      { ...req, sources: [{ sourceBlockId: "job:block:1", exactQuote: "modern frontend framework" }] },
    );
    expect(labelOnly.status).toBe("no_evidence_provided");
    expect(inventedTech.status).toBe("no_evidence_provided");
  });

  it("allows only exact quote-supported production technology and duration evidence to be strong", () => {
    const result = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] },
      [{ ...direct, claim: "Anything", exactQuote: "5 years building React features in production." }],
      { ...req, category: "experience", sources: [{ sourceBlockId: "job:block:1", exactQuote: "3+ years of React production experience" }] },
    );
    const personal = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] },
      [{ ...direct, claim: "Production React", type: "project_experience", exactQuote: "Personal project: built React features in production-like testnet." }],
      { ...req, category: "experience", sources: [{ sourceBlockId: "job:block:1", exactQuote: "React production experience" }] },
    );
    expect(result.status).toBe("strong_match");
    expect(personal.status).toBe("partial_match");
  });

  it("does not let a model-assigned production type add missing production context", () => {
    const result = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] },
      [{ ...direct, claim: "Production React delivery", exactQuote: "Built a React prototype." }],
      { ...req, category: "experience", sources: [{ sourceBlockId: "job:block:1", exactQuote: "React production experience" }] },
    );
    expect(result.status).toBe("partial_match");
  });

  it("does not let an unrelated but valid evidence ID support a nontechnical Strong match", () => {
    const result = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] },
      [{ ...direct, exactQuote: "Built React features in production." }],
      { ...req, category: "responsibility", sources: [{ sourceBlockId: "job:block:1", exactQuote: "Mentor junior engineers." }] },
    );
    expect(result.status).toBe("no_evidence_provided");
  });

  it.each([
    ["Vue", "Built Vue interfaces in production."],
    ["Next.js", "Shipped Nextjs applications in production."],
    ["wagmi", "Integrated wagmi with viem for wallet flows."],
    ["viem", "Integrated wagmi with viem for wallet flows."],
    ["Vitest", "Maintained Vitest unit tests."],
    ["React Testing Library", "Used RTL for component tests."],
    ["TanStack Query", "Used TanStack Query for server-state caching."],
  ])("supports direct exact-quote technical evidence for %s", (technology, exactQuote) => {
    const result = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] },
      [{ ...direct, exactQuote }],
      { ...req, sources: [{ sourceBlockId: "job:block:1", exactQuote: `${technology} experience is required.` }] },
    );
    expect(result.status).toBe("strong_match");
  });

  it("normalizes only explicit technical aliases", () => {
    const react = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] },
      [{ ...direct, exactQuote: "Built React.js interfaces in production." }],
      { ...req, sources: [{ sourceBlockId: "job:block:1", exactQuote: "React experience is required." }] },
    );
    const typescript = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] },
      [{ ...direct, exactQuote: "Maintained TS application code." }],
      { ...req, sources: [{ sourceBlockId: "job:block:1", exactQuote: "TypeScript experience is required." }] },
    );
    expect(react.status).toBe("strong_match");
    expect(typescript.status).toBe("strong_match");
  });

  it("keeps vague technical requirements and generic-word overlap conservative", () => {
    const vague = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] },
      [{ ...direct, exactQuote: "Built modern frontend framework features in production." }],
      { ...req, sources: [{ sourceBlockId: "job:block:1", exactQuote: "Modern frontend framework experience required." }] },
    );
    expect(vague.status).toBe("no_evidence_provided");
  });

  it("normalizes multiword and dotted aliases before extracting tokens", () => {
    expect(extractTechnicalTokens("Next.js and React Testing Library")).toEqual(new Set(["nextjs", "react_testing_library"]));
    expect(extractTechnicalTokens("Nextjs with RTL")).toEqual(new Set(["nextjs", "react_testing_library"]));
  });

  it("treats conjunctions as incomplete until every quoted technology is covered", () => {
    const requirement = { ...req, sources: [{ sourceBlockId: "job:block:1", exactQuote: "React and TypeScript experience is required." }] };
    const reactOnly = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] },
      [{ ...direct, exactQuote: "Built React interfaces in production." }],
      requirement,
    );
    const both = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] },
      [{ ...direct, exactQuote: "Built React and TypeScript interfaces in production." }],
      requirement,
    );
    expect(reactOnly.status).toBe("partial_match");
    expect(both.status).toBe("strong_match");
  });

  it("allows an explicitly quoted disjunction to be directly satisfied by either technology", () => {
    const result = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "direct" }] },
      [{ ...direct, exactQuote: "Built Vue interfaces in production." }],
      { ...req, sources: [{ sourceBlockId: "job:block:1", exactQuote: "React or Vue experience is required." }] },
    );
    expect(result.status).toBe("strong_match");
  });

  it("allows transferable Partial only within explicit technology families", () => {
    const reactRequirement = { ...req, sources: [{ sourceBlockId: "job:block:1", exactQuote: "React experience is required." }] };
    const vue = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "strong_match", links: [{ evidenceId: "e1", relationship: "transferable" }] },
      [{ ...direct, exactQuote: "Built Vue interfaces in production." }],
      reactRequirement,
    );
    const python = validateAndDowngradeMatch(
      { requirementId: "r1", proposedStatus: "partial_match", links: [{ evidenceId: "e1", relationship: "transferable" }] },
      [{ ...direct, exactQuote: "Built Python frontend wallet delivery features in production." }],
      reactRequirement,
    );
    expect(vue.status).toBe("partial_match");
    expect(python.status).toBe("no_evidence_provided");
  });

  it("does not treat context words as technical terms", () => {
    expect(extractTechnicalTokens("Built production frontend wallet delivery and caching features.")).toEqual(new Set());
  });
});
