import { test, expect } from "@playwright/test";

const fileId = "drive-mobile-file-123";
const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
const article = {
  articleId: "iphone-video",
  title: "iPhone動画テスト",
  canonicalUrl: "https://example.com/video",
  source: { kind: "web", headline: "動画再生テスト" },
  video: {
    status: "completed",
    url: viewUrl,
    fileId,
    origin: "automation",
    locked: false,
    durationSec: 60,
    updatedAt: "2026-08-02T12:00:00+09:00",
  },
  updatedAt: "2026-08-02T12:00:00+09:00",
};

async function openVideo(page) {
  await page.addInitScript((fixtureArticle) => {
    window.MULTIMODAL_VIEWER_TEST_FIXTURE = {
      isEditor: false,
      articles: { [fixtureArticle.articleId]: fixtureArticle },
    };
  }, article);
  await page.route("https://drive.google.com/**", (route) => route.abort());
  await page.goto("/");
  const destination = page.locator(".destination", { hasText: "60秒解説動画" }).first();
  if (!(await destination.isVisible())) {
    await page.evaluate(() => showDetail(getSelectedArticle(), { keepSheet: true }));
    await expect(page.locator("#workspacePane")).toHaveClass(/has-mobile-detail/);
  }
  await destination.click();
  await expect(page.locator("#videoViewer")).toBeVisible();
}

test.describe("iPhone Drive動画フォールバック", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  });

  test("iframeを読み込まずDriveアプリ向け同一タブリンクを表示する", async ({ page }) => {
    await openVideo(page);

    await expect(page.locator("#videoFrameWrap")).toBeHidden();
    await expect(page.locator("#videoFrame")).toHaveAttribute("src", "about:blank");
    await expect(page.locator("#videoPlaybackNotice")).toContainText("iPhoneでは非公開のDrive動画をViewer内で再生できない");
    await expect(page.locator("#openVideoExternal")).toHaveText("Google Driveアプリで再生");
    await expect(page.locator("#openVideoExternal")).toHaveAttribute("href", viewUrl);
    await expect(page.locator("#openVideoExternal")).not.toHaveAttribute("target", "_blank");
  });
});

test("desktopではDrive previewと外部再生案内を維持する", async ({ page }) => {
  await openVideo(page);

  await expect(page.locator("#videoFrameWrap")).toBeVisible();
  await expect(page.locator("#videoFrame")).toHaveAttribute(
    "src",
    `https://drive.google.com/file/d/${fileId}/preview`,
  );
  await expect(page.locator("#videoPlaybackNotice")).toContainText("動画が表示されない場合");
  await expect(page.locator("#openVideoExternal")).toHaveText("Google Driveで開く");
  await expect(page.locator("#openVideoExternal")).toHaveAttribute("target", "_blank");
});
