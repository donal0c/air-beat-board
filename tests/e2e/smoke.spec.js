// Browser smoke test: the page loads, cells cycle by clicking, tokens drag,
// and Space starts playback with a moving playhead.

import { test, expect } from "@playwright/test";

const STORAGE_KEY = "air-beat-board:session:v1";
const HINT_KEY = "air-beat-board:hint-dismissed";

test.beforeEach(async ({ page }) => {
  // Start each test from a clean session, but only on the first load so a
  // reload within a test still sees what the app autosaved.
  await page.addInitScript(([storageKey, hintKey]) => {
    if (!sessionStorage.getItem("smoke:cleared")) {
      localStorage.removeItem(storageKey);
      sessionStorage.setItem("smoke:cleared", "1");
    }
    localStorage.setItem(hintKey, "1");
  }, [STORAGE_KEY, HINT_KEY]);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.__errors = errors;
  await page.goto("/");
  await expect(page.locator("[data-testid='beat-grid'] .cell")).toHaveCount(40);
});

test.afterEach(async ({ page }) => {
  expect(page.__errors, "no console or page errors").toEqual([]);
});

test("clicking a cell cycles through the four states", async ({ page }) => {
  const cell = page.locator("[data-testid='cell-0-1']");
  const states = [];
  for (let i = 0; i < 4; i += 1) {
    await cell.click();
    states.push(await cell.getAttribute("aria-label"));
  }
  expect(states).toEqual([
    "Kick column 2, first sixteenth",
    "Kick column 2, second sixteenth",
    "Kick column 2, both sixteenths",
    "Kick column 2, empty"
  ]);
});

test("dragging a token moves it and a self-drop changes nothing", async ({ page }) => {
  const source = page.locator("[data-testid='cell-0-1']");
  const target = page.locator("[data-testid='cell-1-0']");
  await source.click();
  await expect(source).toHaveAttribute("aria-label", /first sixteenth/);

  await source.locator(".token").dragTo(target, { force: true });
  await expect(source).toHaveAttribute("aria-label", /empty/);
  await expect(target).toHaveAttribute("aria-label", /first sixteenth/);

  const undoBefore = await page.locator("#message").textContent();
  await target.locator(".token").dragTo(target, { force: true, targetPosition: { x: 3, y: 3 } });
  await expect(target).toHaveAttribute("aria-label", /first sixteenth/);
  expect(await page.locator("#message").textContent()).toBe(undoBefore);
});

test("Space starts playback and the playhead sweeps the grid", async ({ page }) => {
  await page.locator("[data-testid='cell-0-0']").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#runtimeStatus")).toHaveText("Playing");

  const playhead = page.locator(".beat-grid .playhead");
  await expect(playhead).toHaveCSS("opacity", "1");

  const seen = new Set();
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && seen.size < 3) {
    const transform = await playhead.evaluate((el) => el.style.transform);
    if (transform) seen.add(transform);
    await page.waitForTimeout(60);
  }
  expect(seen.size, "playhead moved through several columns").toBeGreaterThanOrEqual(3);

  await page.keyboard.press("Escape");
  await expect(page.locator("#runtimeStatus")).toHaveText("Ready");
  await expect(page.locator(".cell.play-col")).toHaveCount(0);
});

test("the session autosaves and restores after a reload", async ({ page }) => {
  await page.locator("#bpmInput").fill("140");
  await page.locator("#bpmInput").press("Enter");
  await page.locator("[data-testid='cell-3-0']").click();
  await page.waitForTimeout(600);

  await page.reload();
  await expect(page.locator("#message")).toContainText("restored");
  await expect(page.locator("#bpmInput")).toHaveValue("140");
  await expect(page.locator("[data-testid='cell-3-0']")).toHaveAttribute("aria-label", /first sixteenth/);
});
