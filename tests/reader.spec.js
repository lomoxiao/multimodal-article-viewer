import { test, expect } from "@playwright/test";

const article = {
  articleId: "reader-article",
  title: "夜に読む保存済み記事",
  canonicalUrl: "https://example.com/original",
  source: { kind: "web", headline: "Reader E2E" },
  tldr: "- 要点その1\n- 要点その2\n- 要点その3",
  updatedAt: "2026-09-06T22:00:00+09:00"
};

const articleSource = {
  markdown: "# 最初の章\n\n本文です。\n\n- 項目A\n- 項目B\n\n<script>alert('xss')</script>",
  extractedAt: "2026-09-06T21:55:00+09:00"
};

async function openReaderFixture(page) {
  await page.addInitScript(({ fixtureArticle, fixtureSource }) => {
    window.MULTIMODAL_VIEWER_TEST_FIXTURE = {
      isEditor: false,
      articles: { [fixtureArticle.articleId]: fixtureArticle },
      articleSources: { [fixtureArticle.articleId]: fixtureSource }
    };
  }, { fixtureArticle: article, fixtureSource: articleSource });
  await page.goto(`/?reader=${article.articleId}`);
}

test("認証付きreaderパーマリンクから保存本文を直接開く", async ({ page }) => {
  await openReaderFixture(page);

  await expect(page.locator("#readerViewer")).toBeVisible();
  await expect(page.locator("#readerTitle")).toHaveText(article.title);
  await expect(page.locator(".reader-summary")).toContainText("要点その3");
  await expect(page.locator(".reader-content h2")).toHaveText("最初の章");
  await expect(page.locator(".reader-content li")).toHaveCount(2);
  await expect(page.locator(".reader-source a")).toHaveAttribute("href", article.canonicalUrl);
  await expect(page).toHaveURL(new RegExp(`reader=${article.articleId}`));
});

test("Readerは本文HTMLを実行せず、Kobo向け文字サイズで表示する", async ({ page }) => {
  await openReaderFixture(page);

  await expect(page.locator("#readerViewer")).toBeVisible();
  await expect(page.locator(".reader-content")).toBeVisible();
  await expect(page.locator(".reader-content script")).toHaveCount(0);
  await expect(page.locator(".reader-content")).toContainText("<script>alert('xss')</script>");
  const fontSize = await page.locator("#readerBody").evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize)
  );
  expect(fontSize).toBeGreaterThanOrEqual(19);
});

test("Readerを閉じるとパーマリンクを解除して記事詳細へ戻る", async ({ page }) => {
  await openReaderFixture(page);

  await page.locator("#readerBackButton").click();
  await expect(page.locator("#readerViewer")).toBeHidden();
  await expect(page.locator("#detailPanel")).toBeVisible();
  await expect(page).not.toHaveURL(/reader=/);
});

test("Readerはhttp/https以外の元記事リンクを表示しない", async ({ page }) => {
  await openReaderFixture(page);
  await expect(page.locator("#readerViewer")).toBeVisible();
  await page.evaluate(() => {
    const selected = getSelectedArticle();
    selected.canonicalUrl = "javascript:alert('xss')";
    selected.originalUrl = "";
    openReaderView(selected, { updateUrl: false });
  });

  await expect(page.locator("#readerViewer")).toBeVisible();
  await expect(page.locator("#readerSourceLink")).toBeHidden();
  await expect(page.locator(".reader-source")).toHaveCount(0);
});
