import { NextResponse } from "next/server";
import { z } from "zod";
import { extractEvidence } from "@/lib/ai/evidence";
import { ProviderResponseError, ProviderUnavailableError } from "@/lib/ai/provider";

const documentSchema = z.object({ id: z.string().min(1), title: z.string().min(1).max(120), kind: z.enum(["resume", "project", "notes"]), text: z.string().min(1).max(20_000) });
const requestSchema = z.object({ documents: z.array(documentSchema).min(1).max(6) }).superRefine(({ documents }, ctx) => { const projects = documents.filter((document) => document.kind === "project"); const projectCharacters = projects.reduce((sum, document) => sum + document.text.length, 0); if (projects.length > 5) ctx.addIssue({ code: "custom", message: "A profile can contain at most five projects." }); if (projectCharacters > 30_000) ctx.addIssue({ code: "custom", message: "Project text may not exceed 30,000 characters in total." }); });

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const result = await extractEvidence(input.documents);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ ok: false, error: { code: "invalid_input", message: "The request body must be valid JSON." } }, { status: 400 });
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: { code: "invalid_input", message: error.issues[0]?.message ?? "Invalid input." } }, { status: 400 });
    if (error instanceof ProviderUnavailableError) return NextResponse.json({ ok: false, error: { code: "provider_unavailable", message: error.message } }, { status: 503 });
    if (error instanceof ProviderResponseError) return NextResponse.json({ ok: false, error: { code: "structured_output_invalid", message: error.message } }, { status: 502 });
    return NextResponse.json({ ok: false, error: { code: "unknown", message: "Could not extract evidence. Please retry." } }, { status: 500 });
  }
}
