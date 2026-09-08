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
  await expect(page.getByText("Apply", { exact: true })).toBeVisible();
  await page.getByLabel("Application status").selectOption("applied");
  await expect(page.getByLabel("Application status")).toHaveValue("applied");

  await page.reload();
  await page.getByRole("button", { name: "Profile" }).click();
  await expect(page.getByLabel("Resume text")).toHaveValue("Built React features in production.");
  await expect(page.getByLabel("Project 1 title")).toHaveValue("Portfolio project");
  await expect(page.locator(".evidence .pill").filter({ hasText: "Verified" })).toBeVisible();
  await page.getByRole("button", { name: "Applications" }).click();

  const backupText = await page.evaluate(() => {
    const data = JSON.parse(window.localStorage.getItem("applylens.store") ?? "{}");
    return JSON.stringify({
      format: "applylens-backup",
      backupVersion: 1,
      exportedAt: "2026-09-08T12:00:00.000Z",
      appSchemaVersion: data.schemaVersion,
      data,
    });
  });
  const uploadBackup = async () => {
    await page.locator('input[type="file"]').setInputFiles({
      name: "applylens-backup-2026-09-08.json",
      mimeType: "application/json",
      buffer: Buffer.from(backupText),
    });
  };
  const beforeCancel = await page.evaluate(() => window.localStorage.getItem("applylens.store"));
  await uploadBackup();
  await expect(page.getByText("IMPORT PREVIEW")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(await page.evaluate(() => window.localStorage.getItem("applylens.store"))).toBe(beforeCancel);

  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Applications" }).click();
  await uploadBackup();
  await expect(page.getByText("IMPORT PREVIEW")).toBeVisible();
  await page.getByRole("button", { name: "Replace and import" }).click();
  await expect(page.getByText("Backup restored in this browser.")).toBeVisible();

  await page.getByRole("button", { name: "Profile" }).click();
  await expect(page.getByLabel("Resume text")).toHaveValue("Built React features in production.");
  await page.getByRole("button", { name: "Applications" }).click();
  await page.getByLabel("Filter status").selectOption("applied");
  await expect(page.getByRole("heading", { name: "Frontend Engineer" })).toBeVisible();
  await page.getByRole("button", { name: "Open report" }).click();
  await expect(page.getByText("Apply", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Application status")).toHaveValue("applied");

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 800 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { name: "Frontend Engineer" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
