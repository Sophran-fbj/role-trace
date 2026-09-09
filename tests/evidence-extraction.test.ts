import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({
  getProviderMetadata: vi.fn(),
  requestStructured: vi.fn(),
}));
vi.mock("@/lib/ai/provider", () => provider);

import {
  EvidenceExtractionEmptyError,
  extractEvidence,
} from "@/lib/ai/evidence";

const documents = [{
  id: "resume",
  title: "Resume",
  kind: "resume" as const,
  text: "Built React interfaces in production.",
}];
const validProposal = {
  evidence: [{
    claim: "Built React interfaces",
    sourceBlockId: "resume:block:1",
    exactQuote: "Built React interfaces in production.",
    type: "production_experience" as const,
    strength: "direct" as const,
    tags: [],
  }],
};

describe("evidence extraction empty-result retry", () => {
  beforeEach(() => {
    provider.getProviderMetadata.mockReset().mockReturnValue({ model: "test-model" });
    provider.requestStructured.mockReset();
  });

  it("retries once when the model returns no evidence", async () => {
    provider.requestStructured.mockResolvedValueOnce({ evidence: [] }).mockResolvedValueOnce(validProposal);
    const result = await extractEvidence(documents, "en");
    expect(provider.requestStructured).toHaveBeenCalledTimes(2);
    expect(result.evidence).toHaveLength(1);
  });

  it("retries once when the first response is entirely discarded by source validation", async () => {
    provider.requestStructured
      .mockResolvedValueOnce({ evidence: [{ ...validProposal.evidence[0], sourceBlockId: "missing:block:1", exactQuote: "Invented evidence" }] })
      .mockResolvedValueOnce(validProposal);
    const result = await extractEvidence(documents, "en");
    expect(provider.requestStructured).toHaveBeenCalledTimes(2);
    expect(result.discarded).toBe(1);
  });

  it("fails normally after the one allowed empty-result retry", async () => {
    provider.requestStructured.mockResolvedValue({ evidence: [] });
    await expect(extractEvidence(documents, "en")).rejects.toBeInstanceOf(EvidenceExtractionEmptyError);
    expect(provider.requestStructured).toHaveBeenCalledTimes(2);
  });
});
