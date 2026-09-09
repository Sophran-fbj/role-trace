import { expect, test } from "playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const screenshots = resolve(process.cwd(), "docs/screenshots");

test("captures safe portfolio views from Sample Mode", async ({ page }) => {
  mkdirSync(screenshots, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Try sample" }).click();
  await expect(page.getByText("SAMPLE MODE")).toBeVisible();
  await page.screenshot({ path: resolve(screenshots, "sample-report-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: "Evidence review" })).toBeVisible();
  await page.screenshot({ path: resolve(screenshots, "evidence-review-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "RoleTrace home" }).click();
  await page.getByRole("button", { name: "Try sample" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText("SAMPLE MODE")).toBeVisible();
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await page.screenshot({ path: resolve(screenshots, "sample-report-mobile.png"), fullPage: true });

  await page.getByRole("button", { name: "Applications", exact: true }).click();
  await expect(page.getByText("No tracked applications yet. Analyze a real job to save one.")).toBeVisible();
  await page.screenshot({ path: resolve(screenshots, "saved-applications.png"), fullPage: true });
});
