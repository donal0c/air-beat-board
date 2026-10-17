// Automated accessibility audit with axe-core at desktop and phone widths.
// Fails on any WCAG 2.0/2.1 A or AA violation.

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 375, height: 812 }
];

for (const viewport of VIEWPORTS) {
  test(`no WCAG A/AA violations at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(() => {
      localStorage.removeItem("air-beat-board:session:v1");
      localStorage.removeItem("air-beat-board:hint-dismissed");
    });
    await page.goto("/");
    await expect(page.locator("[data-testid='beat-grid'] .cell")).toHaveCount(40);

    // Open the Sound tab too so its controls are audited.
    await page.locator("[data-inspector-tab='sound']").click();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const summary = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => n.target.join(" "))
    }));
    expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
  });
}
