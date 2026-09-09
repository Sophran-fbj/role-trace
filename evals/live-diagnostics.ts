import {
  ProviderRateLimitError,
  ProviderResponseError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "@/lib/ai/provider";
import { EvidenceExtractionEmptyError } from "@/lib/ai/evidence";

export type EvalFailureStage =
  | "evidence_request"
  | "evidence_empty"
  | "requirement_extraction"
  | "evidence_validation"
  | "matching";

export type EvalFailureRecord = {
  caseId: string;
  stage: EvalFailureStage;
  errorName: string;
  message: string;
};

export class StagedEvalError extends Error {
  constructor(
    readonly stage: EvalFailureStage,
    readonly cause: unknown,
  ) {
    super("Live eval pipeline stage failed.");
    this.name = "StagedEvalError";
  }
}

const safeErrorNames = new Set([
  "Error",
  "SyntaxError",
  "ZodError",
  "ProviderUnavailableError",
  "ProviderTimeoutError",
  "ProviderRateLimitError",
  "ProviderResponseError",
  "EvidenceExtractionEmptyError",
]);

export function parseEvalCaseIds(value: string | undefined) {
  return [...new Set((value ?? "").split(",").map((id) => id.trim()).filter(Boolean))];
}

export function selectEvalCases<T extends { id: string }>(cases: T[], requestedIds: string[]) {
  if (!requestedIds.length) return cases;
  const available = new Set(cases.map((item) => item.id));
  const unknown = requestedIds.filter((id) => !available.has(id));
  if (unknown.length) throw new Error(`Unknown eval case IDs: ${unknown.join(", ")}`);
  const requested = new Set(requestedIds);
  return cases.filter((item) => requested.has(item.id));
}

export function safeErrorName(error: unknown) {
  if (error instanceof ProviderTimeoutError) return "ProviderTimeoutError";
  if (error instanceof ProviderRateLimitError) return "ProviderRateLimitError";
  if (error instanceof ProviderResponseError) return "ProviderResponseError";
  if (error instanceof ProviderUnavailableError) return "ProviderUnavailableError";
  const name = error instanceof Error ? error.name : "Error";
  return safeErrorNames.has(name) ? name : "Error";
}

export function sanitizedErrorMessage(error: unknown) {
  if (error instanceof ProviderTimeoutError) return "Provider request timed out.";
  if (error instanceof ProviderRateLimitError) return "Provider rate limited the request.";
  if (error instanceof ProviderResponseError || error instanceof SyntaxError || safeErrorName(error) === "ZodError")
    return "Provider returned invalid structured output.";
  if (error instanceof ProviderUnavailableError) return "Provider is unavailable.";
  if (error instanceof EvidenceExtractionEmptyError) return "Evidence extraction returned no valid evidence after one retry.";
  return "Pipeline stage failed without a safe diagnostic message.";
}

export function toEvalFailureRecord(caseId: string, error: unknown): EvalFailureRecord {
  const staged = error instanceof StagedEvalError ? error : undefined;
  const cause = staged?.cause ?? error;
  return {
    caseId,
    stage: staged?.stage ?? "matching",
    errorName: safeErrorName(cause),
    message: sanitizedErrorMessage(cause),
  };
}

export function formatEvalFailure(failure: EvalFailureRecord) {
  return `${failure.caseId} [${failure.stage}] ${failure.errorName}: ${failure.message}`;
}
