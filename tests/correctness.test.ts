import { describe, expect, it } from "vitest";
import { decideRecommendation } from "@/domain/recommendation";
import type { EvidenceItem, Match, Requirement } from "@/domain/types";
import {
  containsInternalReference,
  normalizeRequirements,
  reasonsFor,
} from "@/lib/ai/analysis";
import { validateAndDowngradeMatch } from "@/lib/grounding/validators";
import { analysisPreparationSchema } from "@/lib/ai/schemas";

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

  it("links compatible explicit professional duration as a partial match", () => {
    const req = requirement({
      label: "At least 2 years of professional frontend experience",
      category: "experience",
      sources: [{ sourceBlockId: "job:block:1", exactQuote: "At least 2 years of professional frontend experience" }],
    });
    const result = validateAndDowngradeMatch(
      proposal("no_evidence_provided"),
      [evidence({ claim: "Nine months as a frontend engineer", exactQuote: "January to September (9 months) as a Frontend Engineer." })],
      req,
    );
    expect(result.status).toBe("partial_match");
    expect(result.links).toEqual([{ evidenceId: evidence().id, relationship: "direct" }]);
    expect(result.gap).toContain("24 months");
    expect(result.gap).toContain("9 months");
    expect(result.gap).toContain("15-month");
  });

  it("allows a reliably parsed sufficient duration to remain strong", () => {
    const req = requirement({ label: "3+ years of production frontend experience", category: "experience", sources: [{ sourceBlockId: "job:block:1", exactQuote: "3+ years of production frontend experience" }] });
    const result = validateAndDowngradeMatch(
      proposal("strong_match", [{ evidenceId: evidence().id, relationship: "direct" }]),
      [evidence({ claim: "5 years of frontend production experience", exactQuote: "5 years of frontend production experience" })],
      req,
    );
    expect(result.status).toBe("strong_match");
  });

  it("keeps an unproven hard constraint unknown", () => {
    const req = requirement({ category: "work_authorization", label: "Authorization to work in a named region", mayBeHardConstraint: true });
    expect(validateAndDowngradeMatch(proposal("conflicting_evidence", [{ evidenceId: evidence().id, relationship: "direct" }]), [evidence({ type: "constraint_fact", exactQuote: "Available for remote work from another region." })], req).status).toBe("unknown");
  });

  it("accepts only a direct explicit restriction for a constraint conflict", () => {
    const req = requirement({ category: "work_authorization", label: "Authorization to work in Singapore", sources: [{ sourceBlockId: "job:block:1", exactQuote: "authorized to work in Singapore" }], mayBeHardConstraint: true });
    expect(validateAndDowngradeMatch(proposal("conflicting_evidence", [{ evidenceId: evidence().id, relationship: "direct" }]), [evidence({ type: "constraint_fact", exactQuote: "I am not authorized to work in Singapore." })], req).status).toBe("conflicting_evidence");
  });

  it("does not let an available arrangement satisfy a different location or work-authorization quote", () => {
    const req = requirement({ category: "work_authorization", sources: [{ sourceBlockId: "job:block:1", exactQuote: "Must be authorized to work in Germany." }], mayBeHardConstraint: true });
    const result = validateAndDowngradeMatch(
      proposal("strong_match", [{ evidenceId: evidence().id, relationship: "direct" }]),
      [evidence({ type: "constraint_fact", exactQuote: "Available for remote work from China." })],
      req,
    );
    expect(result.status).toBe("unknown");
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

  it("does not repeat a requirement already explained by an unresolved constraint", () => {
    const constrained = requirement({ id: "r-0", category: "work_authorization", label: "Work authorization", mayBeHardConstraint: true });
    const reasons = reasonsFor(
      "need_more_information",
      [constrained],
      [{ ...proposal("unknown"), requirementId: constrained.id, status: "unknown" }],
      [{ requirementId: constrained.id, status: "unresolved", detail: "Work authorization must be confirmed.", evidenceIds: [] }],
      "en",
    );
    expect(reasons).toEqual(["Work authorization must be confirmed."]);
  });
});

describe("requirement and copy safeguards", () => {
  it("derives work authorization constraints from category plus cited JD text", () => {
    const authorization = normalizeRequirements([
      requirement({ category: "work_authorization", mayBeHardConstraint: false, sources: [{ sourceBlockId: "job:block:1", exactQuote: "Candidates must have the right to work in Singapore." }] }),
    ], "en");
    const ungrounded = normalizeRequirements([
      requirement({ category: "work_authorization", mayBeHardConstraint: true, sources: [{ sourceBlockId: "job:block:1", exactQuote: "Experience with React is required." }] }),
    ], "en");
    expect(authorization[0]?.mayBeHardConstraint).toBe(true);
    expect(ungrounded[0]?.mayBeHardConstraint).toBe(false);
  });

  it("rejects emphasis without source-backed evidence", () => {
    expect(() => analysisPreparationSchema.parse({
      matches: [],
      emphasis: [{ title: "React", evidenceIds: [], requirementIds: ["r1"], rationale: "R", angle: "A", doNotClaim: "D" }],
      questions: [],
    })).toThrow();
  });
  it("splits independently verifiable performance and testing skills", () => {
    const result = normalizeRequirements([requirement({ label: "Frontend performance optimization and automated testing", sources: [{ sourceBlockId: "job:block:1", exactQuote: "Experience with frontend performance optimization and automated testing." }] })], "en");
    expect(result.map((item) => item.label)).toEqual(["Frontend performance optimization", "Automated frontend testing"]);
  });

  it("deduplicates split requirements with the same category, label, and citation", () => {
    const duplicated = ["first", "second"].map((id) => requirement({ id, label: "Frontend performance optimization and automated testing", sources: [{ sourceBlockId: "job:block:1", exactQuote: "Experience with frontend performance optimization and automated testing." }] }));
    expect(normalizeRequirements(duplicated, "en").map((item) => item.label)).toEqual(["Frontend performance optimization", "Automated frontend testing"]);
  });

  it("keeps distinct localized split labels when deduplicating", () => {
    const result = normalizeRequirements([
      requirement({ label: "性能优化和自动化测试", sources: [{ sourceBlockId: "job:block:1", exactQuote: "性能优化和自动化测试" }] }),
    ], "zh-CN");
    expect(result).toHaveLength(2);
  });

  it("removes a role title when its standalone technical skill is already required", () => {
    const result = normalizeRequirements([
      requirement({ id: "title", label: "React Developer" }),
      requirement({ id: "react", label: "React" }),
    ], "en");
    expect(result.map((item) => item.label)).toEqual(["React"]);
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
