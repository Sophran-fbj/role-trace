import { describe, expect, it } from "vitest";
import { ProviderResponseError, ProviderTimeoutError } from "@/lib/ai/provider";
import { EvidenceExtractionEmptyError } from "@/lib/ai/evidence";
import {
  StagedEvalError,
  parseEvalCaseIds,
  selectEvalCases,
  toEvalFailureRecord,
} from "@/evals/live-diagnostics";

describe("live eval diagnostics", () => {
  it("parses a stable case subset and rejects unknown case IDs before pipeline work", () => {
    const cases = [{ id: "react" }, { id: "vue" }];
    expect(parseEvalCaseIds(" react,vue,react, ")).toEqual(["react", "vue"]);
    expect(selectEvalCases(cases, ["vue"])).toEqual([{ id: "vue" }]);
    expect(() => selectEvalCases(cases, ["missing"])).toThrow("Unknown eval case IDs: missing");
  });

  it("records a safe stage, error name, and message without exposing raw error text", () => {
    const provider = toEvalFailureRecord(
      "case-1",
      new StagedEvalError("matching", new ProviderResponseError("raw model response: candidate resume text")),
    );
    const empty = toEvalFailureRecord(
      "case-2",
      new StagedEvalError("evidence_empty", new EvidenceExtractionEmptyError()),
    );
    const unknown = toEvalFailureRecord(
      "case-3",
      new StagedEvalError("evidence_request", new Error("sk-live-secret and full source material")),
    );
    expect(provider).toEqual({ caseId: "case-1", stage: "matching", errorName: "ProviderResponseError", message: "Provider returned invalid structured output." });
    expect(empty).toEqual({ caseId: "case-2", stage: "evidence_empty", errorName: "EvidenceExtractionEmptyError", message: "Evidence extraction returned no valid evidence after one retry." });
    expect(unknown).toEqual({ caseId: "case-3", stage: "evidence_request", errorName: "Error", message: "Pipeline stage failed without a safe diagnostic message." });
    expect(JSON.stringify([provider, empty, unknown])).not.toContain("sk-live-secret");
    expect(toEvalFailureRecord("case-4", new StagedEvalError("requirement_extraction", new ProviderTimeoutError()))).toMatchObject({ stage: "requirement_extraction", message: "Provider request timed out." });
  });
});
