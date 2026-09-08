import type { MatchStatus, Recommendation } from "@/domain/types";
import type { EvalCase } from "@/evals/cases";

export type EvalOutput = { concepts: string[]; quotes: string[]; statuses: Record<string, MatchStatus>; blocker: "none" | "unknown" | "blocker"; recommendation: Recommendation };

export function scoreEval(caseData: EvalCase, output: EvalOutput) {
  const expected = new Set(caseData.requirementConcepts.map((value) => value.toLowerCase()));
  const found = new Set(output.concepts.map((value) => value.toLowerCase()));
  const requirementRecall = [...expected].filter((value) => found.has(value)).length / Math.max(1, expected.size);
  const quoteValidity = output.quotes.filter((quote) => caseData.documents.some((document) => document.text.includes(quote)) || caseData.jobDescription.includes(quote)).length / Math.max(1, output.quotes.length);
  const confusion = Object.entries(output.statuses).reduce<Record<string, number>>((matrix, [concept, status]) => {
    const expectedStatuses = caseData.allowedStatuses[concept] ?? caseData.allowedStatuses[concept.toLowerCase()] ?? [];
    const key = `${expectedStatuses.includes(status) ? "correct" : "incorrect"}:${status}`;
    matrix[key] = (matrix[key] ?? 0) + 1;
    return matrix;
  }, {});
  return { requirementRecall, quoteValidity, confusionMatrix: confusion, blockerAccuracy: Number(output.blocker === caseData.constraint), recommendationAgreement: Number(caseData.recommendations.includes(output.recommendation)) };
}
