import { describe, expect, it } from "vitest";
import { evalCases } from "@/evals/cases";
import { aggregateEval, evalGateFailures, scoreEval } from "@/evals/scorer";

describe("offline eval dataset and scorer", () => {
  it("contains the required synthetic grounding cases", () => {
    expect(evalCases.length).toBeGreaterThanOrEqual(15);
    expect(new Set(evalCases.map((item) => item.id)).size).toBe(evalCases.length);
    expect(evalCases.map((item) => item.id)).toEqual(expect.arrayContaining([
      "react-typescript-direct", "vue-direct", "nextjs-direct", "wallet-libraries",
      "test-tooling", "tanstack-query", "duration-gap", "graphql-none",
      "authorization-unknown", "authorization-blocker", "prompt-injection-jd",
    ]));
  });
  it("scores deterministic outputs without a model call", () => {
    const item = evalCases[0]!;
    const result = scoreEval(item, { concepts: item.requirementConcepts, quotes: item.expectedQuotes, statuses: { React: "strong_match" }, blocker: "none", recommendation: "apply" });
    expect(result).toEqual(expect.objectContaining({ requirementRecall: 1, quoteValidity: 1, statusAgreement: 1, blockerAccuracy: 1, recommendationAgreement: 1 }));
    expect(evalGateFailures(aggregateEval([result]))).toEqual([]);
  });

  it("fails the acceptance gates for a false Strong or invalid evidence ID", () => {
    const item = evalCases.find((caseData) => caseData.id === "irrelevant-python")!;
    const result = scoreEval(item, { concepts: item.requirementConcepts, quotes: [], statuses: { React: "strong_match" }, blocker: "none", recommendation: "skip", invalidEvidenceIdCount: 1 });
    expect(evalGateFailures(aggregateEval([result]))).toEqual(expect.arrayContaining([
      "invalid evidence IDs must be 0",
      "false Strong count must be 0",
    ]));
  });
});
