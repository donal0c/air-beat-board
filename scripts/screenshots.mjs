// Retake the README screenshots with headless Chromium.
//
//   node scripts/screenshots.mjs [baseURL]
//
// Writes assets/screenshots/desktop-board.png (whole workspace at 1440x900),
// instrument-panel.png (the board close up) and phone.png (375x812).

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:4176";
const dir = "assets/screenshots";
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();

async function open(width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    localStorage.removeItem("air-beat-board:session:v1");
    localStorage.setItem("air-beat-board:hint-dismissed", "1");
  });
  await page.goto(`${base}/`);
  await page.waitForSelector("[data-testid='beat-grid'] .cell");
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(400);
  return page;
}

const desktop = await open(1440, 900);
await desktop.locator("[data-testid='cell-2-3']").click();
await desktop.waitForTimeout(400); // let the selection ring transition settle
await desktop.screenshot({ path: `${dir}/desktop-board.png` });
await desktop.locator(".board-shell").screenshot({ path: `${dir}/instrument-panel.png` });
await desktop.close();

const phone = await open(375, 812);
await phone.screenshot({ path: `${dir}/phone.png` });
await phone.close();

await browser.close();
console.log(`wrote ${dir}/desktop-board.png, instrument-panel.png, phone.png`);
