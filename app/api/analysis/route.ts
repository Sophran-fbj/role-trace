import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeJob } from "@/lib/ai/analysis";
import { ProviderResponseError, ProviderUnavailableError } from "@/lib/ai/provider";

const evidenceSchema = z.object({ id: z.string().min(1), claim: z.string(), sourceBlockId: z.string(), exactQuote: z.string(), type: z.enum(["production_experience", "project_experience", "work_responsibility", "measurable_outcome", "domain_experience", "education_or_certification", "constraint_fact", "self_asserted_skill", "other"]), strength: z.enum(["direct", "transferable", "weak"]), tags: z.array(z.string()), reviewState: z.enum(["pending", "verified", "edited", "excluded"]) });
const documentSchema = z.object({ id: z.string().min(1), title: z.string().min(1), kind: z.enum(["resume", "project", "notes"]), text: z.string().min(1).max(20_000) });
const requestSchema = z.object({ job: z.object({ id: z.string().min(1), title: z.string().max(160).optional(), company: z.string().max(160).optional(), rawText: z.string().min(100).max(20_000), createdAt: z.string().min(1) }), profile: z.object({ id: z.string().min(1), documents: z.array(documentSchema).min(1).max(6), evidence: z.array(evidenceSchema).min(1), createdAt: z.string().min(1), updatedAt: z.string().min(1), schemaVersion: z.number(), sourceBlocks: z.array(z.object({ id: z.string(), documentId: z.string(), index: z.number(), heading: z.string().optional(), text: z.string() })) }), verifiedOnly: z.boolean().optional() });

export async function POST(request: Request) {
  try { return NextResponse.json({ ok: true, data: await analyzeJob(requestSchema.parse(await request.json())) }); }
  catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) return NextResponse.json({ ok: false, error: { code: "invalid_input", message: error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid input." : "The request body must be valid JSON." } }, { status: 400 });
    if (error instanceof ProviderUnavailableError) return NextResponse.json({ ok: false, error: { code: "provider_unavailable", message: error.message } }, { status: 503 });
    if (error instanceof ProviderResponseError) return NextResponse.json({ ok: false, error: { code: "structured_output_invalid", message: error.message } }, { status: 502 });
    const message = error instanceof Error ? error.message : "Could not analyze this job.";
    return NextResponse.json({ ok: false, error: { code: "analysis_failed", message } }, { status: 422 });
  }
}
