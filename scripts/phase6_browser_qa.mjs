// Run only against scripts/preview_api.py and the local Vite server.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, launchOptions } from './browser_runtime.mjs';
const output =
  process.env.PHASE6_ARTIFACT_DIR || "/tmp/phase6-browser-artifacts";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch(launchOptions);
const errors = [];
const checks = [];

async function context(options = {}) {
  const ctx = await browser.newContext(options);
  await ctx.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === "http://127.0.0.1:5173"
      ? route.continue()
      : route.abort();
  });
  const page = await ctx.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  return { ctx, page };
}

try {
  const { ctx, page } = await context({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.getByRole("article").first().waitFor();
  const first = page.getByRole("article").first();
  await first
    .getByRole("button", { name: "Save for later", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: /Saved/ })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll("article").length === 1,
  );
  await page.getByRole("button", { name: "Details", exact: true }).click();
  const detail = page.getByRole("dialog");
  await detail.waitFor();
  const close = detail.getByRole("button", { name: "Close dialog" });
  assert.equal(
    await close.evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("/");
  assert.equal(
    await close.evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await detail.evaluate((el) => el.contains(document.activeElement)),
    true,
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await close.evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  await page.goBack();
  await detail.waitFor();
  await page.goForward();
  await detail.waitFor({ state: "detached" });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.getByRole("article").count(), 1);
  await page
    .getByRole("button", { name: "Remove from saved", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "No saved hackathons yet" })
    .waitFor();
  checks.push(
    "Saved persistence, detail browser history, dialog focus trap and slash shortcut",
  );
  await ctx.close();

  const { ctx: mobile, page: phone } = await context({
    viewport: { width: 390, height: 600 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await phone.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await phone.getByRole("article").first().waitFor();
  const filters = phone.getByRole("button", { name: "Filters", exact: true });
  await filters.click();
  assert.ok(await filters.getAttribute("aria-controls"));
  const sort = phone.getByRole("combobox", { name: "Sort hackathons" });
  assert.equal(
    await sort.evaluate((el) => getComputedStyle(el).fontSize),
    "16px",
  );
  await sort.focus();
  await phone.keyboard.press("Escape");
  assert.equal(await filters.getAttribute("aria-expanded"), "false");
  assert.equal(
    await filters.evaluate((el) => el === document.activeElement),
    true,
  );
  const search = phone.getByRole("searchbox");
  await search.fill("Synthetic no match");
  const clear = phone.getByRole("button", { name: "Clear search query" });
  const box = await clear.boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44);
  await clear.click();
  assert.equal(
    await search.evaluate((el) => el === document.activeElement),
    true,
  );
  for (const width of [320, 390, 600]) {
    await phone.setViewportSize({ width, height: 480 });
    if ((await filters.getAttribute("aria-expanded")) === "false")
      await filters.click();
    assert.equal(
      await phone.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    const panel = phone.locator(".hn-controls-secondary");
    assert.ok((await panel.boundingBox()).height <= 260);
  }
  await phone.screenshot({
    path: `${output}/phase6-mobile-filters.png`,
    animations: "disabled",
  });
  checks.push(
    "Mobile filter dismissal/focus, short viewport scrolling, 44px clear target and 16px inputs",
  );
  await mobile.close();

  const { ctx: states, page: statePage } = await context({
    viewport: { width: 390, height: 844 },
  });
  let mode = "error";
  let release;
  let gate = new Promise((resolve) => {
    release = resolve;
  });
  await statePage.route("**/api/hackathons?*", async (route) => {
    if (mode === "loading") await gate;
    if (mode === "healthy") return route.continue();
    return route.fulfill({
      status: mode === "error" ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        mode === "error"
          ? { error: "Synthetic browser outage" }
          : { data: [], upcoming_total: 0, all_total: 0 },
      ),
    });
  });
  await statePage.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  const listings = statePage.getByRole("region", {
    name: "Hackathon listings",
  });
  await listings.getByRole("alert").waitFor();
  await listings.scrollIntoViewIfNeeded();
  await statePage.screenshot({
    path: `${output}/phase6-error.png`,
    animations: "disabled",
  });
  mode = "healthy";
  await listings
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  await statePage.getByRole("article").first().waitFor();
  mode = "error";
  await statePage.getByRole("searchbox").fill("Fintech");
  await listings.getByRole("alert").waitFor();
  assert.ok(await statePage.getByRole("article").count());
  await statePage
    .getByText("Previously loaded results are shown below.")
    .waitFor();
  mode = "empty";
  await listings
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  await statePage
    .getByRole("heading", { name: "No matching hackathons" })
    .waitFor();
  mode = "loading";
  await statePage.reload({ waitUntil: "domcontentloaded" });
  await statePage
    .getByRole("status")
    .filter({ hasText: "Loading hackathons" })
    .waitFor();
  await statePage.locator(".hn-directory-section").scrollIntoViewIfNeeded();
  await statePage.screenshot({
    path: `${output}/phase6-loading.png`,
    animations: "disabled",
  });
  release();
  await statePage
    .getByRole("heading", { name: "No matching hackathons" })
    .waitFor();
  checks.push(
    "Initial loading, failure/retry, retained results during outage and empty recovery",
  );
  await states.close();

  const { ctx: linking, page: linkPage } = await context();
  let releaseDetail;
  const detailGate = new Promise((resolve) => {
    releaseDetail = resolve;
  });
  await linkPage.route("**/api/hackathons/outside-page", async (route) => {
    await detailGate;
    await route
      .fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          _id: "outside-page",
          title: "Synthetic late detail",
        }),
      })
      .catch(() => {});
  });
  await linkPage.goto("http://127.0.0.1:5173/?event=outside-page", {
    waitUntil: "domcontentloaded",
  });
  await linkPage.getByRole("dialog", { name: "Opening event" }).waitFor();
  await linkPage.getByRole("button", { name: "Close dialog" }).click();
  releaseDetail();
  await linkPage.waitForLoadState("networkidle");
  assert.equal(await linkPage.getByRole("dialog").count(), 0);
  assert.equal(new URL(linkPage.url()).searchParams.has("event"), false);
  checks.push("Cancellable deep-link loading ignores a late response");
  await linking.close();

  assert.deepEqual(errors, []);
  const report = {
    browser: await browser.version(),
    checks,
    uncaughtErrors: errors,
  };
  await fs.writeFile(
    `${output}/phase6-checks.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
