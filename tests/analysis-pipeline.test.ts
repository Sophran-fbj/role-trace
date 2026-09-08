import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ requestStructured: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({ requestStructured: provider.requestStructured }));

import { analyzeJob } from "@/lib/ai/analysis";
import type { CandidateProfile } from "@/domain/types";

const profile: CandidateProfile = {
  id: "profile", createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z", schemaVersion: 3,
  documents: [{ id: "resume", title: "Resume", kind: "resume", text: "Built Python services in production." }],
  sourceBlocks: [],
  evidence: [{ id: "evidence-python", claim: "React expert with five years", sourceBlockId: "resume:block:1", exactQuote: "Built Python services in production.", type: "production_experience", strength: "direct", tags: ["React"], reviewState: "verified" }],
};

describe("analysis provider boundary", () => {
  beforeEach(() => provider.requestStructured.mockReset());

  it("cleans a model-proposed Strong match with a valid but irrelevant evidence ID", async () => {
    provider.requestStructured
      .mockResolvedValueOnce({ requirements: [{ label: "React", category: "technical_skill", priority: "core", sources: [{ sourceBlockId: "job:block:1", exactQuote: "React is required." }], mayBeHardConstraint: false, note: null }] })
      .mockImplementationOnce((params: { input: { requirements: Array<{ id: string }> } }) => Promise.resolve({ matches: [{ requirementId: params.input.requirements[0]!.id, proposedStatus: "strong_match", links: [{ evidenceId: "evidence-python", relationship: "direct" }], gap: null, rationale: "Strong." }], emphasis: [{ title: "Unsupported", evidenceIds: [], requirementIds: [params.input.requirements[0]!.id], rationale: "No evidence.", angle: "None", doNotClaim: "None" }], questions: [] }));
    const result = await analyzeJob({ job: { id: "job", rawText: "React is required.", createdAt: "2026-09-08T00:00:00.000Z" }, profile, outputLanguage: "en" });
    expect(result.matches[0]?.status).toBe("no_evidence_provided");
    expect(result.recommendation).not.toBe("apply");
    expect(result.emphasis).toEqual([]);
  });

  it("cleans nonexistent model evidence IDs instead of producing Strong", async () => {
    provider.requestStructured
      .mockResolvedValueOnce({ requirements: [{ label: "React", category: "technical_skill", priority: "core", sources: [{ sourceBlockId: "job:block:1", exactQuote: "React is required." }], mayBeHardConstraint: false, note: null }] })
      .mockResolvedValueOnce({ matches: [{ requirementId: "not-used", proposedStatus: "strong_match", links: [{ evidenceId: "not-real", relationship: "direct" }], gap: null, rationale: "Strong." }], emphasis: [], questions: [] });
    const result = await analyzeJob({ job: { id: "job", rawText: "React is required.", createdAt: "2026-09-08T00:00:00.000Z" }, profile, outputLanguage: "en" });
    expect(result.matches[0]?.status).toBe("no_evidence_provided");
  });
});
