import { afterEach, describe, expect, it } from "vitest";
import { POST as analyze } from "@/app/api/analysis/route";
import { POST as extractEvidence } from "@/app/api/evidence/extract/route";

const originalEnabled = process.env.ENABLE_REAL_AI;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.ENABLE_REAL_AI;
  else process.env.ENABLE_REAL_AI = originalEnabled;
});

describe("public release API guards", () => {
  it("keeps real AI routes closed by default without reading provider configuration", async () => {
    delete process.env.ENABLE_REAL_AI;
    const response = await extractEvidence(
      new Request("http://localhost/api/evidence/extract", {
        method: "POST",
        headers: { "x-roletrace-language": "zh-CN" },
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "real_ai_disabled",
        message: "公开演示站未开放真实 AI 分析。你仍可完整体验示例模式。",
      },
    });
  });

  it("keeps analysis closed by default with the same public-demo response", async () => {
    delete process.env.ENABLE_REAL_AI;
    const response = await analyze(
      new Request("http://localhost/api/analysis", {
        method: "POST",
        headers: { "x-applylens-language": "zh-CN" },
      }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toEqual({
      code: "real_ai_disabled",
      message: "公开演示站未开放真实 AI 分析。你仍可完整体验示例模式。",
    });
  });

  it("rejects oversized JD input before a model request", async () => {
    process.env.ENABLE_REAL_AI = "true";
    const response = await analyze(
      new Request("http://localhost/api/analysis", {
        method: "POST",
        headers: { "content-type": "application/json", "x-roletrace-language": "zh-CN" },
        body: JSON.stringify({
          outputLanguage: "zh-CN",
          job: { id: "job", rawText: "x".repeat(20_001), createdAt: "2026-09-08" },
          profile: { id: "profile", documents: [], evidence: [], sourceBlocks: [], createdAt: "2026-09-08", updatedAt: "2026-09-08", schemaVersion: 1 },
        }),
      }),
    );
    expect(response.status).toBe(413);
    expect((await response.json()).error).toEqual({
      code: "input_too_long",
      message: "输入内容过长，请缩短后重试。",
    });
  });
});
