import { z } from "zod";

export const SOURCE_LIMITS = {
  resumeCharacters: 20_000,
  jobDescriptionCharacters: 20_000,
  projectCharacters: 10_000,
  totalProjectCharacters: 30_000,
  projects: 5,
} as const;

export const sourceDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  kind: z.enum(["resume", "project", "notes"]),
  text: z.string().min(1).max(SOURCE_LIMITS.resumeCharacters),
});

export const sourceDocumentsSchema = z
  .array(sourceDocumentSchema)
  .min(1)
  .max(SOURCE_LIMITS.projects + 1)
  .superRefine((documents, ctx) => {
    const projects = documents.filter((document) => document.kind === "project");
    const projectCharacters = projects.reduce((sum, document) => sum + document.text.length, 0);
    if (projects.length > SOURCE_LIMITS.projects) {
      ctx.addIssue({ code: "custom", message: "A profile can contain at most five projects." });
    }
    if (projects.some((document) => document.text.length > SOURCE_LIMITS.projectCharacters)) {
      ctx.addIssue({ code: "custom", message: "Each project description may not exceed 10,000 characters.", params: { errorCode: "input_too_long" } });
    }
    if (projectCharacters > SOURCE_LIMITS.totalProjectCharacters) {
      ctx.addIssue({ code: "custom", message: "Project text may not exceed 30,000 characters in total.", params: { errorCode: "input_too_long" } });
    }
  });
