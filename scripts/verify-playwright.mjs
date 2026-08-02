import { chromium } from "@playwright/test";

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 32, height: 32 } });
  try {
    await page.setContent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#2563eb"/></svg>');
    const png = await page.screenshot({ type: "png" });
    if (png.length < 8 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new Error("Playwright screenshot did not produce a PNG");
    }
  } finally {
    await page.close();
  }
  console.log("Viewer Playwright Chromium verification passed.");
} catch (error) {
  console.error(`Viewer Playwright Chromium verification failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error("Run npm run playwright:setup from article-to-slides-automation.");
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
