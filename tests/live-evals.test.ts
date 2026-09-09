import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { describe, expect, it } from "vitest";
import type { CandidateProfile, MatchStatus } from "@/domain/types";
import { analyzeJob, getAnalysisFailureStage } from "@/lib/ai/analysis";
import { EvidenceExtractionEmptyError, extractEvidence } from "@/lib/ai/evidence";
import { getProviderMetadata } from "@/lib/ai/provider";
import { evalCases, type EvalCase } from "@/evals/cases";
import { aggregateEval, evalGateFailures, normalizeEvalConcept, scoreEval, type EvalScore } from "@/evals/scorer";
import {
  StagedEvalError,
  formatEvalFailure,
  parseEvalCaseIds,
  selectEvalCases,
  toEvalFailureRecord,
  type EvalFailureRecord,
} from "@/evals/live-diagnostics";

const runLive = process.env.RUN_LIVE_EVAL === "true";
if (runLive) {
  const nodeEnvironment = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "development" });
  loadEnvConfig(process.cwd(), true);
  if (nodeEnvironment === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
  else Object.assign(process.env, { NODE_ENV: nodeEnvironment });
}

function normalizedTokens(value: string) {
  return normalizeEvalConcept(value).match(/[a-z0-9]+/g)?.map((token) => token.replace(/(?:ation|ed|ing)$/i, "")) ?? [];
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
  const extracted = await extractEvidence(documents, "en").catch((error) => {
    throw new StagedEvalError(
      error instanceof EvidenceExtractionEmptyError ? "evidence_empty" : "evidence_request",
      error,
    );
  });
  const evidence = extracted.evidence.map((item) => ({ ...item, reviewState: "verified" as const }));
  if (caseData.claimHallucination?.length) {
    const source = extracted.sourceBlocks.find((block) => block.text.includes("Built Python services in production."));
    if (!source) throw new StagedEvalError("evidence_validation", new Error("Missing eval adversarial source block."));
    evidence.push({ id: `${caseData.id}:claim-only`, claim: "5 years of React production experience", sourceBlockId: source.id, exactQuote: "Built Python services in production.", type: "production_experience", strength: "direct", tags: ["React"], reviewState: "verified" });
  }
  const now = new Date().toISOString();
  const profile: CandidateProfile = { id: `${caseData.id}:profile`, documents, sourceBlocks: extracted.sourceBlocks, evidence, createdAt: now, updatedAt: now, schemaVersion: 3 };
  const analysis = await analyzeJob({ job: { id: `${caseData.id}:job`, rawText: caseData.jobDescription, createdAt: now }, profile, outputLanguage: "en" }).catch((error) => {
    throw new StagedEvalError(getAnalysisFailureStage(error) ?? "matching", error);
  });
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

async function writeReport(
  provider: { provider: string; model: string },
  startedAt: number,
  scores: EvalScore[],
  summary: ReturnType<typeof aggregateEval>,
  caseFailures: EvalFailureRecord[],
  acceptanceFailures: string[],
  diagnosticMode: boolean,
  selectedCaseIds: string[],
) {
  if (process.env.WRITE_EVAL_REPORT !== "true") return;
  const directory = process.env.EVAL_REPORT_DIR?.trim() || path.join(process.cwd(), "eval-results");
  await mkdir(directory, { recursive: true });
  const filename = `roletrace-live-eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(path.join(directory, filename), JSON.stringify({ provider, elapsedMs: Date.now() - startedAt, scores, summary, caseFailures, acceptanceFailures, diagnosticMode, selectedCaseIds }, null, 2), "utf8");
  console.info(`[RoleTrace eval] wrote ${path.join(directory, filename)}`);
}

describe.skipIf(!runLive)("live synthetic evals (explicit opt-in; incurs model cost)", () => {
  it("enforces grounding and recommendation acceptance gates", async () => {
    if (process.env.ENABLE_REAL_AI !== "true") throw new Error("Set ENABLE_REAL_AI=true before running live evals.");
    const requestedCaseIds = parseEvalCaseIds(process.env.EVAL_CASE_IDS);
    const selectedCases = selectEvalCases(evalCases, requestedCaseIds);
    const diagnosticMode = process.env.EVAL_DIAGNOSTIC === "true" || requestedCaseIds.length > 0;
    const startedAt = Date.now();
    const scores: EvalScore[] = [];
    const caseFailures: EvalFailureRecord[] = [];
    const recordResult = (caseData: EvalCase, result: PromiseSettledResult<EvalScore>) => {
      if (result.status === "fulfilled") scores.push(result.value);
      else caseFailures.push(toEvalFailureRecord(caseData.id, result.reason));
    };
    if (diagnosticMode) {
      for (const caseData of selectedCases) {
        try {
          scores.push(await evaluateCase(caseData));
        } catch (error) {
          caseFailures.push(toEvalFailureRecord(caseData.id, error));
        }
      }
    } else {
      for (let index = 0; index < selectedCases.length; index += 2) {
        const cases = selectedCases.slice(index, index + 2);
        const results = await Promise.allSettled(cases.map(evaluateCase));
        results.forEach((result, offset) => recordResult(cases[offset]!, result));
      }
    }
    const summary = aggregateEval(scores, caseFailures.length);
    const acceptanceFailures = diagnosticMode ? [] : evalGateFailures(summary);
    const failures = [...caseFailures.map(formatEvalFailure), ...acceptanceFailures];
    const provider = getProviderMetadata();
    console.table(scores.map((score) => ({ case: score.id, requirementRecall: score.requirementRecall, quoteValidity: score.quoteValidity, evidenceQuoteRecall: score.evidenceQuoteRecall, statusAgreement: score.statusAgreement, falseStrong: Object.values(score.falseStrong).reduce((total, count) => total + count, 0), falsePartial: Object.values(score.falsePartial).reduce((total, count) => total + count, 0), unsupportedMatches: score.unsupportedMatchCount, invalidEvidenceIds: score.invalidEvidenceIdCount, trueBlocker: score.trueBlocker, falseBlocker: score.falseBlocker, recommendation: score.recommendationAgreement })));
    if (caseFailures.length) console.table(caseFailures);
    console.info("[RoleTrace eval] summary", JSON.stringify({ provider, elapsedMs: Date.now() - startedAt, diagnosticMode, selectedCaseIds: selectedCases.map((item) => item.id), ...summary, caseFailures, acceptanceFailures }));
    await writeReport(provider, startedAt, scores, summary, caseFailures, acceptanceFailures, diagnosticMode, selectedCases.map((item) => item.id));
    if (diagnosticMode) {
      console.info("[RoleTrace eval] diagnostic mode: full acceptance gates were not evaluated.");
      expect(failures, `Live eval diagnostic pipeline failures: ${failures.join("; ")}`).toEqual([]);
      return;
    }
    expect(failures, `Live eval acceptance failures: ${failures.join("; ")}`).toEqual([]);
  }, 600_000);
});
