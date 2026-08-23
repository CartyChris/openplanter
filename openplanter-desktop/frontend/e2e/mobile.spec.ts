import { test, expect } from "@playwright/test";

const viewports = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

for (const viewport of viewports) {
  test.describe(`portrait ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("keeps primary controls visible without horizontal page overflow", async ({ page }) => {
      await page.goto("/");

      await expect(page.locator(".chat-pane")).toBeVisible();
      await expect(page.locator(".input-bar textarea")).toBeVisible();
      await expect(page.locator(".mobile-dock")).toBeVisible();
      await expect(page.locator('[data-action="new-session"]')).toBeVisible();
      await expect(page.locator('[data-action="threads"]')).toBeVisible();
      await expect(page.locator('[data-action="research"]')).toBeVisible();
      await expect(page.locator('[data-action="settings"]')).toBeVisible();
      await expect(page.locator('[data-action="more"]')).toBeVisible();

      const hasHorizontalPageOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > window.innerWidth + 1 ||
        document.body.scrollWidth > window.innerWidth + 1
      );
      expect(hasHorizontalPageOverflow).toBe(false);
    });

    test("opens Threads and exposes New Session in portrait", async ({ page }) => {
      await page.goto("/");
      await page.locator('[data-action="threads"]').click();
      const sheet = page.locator('.mobile-sheet[aria-label="Threads"]');
      await expect(sheet).toBeVisible();
      await expect(sheet.locator(".mobile-new-session")).toBeVisible();
      await expect(sheet.locator(".mobile-session-list")).toBeVisible();
    });

    test("opens the full-screen Control Center with all six tabs", async ({ page }) => {
      await page.goto("/");
      await page.locator('[data-action="settings"]').click();
      await expect(page.locator(".settings-panel-v2")).toBeVisible();
      await expect(page.locator(".settings-tab")).toHaveCount(6);
      await expect(page.getByRole("button", { name: "Web", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Subagents", exact: true })).toBeVisible();
      await expect(page.getByText("works without Exa or Firecrawl keys").first()).toBeAttached();
    });
  });
}
