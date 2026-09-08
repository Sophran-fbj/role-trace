import type { MatchStatus, Recommendation } from "@/domain/types";
import type { EvalCase } from "@/evals/cases";

export type EvalOutput = { concepts: string[]; quotes: string[]; statuses: Record<string, MatchStatus>; blocker: "none" | "unknown" | "blocker"; recommendation: Recommendation; invalidEvidenceIdCount?: number };
export type EvalScore = { id: string; requirementFound: number; requirementTotal: number; requirementRecall: number; quoteValid: number; quoteTotal: number; quoteValidity: number; statusCorrect: number; statusTotal: number; statusAgreement: number; confusionMatrix: Record<string, number>; falseStrong: { noEvidence: number; irrelevantEvidence: number; claimHallucination: number }; invalidEvidenceIdCount: number; blockerExpected: number; blockerCorrect: number; blockerAccuracy: number; recommendationCorrect: number; recommendationAgreement: number };

const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function scoreEval(caseData: EvalCase, output: EvalOutput): EvalScore {
  const expected = caseData.requirementConcepts.map(normalized);
  const concepts = output.concepts.map(normalized);
  const requirementFound = expected.filter((concept) => concepts.some((found) => found.includes(concept) || concept.includes(found))).length;
  const quoteValid = output.quotes.filter((quote) => caseData.documents.some((document) => document.text.includes(quote)) || caseData.jobDescription.includes(quote)).length;
  let statusCorrect = 0;
  const confusionMatrix = Object.entries(output.statuses).reduce<Record<string, number>>((matrix, [concept, status]) => {
    const expectedStatuses = caseData.allowedStatuses[concept] ?? caseData.allowedStatuses[concept.toLowerCase()] ?? [];
    const correct = expectedStatuses.includes(status);
    if (correct) statusCorrect += 1;
    const key = `${correct ? "correct" : "incorrect"}:${status}`;
    matrix[key] = (matrix[key] ?? 0) + 1;
    return matrix;
  }, {});
  const falseStrongFor = (conceptsToCheck: string[] | undefined) => (conceptsToCheck ?? []).filter((concept) => output.statuses[concept] === "strong_match").length;
  const falseStrong = { noEvidence: falseStrongFor(caseData.noEvidence), irrelevantEvidence: falseStrongFor(caseData.irrelevantEvidence), claimHallucination: falseStrongFor(caseData.claimHallucination) };
  const requirementTotal = expected.length;
  const quoteTotal = output.quotes.length;
  const statusTotal = Object.keys(output.statuses).length;
  const blockerExpected = Number(caseData.constraint === "blocker");
  const blockerCorrect = Number(blockerExpected && output.blocker === "blocker");
  const recommendationCorrect = Number(caseData.recommendations.includes(output.recommendation));
  return { id: caseData.id, requirementFound, requirementTotal, requirementRecall: requirementFound / Math.max(1, requirementTotal), quoteValid, quoteTotal, quoteValidity: quoteValid / Math.max(1, quoteTotal), statusCorrect, statusTotal, statusAgreement: statusCorrect / Math.max(1, statusTotal), confusionMatrix, falseStrong, invalidEvidenceIdCount: output.invalidEvidenceIdCount ?? 0, blockerExpected, blockerCorrect, blockerAccuracy: blockerExpected ? blockerCorrect : 1, recommendationCorrect, recommendationAgreement: recommendationCorrect };
}

export function aggregateEval(scores: EvalScore[]) {
  const sum = <Key extends keyof EvalScore>(key: Key) => scores.reduce<number>((total, score) => total + (typeof score[key] === "number" ? score[key] : 0), 0);
  const requirementFound = sum("requirementFound");
  const requirementTotal = sum("requirementTotal");
  const quoteValid = sum("quoteValid");
  const quoteTotal = sum("quoteTotal");
  const statusCorrect = sum("statusCorrect");
  const statusTotal = sum("statusTotal");
  const falseStrong = scores.reduce((total, score) => ({ noEvidence: total.noEvidence + score.falseStrong.noEvidence, irrelevantEvidence: total.irrelevantEvidence + score.falseStrong.irrelevantEvidence, claimHallucination: total.claimHallucination + score.falseStrong.claimHallucination }), { noEvidence: 0, irrelevantEvidence: 0, claimHallucination: 0 });
  const confusionMatrix = scores.reduce<Record<string, number>>((total, score) => {
    for (const [key, count] of Object.entries(score.confusionMatrix)) total[key] = (total[key] ?? 0) + count;
    return total;
  }, {});
  const blockerExpected = sum("blockerExpected");
  return { cases: scores.length, requirementRecall: requirementFound / Math.max(1, requirementTotal), quoteValidity: quoteValid / Math.max(1, quoteTotal), statusAgreement: statusCorrect / Math.max(1, statusTotal), falseStrong, invalidEvidenceIdCount: sum("invalidEvidenceIdCount"), blockerAccuracy: blockerExpected ? sum("blockerCorrect") / blockerExpected : 1, recommendationAgreement: sum("recommendationCorrect") / Math.max(1, scores.length), confusionMatrix };
}

export const evalThresholds = { quoteValidity: 1, invalidEvidenceIdCount: 0, falseStrong: 0, blockerAccuracy: 1, requirementRecall: 0.85, statusAgreement: 0.8, recommendationAgreement: 0.8 } as const;

export function evalGateFailures(summary: ReturnType<typeof aggregateEval>) {
  const falseStrongTotal = summary.falseStrong.noEvidence + summary.falseStrong.irrelevantEvidence + summary.falseStrong.claimHallucination;
  return [
    summary.quoteValidity < evalThresholds.quoteValidity && "quote validity must be 100%",
    summary.invalidEvidenceIdCount !== evalThresholds.invalidEvidenceIdCount && "invalid evidence IDs must be 0",
    falseStrongTotal !== evalThresholds.falseStrong && "false Strong count must be 0",
    summary.blockerAccuracy < evalThresholds.blockerAccuracy && "explicit blocker accuracy must be 100%",
    summary.requirementRecall < evalThresholds.requirementRecall && "requirement recall must be at least 85%",
    summary.statusAgreement < evalThresholds.statusAgreement && "status agreement must be at least 80%",
    summary.recommendationAgreement < evalThresholds.recommendationAgreement && "recommendation agreement must be at least 80%",
  ].filter(Boolean) as string[];
}
