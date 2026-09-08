import { expect, test } from "playwright/test";

test("creates, saves, and restores a real profile and report with mocked AI", async ({ page }) => {
  let extractedProject: { id: string; title: string; kind: string; text: string } | undefined;
  await page.route("**/api/evidence/extract", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as { documents: Array<{ id: string; title: string; kind: string; text: string }> };
    const resume = body.documents[0];
    extractedProject = body.documents.find((document) => document.id !== resume.id);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          sourceBlocks: [{ id: `${resume.id}:block:1`, documentId: resume.id, index: 0, text: resume.text }],
          evidence: [{ id: "evidence-e2e", claim: "Built React features", sourceBlockId: `${resume.id}:block:1`, exactQuote: "Built React features in production.", type: "production_experience", strength: "direct", tags: ["React"], reviewState: "pending" }],
        },
      }),
    });
  });
  await page.route("**/api/analysis", async (route) => {
    const body = route.request().postDataJSON() as { job: { id: string; title?: string; company?: string; rawText: string; createdAt: string }; profile: { id: string; documents: unknown[]; sourceBlocks: unknown[]; evidence: unknown[]; updatedAt: string } };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          id: "analysis-e2e",
          job: body.job,
          profileUpdatedAt: body.profile.updatedAt,
          profileSnapshot: body.profile,
          requirements: [{ id: "requirement-e2e", label: "React", category: "technical_skill", priority: "core", sources: [{ sourceBlockId: "job:block:1", exactQuote: "React" }], mayBeHardConstraint: false, note: null }],
          matches: [{ requirementId: "requirement-e2e", proposedStatus: "strong_match", status: "strong_match", links: [{ evidenceId: "evidence-e2e", relationship: "direct" }], gap: null, rationale: "Direct production evidence." }],
          constraints: [],
          recommendation: "apply",
          reasons: ["React has direct evidence."],
          emphasis: [{ title: "React delivery", evidenceIds: ["evidence-e2e"], requirementIds: ["requirement-e2e"], rationale: "Source-backed", angle: "Describe delivery.", doNotClaim: "Do not add outcomes." }],
          questions: [],
          createdAt: "2026-09-08T00:00:00.000Z",
          schemaVersion: 2,
          ruleVersion: "e2e",
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Profile" }).click();
  await page.getByLabel("Resume text").fill("Built React features in production.");
  await page.getByRole("button", { name: "Add project" }).click();
  await page.getByLabel("Project 1 title").fill("Portfolio project");
  await page.getByLabel("Project description").fill("Built a personal project.");
  await page.getByRole("button", { name: "Extract evidence" }).click();
  expect(extractedProject).toMatchObject({ title: "Portfolio project", kind: "project", text: "Built a personal project." });
  await expect(page.getByRole("heading", { name: "Built React features" })).toBeVisible();
  await page.getByRole("button", { name: "Verify" }).click();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Saved locally in this browser.")).toBeVisible();

  await page.getByRole("button", { name: "Analyze" }).click();
  await page.getByLabel("Job title").fill("Frontend Engineer");
  await page.getByLabel("Company").fill("Example Company");
  await page.getByLabel("Job description").fill("React is required for this role. ".repeat(5));
  await page.getByRole("button", { name: "Analyze job" }).click();
  await expect(page.getByText("Worth applying")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Profile" }).click();
  await expect(page.getByLabel("Resume text")).toHaveValue("Built React features in production.");
  await expect(page.getByLabel("Project 1 title")).toHaveValue("Portfolio project");
  await expect(page.locator(".evidence .pill").filter({ hasText: "Verified" })).toBeVisible();
  await page.getByRole("button", { name: "Saved reports" }).click();
  await page.getByRole("button", { name: "Open report" }).click();
  await expect(page.getByText("Worth applying")).toBeVisible();
});
