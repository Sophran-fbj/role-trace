import { describe, expect, it } from "vitest";
import { analyzeJob } from "@/lib/ai/analysis";
import { extractEvidence } from "@/lib/ai/evidence";
import { evalCases } from "@/evals/cases";
import { scoreEval } from "@/evals/scorer";
import type { MatchStatus } from "@/domain/types";

const runLive = process.env.RUN_LIVE_EVAL === "true";

describe.skipIf(!runLive)("live synthetic evals (explicit opt-in; incurs model cost)", () => {
  it("runs the maintained cases through the real evidence and analysis pipelines", async () => {
    if (process.env.ENABLE_REAL_AI !== "true") {
      throw new Error("Set ENABLE_REAL_AI=true before running live evals.");
    }
    const scores = [];
    for (const caseData of evalCases) {
      const documents = caseData.documents.map((document, index) => ({
        ...document,
        id: `${caseData.id}:document:${index + 1}`,
      }));
      const extracted = await extractEvidence(documents, "en");
      const analysis = await analyzeJob({
        job: { id: `${caseData.id}:job`, rawText: caseData.jobDescription, createdAt: new Date().toISOString() },
        profile: {
          id: `${caseData.id}:profile`,
          documents,
          sourceBlocks: extracted.sourceBlocks,
          evidence: extracted.evidence,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          schemaVersion: 3,
        },
        outputLanguage: "en",
      });
      const statuses = Object.fromEntries(caseData.requirementConcepts.map((concept) => {
        const match = analysis.requirements
          .map((requirement) => ({ requirement, match: analysis.matches.find((item) => item.requirementId === requirement.id) }))
          .find(({ requirement }) => requirement.label.toLowerCase().includes(concept.toLowerCase()))?.match;
        return [concept, match?.status ?? "no_evidence_provided"] as const;
      })) as Record<string, MatchStatus>;
      scores.push(scoreEval(caseData, {
        concepts: analysis.requirements.map((requirement) => requirement.label),
        quotes: [
          ...analysis.requirements.flatMap((requirement) => requirement.sources.map((source) => source.exactQuote)),
          ...analysis.profileSnapshot.evidence.map((evidence) => evidence.exactQuote),
        ],
        statuses,
        blocker: analysis.constraints.some((constraint) => constraint.status === "confirmed")
          ? "blocker"
          : analysis.constraints.some((constraint) => constraint.status === "unresolved")
            ? "unknown"
            : "none",
        recommendation: analysis.recommendation,
      }));
    }
    console.info("[RoleTrace eval]", JSON.stringify(scores));
    expect(scores).toHaveLength(evalCases.length);
  }, 300_000);
});
