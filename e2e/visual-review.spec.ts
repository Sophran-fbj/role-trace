import { expect, test } from "playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const review = resolve(process.cwd(), "review");

test("captures visual review states", async ({ page }) => {
  mkdirSync(review, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Know what your experience actually supports." })).toBeVisible();
  await page.screenshot({ path: resolve(review, "home-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Map a role to available evidence." })).toBeVisible();
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(review, "analyze-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "RoleTrace", exact: true }).click();
  await page.getByRole("button", { name: "Try sample" }).click();
  await expect(page.getByText("SAMPLE MODE")).toBeVisible();
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(review, "sample-report-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "View sources" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: resolve(review, "evidence-drawer-desktop.png"), fullPage: false });
  await page.getByRole("button", { name: "Close source details" }).click();

  await page.getByRole("button", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: "Evidence review" })).toBeVisible();
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(review, "evidence-review-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "Applications", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tracked applications in this browser." })).toBeVisible();
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(review, "saved-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "RoleTrace", exact: true }).click();
  await page.getByRole("button", { name: "Try sample" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(review, "sample-report-mobile.png"), fullPage: true });

  await page.getByRole("button", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: "Evidence review" })).toBeVisible();
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(review, "evidence-review-mobile.png"), fullPage: true });
});

test("captures Chinese control review", async ({ page }) => {
  mkdirSync(review, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator(".language-toggle button").first().click();
  await page.locator("nav button").first().click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(review, "profile-controls-zh.png"), fullPage: true });
  await page.locator("nav button").nth(1).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(review, "analyze-controls-zh.png"), fullPage: true });
  await page.locator("nav button").nth(2).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(review, "saved-controls-zh.png"), fullPage: true });
});
