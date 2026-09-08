import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { describe, expect, it } from "vitest";
import type { CandidateProfile, MatchStatus } from "@/domain/types";
import { analyzeJob } from "@/lib/ai/analysis";
import { extractEvidence } from "@/lib/ai/evidence";
import { getProviderMetadata } from "@/lib/ai/provider";
import { evalCases, type EvalCase } from "@/evals/cases";
import { aggregateEval, evalGateFailures, scoreEval, type EvalScore } from "@/evals/scorer";

const runLive = process.env.RUN_LIVE_EVAL === "true";
if (runLive) {
  const nodeEnvironment = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "development" });
  loadEnvConfig(process.cwd(), true);
  if (nodeEnvironment === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
  else Object.assign(process.env, { NODE_ENV: nodeEnvironment });
}

function normalizedTokens(value: string) {
  return value.toLowerCase().match(/[a-z0-9]+/g)?.map((token) => token.replace(/(?:ation|ed|ing)$/i, "")) ?? [];
}

function matchForConcept(concepts: Array<{ id: string; label: string; sources: Array<{ exactQuote: string }> }>, matches: Array<{ requirementId: string; status: MatchStatus }>, concept: string) {
  const expectedTokens = normalizedTokens(concept);
  const requirement = concepts.find((item) =>
    [item.label, ...item.sources.map((source) => source.exactQuote)].some((value) => {
      const available = normalizedTokens(value);
      return expectedTokens.every((token) => available.some((candidate) => candidate.includes(token) || token.includes(candidate)));
    }),
  );
  return requirement ? matches.find((match) => match.requirementId === requirement.id)?.status ?? "no_evidence_provided" : "no_evidence_provided";
}

async function evaluateCase(caseData: EvalCase): Promise<EvalScore> {
  const documents = caseData.documents.map((document, index) => ({ ...document, id: `${caseData.id}:document:${index + 1}` }));
  const extracted = await extractEvidence(documents, "en");
  const evidence = extracted.evidence.map((item) => ({ ...item, reviewState: "verified" as const }));
  if (caseData.expectedQuotes.length > 0 && !evidence.length)
    throw new Error(`Evidence extraction returned no evidence for ${caseData.id}.`);
  if (caseData.claimHallucination?.length) {
    const source = extracted.sourceBlocks.find((block) => block.text.includes("Built Python services in production."));
    if (!source) throw new Error(`Missing adversarial source block for ${caseData.id}.`);
    evidence.push({ id: `${caseData.id}:claim-only`, claim: "5 years of React production experience", sourceBlockId: source.id, exactQuote: "Built Python services in production.", type: "production_experience", strength: "direct", tags: ["React"], reviewState: "verified" });
  }
  const now = new Date().toISOString();
  const profile: CandidateProfile = { id: `${caseData.id}:profile`, documents, sourceBlocks: extracted.sourceBlocks, evidence, createdAt: now, updatedAt: now, schemaVersion: 3 };
  const analysis = await analyzeJob({ job: { id: `${caseData.id}:job`, rawText: caseData.jobDescription, createdAt: now }, profile, outputLanguage: "en" });
  const statuses = Object.fromEntries(caseData.requirementConcepts.map((concept) => [
    concept,
    matchForConcept(analysis.requirements, analysis.matches, concept),
  ])) as Record<string, MatchStatus>;
  const evidenceIds = new Set(analysis.profileSnapshot.evidence.map((item) => item.id));
  return scoreEval(caseData, {
    concepts: analysis.requirements.flatMap((requirement) => [requirement.label, ...requirement.sources.map((source) => source.exactQuote)]),
    quotes: [...analysis.requirements.flatMap((requirement) => requirement.sources.map((source) => source.exactQuote)), ...analysis.profileSnapshot.evidence.map((item) => item.exactQuote)],
    evidenceQuotes: extracted.evidence.map((item) => item.exactQuote),
    statuses,
    invalidEvidenceIdCount: analysis.matches.flatMap((match) => match.links).filter((link) => !evidenceIds.has(link.evidenceId)).length,
    blocker: analysis.constraints.some((constraint) => constraint.status === "confirmed") ? "blocker" : analysis.constraints.some((constraint) => constraint.status === "unresolved") ? "unknown" : "none",
    recommendation: analysis.recommendation,
  });
}

async function writeReport(provider: { provider: string; model: string }, startedAt: number, scores: EvalScore[], summary: ReturnType<typeof aggregateEval>, failures: string[]) {
  if (process.env.WRITE_EVAL_REPORT !== "true") return;
  const directory = process.env.EVAL_REPORT_DIR?.trim() || path.join(process.cwd(), "eval-results");
  await mkdir(directory, { recursive: true });
  const filename = `roletrace-live-eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(path.join(directory, filename), JSON.stringify({ provider, elapsedMs: Date.now() - startedAt, scores, summary, failures }, null, 2), "utf8");
  console.info(`[RoleTrace eval] wrote ${path.join(directory, filename)}`);
}

describe.skipIf(!runLive)("live synthetic evals (explicit opt-in; incurs model cost)", () => {
  it("enforces grounding and recommendation acceptance gates", async () => {
    if (process.env.ENABLE_REAL_AI !== "true") throw new Error("Set ENABLE_REAL_AI=true before running live evals.");
    const startedAt = Date.now();
    const scores: EvalScore[] = [];
    const caseFailures: string[] = [];
    for (let index = 0; index < evalCases.length; index += 2) {
      const results = await Promise.allSettled(evalCases.slice(index, index + 2).map(evaluateCase));
      results.forEach((result, offset) => {
        if (result.status === "fulfilled") scores.push(result.value);
        else caseFailures.push(`${evalCases[index + offset]!.id}: ${result.reason instanceof Error ? result.reason.constructor.name : "pipeline failure"}`);
      });
    }
    const summary = aggregateEval(scores, caseFailures.length);
    const failures = [...caseFailures, ...evalGateFailures(summary)];
    const provider = getProviderMetadata();
    console.table(scores.map((score) => ({ case: score.id, requirementRecall: score.requirementRecall, quoteValidity: score.quoteValidity, evidenceQuoteRecall: score.evidenceQuoteRecall, statusAgreement: score.statusAgreement, falseStrong: Object.values(score.falseStrong).reduce((total, count) => total + count, 0), falsePartial: Object.values(score.falsePartial).reduce((total, count) => total + count, 0), unsupportedMatches: score.unsupportedMatchCount, invalidEvidenceIds: score.invalidEvidenceIdCount, trueBlocker: score.trueBlocker, falseBlocker: score.falseBlocker, recommendation: score.recommendationAgreement })));
    console.info("[RoleTrace eval] summary", JSON.stringify({ provider, elapsedMs: Date.now() - startedAt, ...summary, caseFailures, failures }));
    await writeReport(provider, startedAt, scores, summary, failures);
    expect(failures, `Live eval acceptance failures: ${failures.join("; ")}`).toEqual([]);
  }, 600_000);
});
