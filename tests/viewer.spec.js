import { test, expect } from "@playwright/test";

const completed = (url) => ({
  status: "completed",
  url,
  origin: "automation",
  locked: false,
  updatedAt: "2026-08-02T12:00:00+09:00"
});

async function openFixture(page, article) {
  await page.addInitScript((fixtureArticle) => {
    window.MULTIMODAL_VIEWER_TEST_FIXTURE = {
      isEditor: false,
      articles: { [fixtureArticle.articleId]: fixtureArticle }
    };
  }, article);
  await page.route("https://drive.google.com/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#detailPanel")).toBeVisible();
}

test("既存slides/manga表示を維持し、videoなし記事には空枠を出さない", async ({ page }) => {
  await openFixture(page, {
    articleId: "legacy",
    title: "既存記事",
    canonicalUrl: "https://example.com/legacy",
    source: { kind: "web", headline: "回帰テスト" },
    slides: completed("https://docs.google.com/presentation/d/test-slides/edit"),
    manga: completed("https://notebooklm.google.com/notebook/test-manga"),
    updatedAt: "2026-08-02T12:00:00+09:00"
  });

  await expect(page.locator(".destination-title", { hasText: "Google Slides" }).first()).toBeVisible();
  await expect(page.locator(".destination-title", { hasText: "漫画 / NotebookLM" }).first()).toBeVisible();
  await expect(page.locator(".destination-title", { hasText: "60秒解説動画" })).toHaveCount(0);
  await expect(page.locator(".chip", { hasText: "Video" })).toHaveCount(0);
});

test("completed動画をDrive previewで埋め込み、外部リンクも保持する", async ({ page }) => {
  const fileId = "drive-file-123";
  const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
  await openFixture(page, {
    articleId: "with-video",
    title: "動画記事",
    canonicalUrl: "https://example.com/video",
    source: { kind: "web", headline: "動画テスト" },
    slides: completed("https://docs.google.com/presentation/d/test-slides/edit"),
    manga: completed("https://notebooklm.google.com/notebook/test-manga"),
    video: { ...completed(viewUrl), fileId, durationSec: 60 },
    updatedAt: "2026-08-02T12:00:00+09:00"
  });

  await page.locator(".destination", { hasText: "60秒解説動画" }).first().click();
  await expect(page.locator("#videoViewer")).toBeVisible();
  await expect(page.locator("#videoFrame")).toHaveAttribute(
    "src",
    `https://drive.google.com/file/d/${fileId}/preview`
  );
  await expect(page.locator("#openVideoExternal")).toHaveAttribute("href", viewUrl);
  await page.keyboard.press("Escape");
  await expect(page.locator("#videoViewer")).toBeHidden();
  await expect(page.locator("#videoFrame")).toHaveAttribute("src", "about:blank");
});

for (const [index, status] of ["pending", "processing", "action_required", "failed"].entries()) {
  test(`videoの${status}状態を表示する`, async ({ page }) => {
    await openFixture(page, {
      articleId: `video-${status}`,
      title: `動画 ${status}`,
      canonicalUrl: `https://example.com/${status}`,
      source: { kind: "web", headline: status },
      video: {
        status,
        stage: status === "pending" ? "video_queued" : "video_rendering",
        statusMessage: status === "action_required" ? "確認が必要です" : "",
        url: "",
        origin: "automation",
        locked: false,
        updatedAt: `2026-08-02T12:00:0${index}+09:00`
      },
      updatedAt: `2026-08-02T12:00:0${index}+09:00`
    });
    await expect(page.locator(".destination", { hasText: "60秒解説動画" }).first()).toBeVisible();
    await expect(page.locator(`.artifact-status.is-${status}`).first()).toBeVisible();
  });
}


test("video_captioning工程を意味単位字幕生成として表示する", async ({ page }) => {
  await openFixture(page, {
    articleId: "video-captioning",
    title: "字幕生成中",
    canonicalUrl: "https://example.com/captioning",
    source: { kind: "web", headline: "captioning" },
    video: {
      status: "processing",
      stage: "video_captioning",
      statusMessage: "意味単位の字幕タイミングを確定しています",
      url: "",
      origin: "automation",
      locked: false,
      updatedAt: "2026-08-02T12:01:00+09:00"
    },
    updatedAt: "2026-08-02T12:01:00+09:00"
  });
  await page.locator(".artifact-status.is-processing.is-interactive").first().click();
  await expect(page.locator("#detailOperationPanel")).toContainText("字幕生成");
  await expect(page.locator("#detailOperationPanel")).toContainText("意味単位の字幕タイミングを確定しています");
});
