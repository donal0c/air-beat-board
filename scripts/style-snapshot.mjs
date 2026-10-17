// Snapshot the computed style of every element at three viewport widths so
// a stylesheet refactor can be checked for drift: run once before, once
// after, then diff the two JSON files.
//
//   node scripts/style-snapshot.mjs out.json [baseURL]

import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const out = process.argv[2] ?? "style-snapshot.json";
const base = process.argv[3] ?? "http://127.0.0.1:4176";
const widths = [375, 768, 1440];

const browser = await chromium.launch();
const result = {};
for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: width < 800 ? 812 : 900 } });
  await page.addInitScript(() => {
    localStorage.removeItem("air-beat-board:session:v1");
    localStorage.setItem("air-beat-board:hint-dismissed", "1");
  });
  await page.goto(`${base}/`);
  await page.waitForSelector("[data-testid='beat-grid'] .cell");
  await page.waitForTimeout(300);
  result[width] = await page.evaluate(() => {
    const path = (el) => {
      const parts = [];
      while (el && el !== document.body) {
        const parent = el.parentElement;
        const index = parent ? [...parent.children].indexOf(el) : 0;
        parts.unshift(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}[${index}]`);
        el = parent;
      }
      return parts.join(">");
    };
    const map = {};
    for (const el of document.body.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const props = [];
      for (let i = 0; i < cs.length; i += 1) {
        const name = cs[i];
        props.push(`${name}:${cs.getPropertyValue(name)}`);
      }
      map[path(el)] = {
        rect: [rect.x, rect.y, rect.width, rect.height].map((v) => Math.round(v * 10) / 10),
        style: props.join(";")
      };
    }
    return map;
  });
  await page.close();
}
await browser.close();
writeFileSync(out, JSON.stringify(result));
console.log(`wrote ${out}: ${widths.map((w) => `${w}px=${Object.keys(result[w]).length} elements`).join(", ")}`);
