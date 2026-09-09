import { describe, expect, it } from "vitest";
import { evalCases } from "@/evals/cases";
import { aggregateEval, evalGateFailures, normalizeEvalConcept, scoreEval } from "@/evals/scorer";

const caseById = (id: string) => evalCases.find((item) => item.id === id)!;

function expectedStatuses(caseData: typeof evalCases[number]) {
  return Object.fromEntries(Object.entries(caseData.allowedStatuses).map(([concept, statuses]) => [concept, statuses[0]!])) as Record<string, typeof caseData.allowedStatuses[string][number]>;
}

function passingScore(id: string) {
  const item = caseById(id);
  return scoreEval(item, {
    concepts: item.requirementConcepts,
    quotes: item.expectedQuotes,
    evidenceQuotes: item.expectedQuotes,
    statuses: expectedStatuses(item),
    blocker: item.constraint === "blocker" ? "blocker" : item.constraint === "unknown" ? "unknown" : "none",
    recommendation: item.recommendations[0]!,
  });
}

describe("offline eval dataset and scorer", () => {
  it("contains the required synthetic grounding cases", () => {
    expect(evalCases.length).toBeGreaterThanOrEqual(15);
    expect(new Set(evalCases.map((item) => item.id)).size).toBe(evalCases.length);
    expect(evalCases.map((item) => item.id)).toEqual(expect.arrayContaining([
      "react-typescript-direct", "vue-direct", "nextjs-direct", "wallet-libraries",
      "test-tooling", "tanstack-query", "duration-gap", "graphql-none",
      "authorization-unknown", "authorization-blocker", "prompt-injection-jd",
    ]));
    expect(evalCases.every((item) => item.expectedQuotes.every((quote) =>
      item.documents.some((document) => document.text.replace(/\s+/g, " ").includes(quote.replace(/\s+/g, " "))),
    ))).toBe(true);
  });

  it("passes deterministic outputs only with evidence recall and an explicit blocker", () => {
    const summary = aggregateEval([passingScore("direct-react"), passingScore("authorization-blocker")]);
    expect(summary).toEqual(expect.objectContaining({
      requirementRecall: 1,
      quoteValidity: 1,
      evidenceQuoteRecall: 1,
      statusAgreement: 1,
      explicitBlockerRecall: 1,
      falseBlocker: 0,
      unsupportedMatchCount: 0,
      recommendationAgreement: 1,
    }));
    expect(evalGateFailures(summary)).toEqual([]);
  });

  it("fails the gates for false Strong, false Partial, or an invalid evidence ID", () => {
    const item = caseById("irrelevant-python");
    const strong = scoreEval(item, {
      concepts: item.requirementConcepts,
      quotes: [],
      evidenceQuotes: [],
      statuses: { React: "strong_match" },
      blocker: "none",
      recommendation: "skip",
      invalidEvidenceIdCount: 1,
    });
    const partial = scoreEval(item, {
      concepts: item.requirementConcepts,
      quotes: [],
      evidenceQuotes: [],
      statuses: { React: "partial_match" },
      blocker: "none",
      recommendation: "skip",
    });
    expect(strong.falseStrong.irrelevantEvidence).toBe(1);
    expect(partial.falsePartial.irrelevantEvidence).toBe(1);
    expect(evalGateFailures(aggregateEval([passingScore("authorization-blocker"), strong]))).toEqual(expect.arrayContaining([
      "invalid evidence IDs must be 0",
      "unsupported match count must be 0",
    ]));
    expect(evalGateFailures(aggregateEval([passingScore("authorization-blocker"), partial]))).toContain("unsupported match count must be 0");
  });

  it("does not classify No Evidence or a permitted Vue-to-React Partial as unsupported", () => {
    const noEvidence = scoreEval(caseById("graphql-none"), {
      concepts: ["GraphQL"], quotes: [], evidenceQuotes: [], statuses: { GraphQL: "no_evidence_provided" }, blocker: "none", recommendation: "skip",
    });
    const transferable = scoreEval(caseById("transferable-vue"), {
      concepts: ["React"], quotes: ["Built Vue interfaces in production."], evidenceQuotes: ["Built Vue interfaces in production."], statuses: { React: "partial_match" }, blocker: "none", recommendation: "consider",
    });
    expect(noEvidence.unsupportedMatchCount).toBe(0);
    expect(transferable.unsupportedMatchCount).toBe(0);
  });

  it("normalizes work authorization wording consistently for concepts and statuses", () => {
    const item = {
      ...caseById("authorization-blocker"),
      requirementConcepts: ["work authorization"],
      allowedStatuses: { "work authorization": ["conflicting_evidence" as const] },
    };
    const score = scoreEval(item, {
      concepts: ["right to work"],
      quotes: item.expectedQuotes,
      evidenceQuotes: item.expectedQuotes,
      statuses: { "authorized to work": "conflicting_evidence" },
      blocker: "blocker",
      recommendation: "skip",
    });
    expect(normalizeEvalConcept("work authorization")).toBe("work authorization");
    expect(normalizeEvalConcept("authorized to work")).toBe("work authorization");
    expect(normalizeEvalConcept("right to work")).toBe("work authorization");
    expect(score).toEqual(expect.objectContaining({ requirementRecall: 1, statusAgreement: 1 }));
  });

  it("scores blocker true positives and rejects both missed and false blockers", () => {
    const confirmed = passingScore("authorization-blocker");
    const unknown = passingScore("authorization-unknown");
    const falseBlocker = scoreEval(caseById("direct-react"), {
      concepts: ["React", "3 years"],
      quotes: ["3 years building React applications in production."],
      evidenceQuotes: ["3 years building React applications in production."],
      statuses: { React: "strong_match", "3 years": "strong_match" },
      blocker: "blocker",
      recommendation: "apply",
    });
    const missed = scoreEval(caseById("authorization-blocker"), {
      concepts: ["work authorization", "Singapore"],
      quotes: ["I am not authorized to work in Singapore."],
      evidenceQuotes: ["I am not authorized to work in Singapore."],
      statuses: { "work authorization": "conflicting_evidence", Singapore: "conflicting_evidence" },
      blocker: "unknown",
      recommendation: "skip",
    });
    expect(confirmed).toEqual(expect.objectContaining({ trueBlocker: 1, correctlyDetectedBlocker: 1, missedBlocker: 0 }));
    expect(unknown).toEqual(expect.objectContaining({ trueBlocker: 0, falseBlocker: 0, trueNonBlocker: 1 }));
    expect(evalGateFailures(aggregateEval([confirmed, falseBlocker]))).toContain("false blocker count must be 0");
    expect(evalGateFailures(aggregateEval([missed]))).toContain("explicit blocker recall must be 100%");
    expect(evalGateFailures(aggregateEval([unknown]))).toContain("live eval must include an explicit blocker case");
  });
});
