import { describe, expect, it } from "vitest";
import { evalCases } from "@/evals/cases";
import { scoreEval } from "@/evals/scorer";

describe("offline eval dataset and scorer", () => {
  it("contains the ten required synthetic cases", () => {
    expect(evalCases).toHaveLength(10);
    expect(new Set(evalCases.map((item) => item.id)).size).toBe(10);
  });
  it("scores deterministic outputs without a model call", () => {
    const item = evalCases[0]!;
    const result = scoreEval(item, { concepts: item.requirementConcepts, quotes: item.expectedQuotes, statuses: { React: "strong_match" }, blocker: "none", recommendation: "apply" });
    expect(result).toEqual(expect.objectContaining({ requirementRecall: 1, quoteValidity: 1, blockerAccuracy: 1, recommendationAgreement: 1 }));
  });
});
