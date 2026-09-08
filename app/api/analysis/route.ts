import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeJob } from "@/lib/ai/analysis";
import {
  ProviderResponseError,
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "@/lib/ai/provider";
import { getCopy, outputLanguageSchema, type OutputLanguage } from "@/lib/i18n";
import { isRealAiEnabled } from "@/lib/runtime/feature-flags";
import { sourceDocumentsSchema, SOURCE_LIMITS } from "@/lib/validation/source-documents";

const evidenceSchema = z.object({
  id: z.string().min(1),
  claim: z.string(),
  sourceBlockId: z.string(),
  exactQuote: z.string(),
  type: z.enum([
    "production_experience",
    "project_experience",
    "work_responsibility",
    "measurable_outcome",
    "domain_experience",
    "education_or_certification",
    "constraint_fact",
    "self_asserted_skill",
    "other",
  ]),
  strength: z.enum(["direct", "transferable", "weak"]),
  tags: z.array(z.string()),
  reviewState: z.enum(["pending", "verified", "edited", "excluded"]),
});
const requestSchema = z.object({
  job: z.object({
    id: z.string().min(1),
    title: z.string().max(160).optional(),
    company: z.string().max(160).optional(),
    rawText: z.string().min(100).max(SOURCE_LIMITS.jobDescriptionCharacters),
    createdAt: z.string().min(1),
  }),
  profile: z.object({
    id: z.string().min(1),
    documents: sourceDocumentsSchema,
    evidence: z.array(evidenceSchema).min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    schemaVersion: z.number(),
    sourceBlocks: z.array(
      z.object({
        id: z.string(),
        documentId: z.string(),
        index: z.number(),
        heading: z.string().optional(),
        text: z.string(),
      }),
    ),
  }),
  verifiedOnly: z.boolean().optional(),
  outputLanguage: outputLanguageSchema,
});

export async function POST(request: Request) {
  let outputLanguage: OutputLanguage = outputLanguageSchema.safeParse(
    request.headers.get("x-roletrace-language") ??
      request.headers.get("x-applylens-language"),
  ).data ?? "zh-CN";
  try {
    if (!isRealAiEnabled()) {
      return NextResponse.json(
        { ok: false, error: { code: "real_ai_disabled", message: getCopy(outputLanguage).errors.realAiDisabled } },
        { status: 403 },
      );
    }
    const input = requestSchema.parse(await request.json());
    outputLanguage = input.outputLanguage;
    return NextResponse.json({ ok: true, data: await analyzeJob(input) });
  } catch (error) {
    const errors = getCopy(outputLanguage).errors;
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      const tooLong = error instanceof z.ZodError && error.issues.some((issue) => issue.code === "too_big" || (issue.code === "custom" && issue.params?.errorCode === "input_too_long"));
      return NextResponse.json(
        {
          ok: false,
          error: { code: tooLong ? "input_too_long" : "invalid_input", message: tooLong ? errors.inputTooLong : errors.invalidInput },
        },
        { status: tooLong ? 413 : 400 },
      );
    }
    if (error instanceof ProviderTimeoutError) {
      return NextResponse.json({ ok: false, error: { code: "provider_timeout", message: errors.providerTimeout } }, { status: 504 });
    }
    if (error instanceof ProviderRateLimitError) {
      return NextResponse.json({ ok: false, error: { code: "provider_rate_limited", message: errors.providerRateLimit } }, { status: 429 });
    }
    if (error instanceof ProviderUnavailableError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: errors.providerUnavailable,
          },
        },
        { status: 503 },
      );
    }
    if (error instanceof ProviderResponseError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "structured_output_invalid",
            message: errors.structuredOutput,
          },
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: { code: "analysis_failed", message: errors.analyze },
      },
      { status: 422 },
    );
  }
}
