import { NextResponse } from "next/server";
import { z } from "zod";
import { extractEvidence } from "@/lib/ai/evidence";
import {
  ProviderResponseError,
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "@/lib/ai/provider";
import { getCopy, outputLanguageSchema, type OutputLanguage } from "@/lib/i18n";
import { isRealAiEnabled } from "@/lib/runtime/feature-flags";

const documentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  kind: z.enum(["resume", "project", "notes"]),
  text: z.string().min(1).max(20_000),
});
const requestSchema = z
  .object({
    documents: z.array(documentSchema).min(1).max(6),
    outputLanguage: outputLanguageSchema,
  })
  .superRefine(({ documents }, ctx) => {
    const projects = documents.filter(
      (document) => document.kind === "project",
    );
    const projectCharacters = projects.reduce(
      (sum, document) => sum + document.text.length,
      0,
    );
    if (projects.length > 5) {
      ctx.addIssue({
        code: "custom",
        message: "A profile can contain at most five projects.",
      });
    }
    if (projectCharacters > 30_000) {
      ctx.addIssue({
        code: "custom",
        message: "Project text may not exceed 30,000 characters in total.",
        params: { errorCode: "input_too_long" },
      });
    }
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
    const result = await extractEvidence(input.documents, outputLanguage);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const errors = getCopy(outputLanguage).errors;
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      const tooLong = error instanceof z.ZodError && error.issues.some(
        (issue) =>
          issue.code === "too_big" ||
          (issue.code === "custom" && issue.params?.errorCode === "input_too_long"),
      );
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
      { ok: false, error: { code: "unknown", message: errors.extract } },
      { status: 500 },
    );
  }
}
