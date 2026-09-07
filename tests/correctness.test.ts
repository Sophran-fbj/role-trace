import { describe, expect, it } from "vitest";
import { decideRecommendation } from "@/domain/recommendation";
import type { EvidenceItem, Match, Requirement } from "@/domain/types";
import {
  containsInternalReference,
  normalizeRequirements,
  reasonsFor,
} from "@/lib/ai/analysis";
import { validateAndDowngradeMatch } from "@/lib/grounding/validators";

const requirement = (overrides: Partial<Requirement> = {}): Requirement => ({
  id: "requirement-12345678-1234-1234-1234-123456789abc",
  label: "React",
  category: "technical_skill",
  priority: "core",
  sources: [{ sourceBlockId: "job:block:1", exactQuote: "React" }],
  mayBeHardConstraint: false,
  ...overrides,
});
const evidence = (overrides: Partial<EvidenceItem> = {}): EvidenceItem => ({
  id: "ce79d470-1234-1234-1234-123456789abc",
  claim: "Built React features",
  sourceBlockId: "resume:block:1",
  exactQuote: "Built React features in production.",
  type: "production_experience",
  strength: "direct",
  tags: [],
  reviewState: "verified",
  ...overrides,
});
const proposal = (status: Match["status"], links: Match["links"] = []): Omit<Match, "status"> => ({
  requirementId: requirement().id,
  proposedStatus: status,
  links,
  gap: null,
  rationale: null,
});

describe("match status invariants", () => {
  it.each(["1+ years", "2+ years", "3+ years"])("keeps nine months partial for %s", (years) => {
    const req = requirement({ label: `${years} of production React`, category: "experience", sources: [{ sourceBlockId: "job:block:1", exactQuote: `${years} of production React` }] });
    const result = validateAndDowngradeMatch(proposal("strong_match", [{ evidenceId: evidence().id, relationship: "direct" }]), [evidence({ exactQuote: "Nine months building React features in production." })], req);
    expect(result.status).toBe("partial_match");
  });

  it("converts unsupported GraphQL and non-hard unknowns to no evidence", () => {
    expect(validateAndDowngradeMatch(proposal("unknown"), [], requirement({ label: "GraphQL" })).status).toBe("no_evidence_provided");
  });

  it("keeps an unproven hard constraint unknown", () => {
    const req = requirement({ category: "work_authorization", label: "Authorization to work in a named region", mayBeHardConstraint: true });
    expect(validateAndDowngradeMatch(proposal("conflicting_evidence", [{ evidenceId: evidence().id, relationship: "direct" }]), [evidence({ type: "constraint_fact", exactQuote: "Available for remote work from another region." })], req).status).toBe("unknown");
  });

  it("accepts only a direct explicit restriction for a constraint conflict", () => {
    const req = requirement({ category: "work_authorization", label: "Authorization to work in Singapore", sources: [{ sourceBlockId: "job:block:1", exactQuote: "authorized to work in Singapore" }], mayBeHardConstraint: true });
    expect(validateAndDowngradeMatch(proposal("conflicting_evidence", [{ evidenceId: evidence().id, relationship: "direct" }]), [evidence({ type: "constraint_fact", exactQuote: "I am not authorized to work in Singapore." })], req).status).toBe("conflicting_evidence");
  });
});

describe("recommendation weighting and reasons", () => {
  const matchesFor = (statuses: Match["status"][]): Match[] => statuses.map((status, index) => ({ ...proposal(status, status === "strong_match" || status === "partial_match" ? [{ evidenceId: evidence().id, relationship: "direct" }] : []), requirementId: `r-${index}`, status }));
  const requirements = Array.from({ length: 4 }, (_, index) => requirement({ id: `r-${index}` }));

  it("does not score partial core requirements as full support", () => {
    expect(decideRecommendation(requirements, matchesFor(["strong_match", "partial_match", "partial_match", "strong_match"]), [])).toBe("consider");
  });

  it("keeps strong support plus a modest gap eligible for apply", () => {
    const five = [...requirements, requirement({ id: "r-4" })];
    expect(decideRecommendation(five, matchesFor(["strong_match", "strong_match", "strong_match", "strong_match", "partial_match"]), [])).toBe("apply");
  });

  it("puts a core missing-evidence reason before positive support for consider", () => {
    const reasons = reasonsFor("consider", requirements.slice(0, 2), matchesFor(["strong_match", "no_evidence_provided"]), [], "en");
    expect(reasons[0]).toContain("no supporting evidence");
    expect(reasons.some((reason) => reason.includes("direct evidence"))).toBe(true);
  });
});

describe("requirement and copy safeguards", () => {
  it("splits independently verifiable performance and testing skills", () => {
    const result = normalizeRequirements([requirement({ label: "Frontend performance optimization and automated testing", sources: [{ sourceBlockId: "job:block:1", exactQuote: "Experience with frontend performance optimization and automated testing." }] })], "en");
    expect(result.map((item) => item.label)).toEqual(["Frontend performance optimization", "Automated frontend testing"]);
  });

  it("merges authorization and sponsorship context into one requirement", () => {
    const result = normalizeRequirements([
      requirement({ id: "auth", category: "work_authorization", label: "Existing work authorization", mayBeHardConstraint: true, sources: [{ sourceBlockId: "job:block:1", exactQuote: "Must have work authorization." }] }),
      requirement({ id: "sponsor", category: "work_authorization", label: "No visa sponsorship", mayBeHardConstraint: true, sources: [{ sourceBlockId: "job:block:1", exactQuote: "We do not provide visa sponsorship." }] }),
    ], "en");
    expect(result).toHaveLength(1);
    expect(result[0].sources).toHaveLength(2);
  });

  it("detects full and shortened internal IDs in user-facing copy", () => {
    const id = evidence().id;
    expect(containsInternalReference(`Evidence ${id}`, [id])).toBe(true);
    expect(containsInternalReference("ce79d470 directly proves this", [id])).toBe(true);
    expect(containsInternalReference("Direct evidence supports this", [id])).toBe(false);
  });
});
