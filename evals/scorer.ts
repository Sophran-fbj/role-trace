import type { MatchStatus, Recommendation } from "@/domain/types";
import type { EvalCase } from "@/evals/cases";

export type EvalOutput = {
  concepts: string[];
  quotes: string[];
  evidenceQuotes: string[];
  statuses: Record<string, MatchStatus>;
  blocker: "none" | "unknown" | "blocker";
  recommendation: Recommendation;
  invalidEvidenceIdCount?: number;
};

export type EvalScore = {
  id: string;
  requirementFound: number;
  requirementTotal: number;
  requirementRecall: number;
  quoteValid: number;
  quoteTotal: number;
  quoteValidity: number;
  expectedQuoteFound: number;
  expectedQuoteTotal: number;
  evidenceQuoteRecall: number;
  statusCorrect: number;
  statusTotal: number;
  statusAgreement: number;
  confusionMatrix: Record<string, number>;
  falseStrong: { noEvidence: number; irrelevantEvidence: number; claimHallucination: number };
  falsePartial: { noEvidence: number; irrelevantEvidence: number; claimHallucination: number };
  unsupportedMatchCount: number;
  invalidEvidenceIdCount: number;
  trueBlocker: number;
  correctlyDetectedBlocker: number;
  falseBlocker: number;
  missedBlocker: number;
  trueNonBlocker: number;
  recommendationCorrect: number;
  recommendationAgreement: number;
};

const authorizationConcept = /\b(?:work authorization|authorized to work|right to work|work permit)\b/i;

export function normalizeEvalConcept(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return authorizationConcept.test(normalized) ? "work authorization" : normalized;
}

const normalizeQuote = (value: string) => value.replace(/\s+/g, " ").trim();

function statusFor(output: EvalOutput, concept: string) {
  const normalizedConcept = normalizeEvalConcept(concept);
  return Object.entries(output.statuses).find(([key]) => normalizeEvalConcept(key) === normalizedConcept)?.[1] ?? "no_evidence_provided";
}

function expectedQuoteWasExtracted(expectedQuote: string, evidenceQuotes: string[]) {
  const expected = normalizeQuote(expectedQuote);
  return Boolean(expected) && evidenceQuotes.some((quote) => {
    const extracted = normalizeQuote(quote);
    // Extraction may retain a complete annotated quote or a continuous clause
    // from it, but it must never introduce text outside the original quote.
    return Boolean(extracted) && (expected.includes(extracted) || extracted.includes(expected));
  });
}

export function scoreEval(caseData: EvalCase, output: EvalOutput): EvalScore {
  const expected = caseData.requirementConcepts.map(normalizeEvalConcept);
  const concepts = output.concepts.map(normalizeEvalConcept);
  const requirementFound = expected.filter((concept) => concepts.some((found) => found.includes(concept) || concept.includes(found))).length;
  const quoteValid = output.quotes.filter((quote) => caseData.documents.some((document) => normalizeQuote(document.text).includes(normalizeQuote(quote))) || normalizeQuote(caseData.jobDescription).includes(normalizeQuote(quote))).length;
  let statusCorrect = 0;
  const confusionMatrix = Object.entries(output.statuses).reduce<Record<string, number>>((matrix, [concept, status]) => {
    const normalizedConcept = normalizeEvalConcept(concept);
    const expectedStatuses = Object.entries(caseData.allowedStatuses).find(
      ([expectedConcept]) => normalizeEvalConcept(expectedConcept) === normalizedConcept,
    )?.[1] ?? [];
    const correct = expectedStatuses.includes(status);
    if (correct) statusCorrect += 1;
    const key = `${correct ? "correct" : "incorrect"}:${status}`;
    matrix[key] = (matrix[key] ?? 0) + 1;
    return matrix;
  }, {});
  const countUnsupported = (conceptsToCheck: string[] | undefined, status: "strong_match" | "partial_match") =>
    (conceptsToCheck ?? []).filter((concept) => statusFor(output, concept) === status).length;
  const falseStrong = {
    noEvidence: countUnsupported(caseData.noEvidence, "strong_match"),
    irrelevantEvidence: countUnsupported(caseData.irrelevantEvidence, "strong_match"),
    claimHallucination: countUnsupported(caseData.claimHallucination, "strong_match"),
  };
  const falsePartial = {
    noEvidence: countUnsupported(caseData.noEvidence, "partial_match"),
    irrelevantEvidence: countUnsupported(caseData.irrelevantEvidence, "partial_match"),
    claimHallucination: countUnsupported(caseData.claimHallucination, "partial_match"),
  };
  const unsupportedConcepts = new Set([
    ...(caseData.noEvidence ?? []),
    ...(caseData.irrelevantEvidence ?? []),
    ...(caseData.claimHallucination ?? []),
  ]);
  const unsupportedMatchCount = [...unsupportedConcepts].filter((concept) => {
    const status = statusFor(output, concept);
    return status === "strong_match" || status === "partial_match";
  }).length;
  const requirementTotal = expected.length;
  const quoteTotal = output.quotes.length;
  const expectedQuoteTotal = caseData.expectedQuotes.length;
  const expectedQuoteFound = caseData.expectedQuotes.filter((quote) => expectedQuoteWasExtracted(quote, output.evidenceQuotes)).length;
  const statusTotal = Object.keys(output.statuses).length;
  const trueBlocker = Number(caseData.constraint === "blocker");
  const correctlyDetectedBlocker = Number(trueBlocker && output.blocker === "blocker");
  const falseBlocker = Number(!trueBlocker && output.blocker === "blocker");
  const missedBlocker = Number(trueBlocker && output.blocker !== "blocker");
  const trueNonBlocker = Number(!trueBlocker && output.blocker !== "blocker");
  const recommendationCorrect = Number(caseData.recommendations.includes(output.recommendation));
  return {
    id: caseData.id,
    requirementFound,
    requirementTotal,
    requirementRecall: requirementFound / Math.max(1, requirementTotal),
    quoteValid,
    quoteTotal,
    quoteValidity: quoteValid / Math.max(1, quoteTotal),
    expectedQuoteFound,
    expectedQuoteTotal,
    evidenceQuoteRecall: expectedQuoteFound / Math.max(1, expectedQuoteTotal),
    statusCorrect,
    statusTotal,
    statusAgreement: statusCorrect / Math.max(1, statusTotal),
    confusionMatrix,
    falseStrong,
    falsePartial,
    unsupportedMatchCount,
    invalidEvidenceIdCount: output.invalidEvidenceIdCount ?? 0,
    trueBlocker,
    correctlyDetectedBlocker,
    falseBlocker,
    missedBlocker,
    trueNonBlocker,
    recommendationCorrect,
    recommendationAgreement: recommendationCorrect,
  };
}

