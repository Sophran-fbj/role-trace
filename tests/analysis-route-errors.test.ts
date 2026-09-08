import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProviderRateLimitError,
  ProviderResponseError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "@/lib/ai/provider";

const analysis = vi.hoisted(() => ({ analyzeJob: vi.fn() }));
vi.mock("@/lib/ai/analysis", () => ({ analyzeJob: analysis.analyzeJob }));

import { POST } from "@/app/api/analysis/route";

const originalEnabled = process.env.ENABLE_REAL_AI;
const request = () => new Request("http://localhost/api/analysis", {
  method: "POST",
  headers: { "content-type": "application/json", "x-roletrace-language": "en" },
  body: JSON.stringify({
    outputLanguage: "en",
    job: { id: "job", rawText: "React is required for this position. ".repeat(4), createdAt: "2026-09-08T00:00:00.000Z" },
    profile: {
      id: "profile", createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z", schemaVersion: 3,
      documents: [{ id: "resume", title: "Resume", kind: "resume", text: "Built React features in production." }],
      sourceBlocks: [],
      evidence: [{ id: "evidence", claim: "React", sourceBlockId: "resume:block:1", exactQuote: "Built React features in production.", type: "production_experience", strength: "direct", tags: [], reviewState: "verified" }],
    },
  }),
});

describe("analysis route provider failures", () => {
  beforeEach(() => {
    process.env.ENABLE_REAL_AI = "true";
    analysis.analyzeJob.mockReset();
  });
  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.ENABLE_REAL_AI;
    else process.env.ENABLE_REAL_AI = originalEnabled;
  });

  it.each([
    [new ProviderTimeoutError(), 504, "provider_timeout"],
    [new ProviderRateLimitError(), 429, "provider_rate_limited"],
    [new ProviderResponseError(), 502, "structured_output_invalid"],
    [new ProviderUnavailableError(), 503, "provider_unavailable"],
  ])("maps %s to a safe %i response", async (failure, status, code) => {
    analysis.analyzeJob.mockRejectedValueOnce(failure);
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });
});
