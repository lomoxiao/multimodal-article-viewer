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

test("本文が取れなかった記事は処理状況からテキスト投入へ進める", async ({ page }) => {
  await openFixture(page, {
    articleId: "source-unavailable",
    title: "取得できなかった記事",
    canonicalUrl: "https://example.com/blocked",
    source: { kind: "web", headline: "取り込み失敗" },
    slides: {
      status: "action_required",
      stage: "slides_generation",
      statusMessage: "本文が取れていません（サイトに取得を拒否されました）。記事をコピーして、テキスト投入をお試しください。",
      url: "",
      origin: "automation",
      locked: false,
      updatedAt: "2026-11-15T12:00:00+09:00"
    },
    updatedAt: "2026-11-15T12:00:00+09:00"
  });

  await page.locator(".artifact-status.is-action_required.is-interactive").first().click();
  await expect(page.locator(".status-guidance").first()).toContainText("本文が取れていません");
  await page.locator(".text-input-button").click();

  await expect(page.locator("#generationPanel")).toBeVisible();
  await expect(page.locator("#generationTextInput")).toBeVisible();
  await expect(page.locator("#generationUrlInput")).toBeHidden();
  await expect(page.locator("#generationTitleInput")).toHaveValue("取得できなかった記事");
});

test("通常のaction_requiredにはテキスト投入ボタンを出さない", async ({ page }) => {
  await openFixture(page, {
    articleId: "session-expired",
    title: "セッション切れの記事",
    canonicalUrl: "https://example.com/login",
    source: { kind: "web", headline: "要再ログイン" },
    slides: {
      status: "action_required",
      stage: "slides_generation",
      statusMessage: "example.com のセッション再取得が必要です",
      url: "",
      origin: "automation",
      locked: false,
      updatedAt: "2026-11-15T12:00:00+09:00"
    },
    updatedAt: "2026-11-15T12:00:00+09:00"
  });

  await page.locator(".artifact-status.is-action_required.is-interactive").first().click();
  await expect(page.locator(".status-guidance").first()).toBeVisible();
  await expect(page.locator(".text-input-button")).toHaveCount(0);
});

test("音声付きのまとめは、詳細から音声プレーヤーを開ける", async ({ page }) => {
  await page.addInitScript(() => {
    window.MULTIMODAL_VIEWER_TEST_FIXTURE = {
      isEditor: false,
      articles: {
        txt_digest: {
          articleId: "txt_digest",
          title: "今日のまとめ 11/15",
          canonicalUrl: "text:txt_0123456789ab",
          source: { kind: "text", headline: "一つ目" },
          registeredFrom: "daily-digest",
          tldr: "- 一つ目\n- 二つ目\n- 三つ目",
          audio: { status: "completed", durationSec: 185, sizeBytes: 700000, updatedAt: "2026-11-15T07:00:00+09:00" },
          updatedAt: "2026-11-15T07:00:00+09:00"
        }
      },
      // 中身は再生できなくてよい(プレーヤーが開き、src が設定されることだけを確かめる)
      articleAudio: { txt_digest: { mimeType: "audio/mp4", base64: "AAAA" } }
    };
  });
  await page.goto("/");
  await expect(page.locator("#detailPanel")).toBeVisible();

  await expect(page.locator(".chip.is-digest").first()).toHaveText("まとめ");
  const row = page.locator(".audio-destination");
  await expect(row).toContainText("音声で聴く");
  await expect(row).toContainText("3分05秒");
  await row.click();

  await expect(page.locator(".audio-player-bar")).toBeVisible();
  await expect(page.locator(".audio-player-title")).toHaveText("今日のまとめ 11/15");
  await expect(page.locator(".audio-player-audio")).toHaveAttribute("src", /^blob:/);
  await expect(page.locator(".audio-player-speed option")).toHaveCount(4);

  await page.locator(".audio-player-close").click();
  await expect(page.locator(".audio-player-bar")).toBeHidden();
});

test("保存期間を過ぎた音声は押せない表示になる", async ({ page }) => {
  await openFixture(page, {
    articleId: "txt_old",
    title: "今日のまとめ 10/20",
    canonicalUrl: "text:txt_ba9876543210",
    source: { kind: "text", headline: "古いまとめ" },
    registeredFrom: "daily-digest",
    audio: { status: "expired", durationSec: 180 },
    updatedAt: "2026-10-20T07:00:00+09:00"
  });
  await expect(page.locator(".audio-destination")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator(".audio-destination")).toContainText("保存期間");
});

test("音声の無い記事には音声の行を出さない", async ({ page }) => {
  await openFixture(page, {
    articleId: "no-audio",
    title: "通常の記事",
    canonicalUrl: "https://example.com/plain",
    source: { kind: "web", headline: "音声なし" },
    slides: completed("https://docs.google.com/presentation/d/test-slides/edit"),
    updatedAt: "2026-11-15T12:00:00+09:00"
  });
  await expect(page.locator(".audio-destination")).toHaveCount(0);
});