export function aggregateEval(scores: EvalScore[], pipelineFailureCount = 0) {
  const sum = <Key extends keyof EvalScore>(key: Key) => scores.reduce<number>((total, score) => total + (typeof score[key] === "number" ? score[key] : 0), 0);
  const requirementFound = sum("requirementFound");
  const requirementTotal = sum("requirementTotal");
  const quoteValid = sum("quoteValid");
  const quoteTotal = sum("quoteTotal");
  const expectedQuoteFound = sum("expectedQuoteFound");
  const expectedQuoteTotal = sum("expectedQuoteTotal");
  const statusCorrect = sum("statusCorrect");
  const statusTotal = sum("statusTotal");
  const falseStrong = scores.reduce((total, score) => ({ noEvidence: total.noEvidence + score.falseStrong.noEvidence, irrelevantEvidence: total.irrelevantEvidence + score.falseStrong.irrelevantEvidence, claimHallucination: total.claimHallucination + score.falseStrong.claimHallucination }), { noEvidence: 0, irrelevantEvidence: 0, claimHallucination: 0 });
  const falsePartial = scores.reduce((total, score) => ({ noEvidence: total.noEvidence + score.falsePartial.noEvidence, irrelevantEvidence: total.irrelevantEvidence + score.falsePartial.irrelevantEvidence, claimHallucination: total.claimHallucination + score.falsePartial.claimHallucination }), { noEvidence: 0, irrelevantEvidence: 0, claimHallucination: 0 });
  const confusionMatrix = scores.reduce<Record<string, number>>((total, score) => {
    for (const [key, count] of Object.entries(score.confusionMatrix)) total[key] = (total[key] ?? 0) + count;
    return total;
  }, {});
  const trueBlocker = sum("trueBlocker");
  const correctlyDetectedBlocker = sum("correctlyDetectedBlocker");
  const falseBlocker = sum("falseBlocker");
  return {
    cases: scores.length,
    pipelineFailureCount,
    requirementRecall: requirementFound / Math.max(1, requirementTotal),
    quoteValidity: quoteValid / Math.max(1, quoteTotal),
    evidenceQuoteRecall: expectedQuoteFound / Math.max(1, expectedQuoteTotal),
    statusAgreement: statusCorrect / Math.max(1, statusTotal),
    falseStrong,
    falsePartial,
    unsupportedMatchCount: sum("unsupportedMatchCount"),
    invalidEvidenceIdCount: sum("invalidEvidenceIdCount"),
    trueBlocker,
    correctlyDetectedBlocker,
    falseBlocker,
    missedBlocker: sum("missedBlocker"),
    trueNonBlocker: sum("trueNonBlocker"),
    explicitBlockerRecall: trueBlocker ? correctlyDetectedBlocker / trueBlocker : undefined,
    blockerPrecision: correctlyDetectedBlocker / Math.max(1, correctlyDetectedBlocker + falseBlocker),
    recommendationAgreement: sum("recommendationCorrect") / Math.max(1, scores.length),
    confusionMatrix,
  };
}

export const evalThresholds = {
  quoteValidity: 1,
  evidenceQuoteRecall: 0.9,
  invalidEvidenceIdCount: 0,
  unsupportedMatchCount: 0,
  explicitBlockerRecall: 1,
  falseBlockerCount: 0,
  requirementRecall: 0.9,
  statusAgreement: 0.8,
  recommendationAgreement: 0.8,
} as const;

export function evalGateFailures(summary: ReturnType<typeof aggregateEval>) {
  return [
    summary.pipelineFailureCount !== 0 && "pipeline failure count must be 0",
    summary.quoteValidity < evalThresholds.quoteValidity && "quote validity must be 100%",
    summary.evidenceQuoteRecall < evalThresholds.evidenceQuoteRecall && "evidence quote recall must be at least 90%",
    summary.invalidEvidenceIdCount !== evalThresholds.invalidEvidenceIdCount && "invalid evidence IDs must be 0",
    summary.unsupportedMatchCount !== evalThresholds.unsupportedMatchCount && "unsupported match count must be 0",
    summary.trueBlocker === 0 && "live eval must include an explicit blocker case",
    summary.explicitBlockerRecall !== evalThresholds.explicitBlockerRecall && "explicit blocker recall must be 100%",
    summary.falseBlocker !== evalThresholds.falseBlockerCount && "false blocker count must be 0",
    summary.requirementRecall < evalThresholds.requirementRecall && "requirement recall must be at least 90%",
    summary.statusAgreement < evalThresholds.statusAgreement && "status agreement must be at least 80%",
    summary.recommendationAgreement < evalThresholds.recommendationAgreement && "recommendation agreement must be at least 80%",
  ].filter(Boolean) as string[];
}
