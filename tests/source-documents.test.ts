import { describe, expect, it } from "vitest";
import { sourceDocumentsSchema, SOURCE_LIMITS } from "@/lib/validation/source-documents";

const resume = { id: "resume", title: "Resume", kind: "resume" as const, text: "Career history" };
const project = (text: string, id = "project") => ({ id, title: "Project", kind: "project" as const, text });

describe("source document input limits", () => {
  it.each([9_999, 10_000])("accepts a %i-character project description", (length) => {
    expect(sourceDocumentsSchema.safeParse([resume, project("x".repeat(length))]).success).toBe(true);
  });

  it("rejects a 10,001-character project description", () => {
    expect(sourceDocumentsSchema.safeParse([resume, project("x".repeat(SOURCE_LIMITS.projectCharacters + 1))]).success).toBe(false);
  });

  it("accepts 30,000 project characters but rejects a larger combined total", () => {
    const atLimit = [resume, project("x".repeat(10_000), "p1"), project("x".repeat(10_000), "p2"), project("x".repeat(10_000), "p3")];
    const overLimit = [...atLimit, project("x", "p4")];
    expect(sourceDocumentsSchema.safeParse(atLimit).success).toBe(true);
    expect(sourceDocumentsSchema.safeParse(overLimit).success).toBe(false);
  });

  it("rejects incomplete project records instead of silently excluding them", () => {
    expect(sourceDocumentsSchema.safeParse([resume, { id: "project", title: "", kind: "project", text: "Description" }]).success).toBe(false);
    expect(sourceDocumentsSchema.safeParse([resume, { id: "project", title: "Project", kind: "project", text: "" }]).success).toBe(false);
  });
});
