import { test, expect } from "@playwright/test";

// 画面下のタブ(shelf-nav.js)と受信箱の行(inbox-row.js)
const ARTICLES = {
  url_saved: {
    articleId: "url_saved",
    title: "保存しただけの記事",
    canonicalUrl: "https://example.com/saved",
    source: { kind: "web", headline: "" },
    tldr: "- 何の話か\n- 何が新しいか\n- 結論",
    registeredAt: "2026-11-21T07:00:00+09:00",
    updatedAt: "2026-11-21T07:00:00+09:00"
  },
  url_pending: {
    articleId: "url_pending",
    title: "要約待ちの記事",
    canonicalUrl: "https://example.com/pending",
    source: { kind: "web", headline: "" },
    updatedAt: "2026-11-21T06:00:00+09:00"
  },
  url_generated: {
    articleId: "url_generated",
    title: "スライドを作った記事",
    canonicalUrl: "https://example.com/generated",
    source: { kind: "web", headline: "生成済み" },
    slides: { status: "processing", updatedAt: "2026-11-20T09:00:00+09:00" },
    updatedAt: "2026-11-20T09:00:00+09:00"
  },
  txt_digest: {
    articleId: "txt_digest",
    title: "今日のまとめ",
    canonicalUrl: "text:txt_0123456789ab",
    source: { kind: "text", headline: "" },
    registeredFrom: "daily-digest",
    updatedAt: "2026-11-21T06:30:00+09:00"
  }
};

// Firebase SDK の代役(mobile-layout.spec.js と同じ)。行のタップで既読を書くため、SDK が無いと詳細が開かない
const FIREBASE_STUB = `
  (function(){
    if (window.firebase) return;
    function snap(v){ return { val: function(){ return v; }, exists: function(){ return v !== null; } }; }
    function ref(){ return {
      once: function(){ return Promise.resolve(snap(null)); },
      on: function(){}, off: function(){},
      set: function(){ return Promise.resolve(); },
      update: function(){ return Promise.resolve(); },
      remove: function(){ return Promise.resolve(); }
    }; }
    window.firebase = {
      initializeApp: function(){}, apps: [{}],
      auth: function(){ return { currentUser: { uid: "u" }, onAuthStateChanged: function(){}, signOut: function(){ return Promise.resolve(); } }; },
      database: function(){ return { ref: ref }; }
    };
  })();
`;

async function open(page, viewport) {
  if (viewport) await page.setViewportSize(viewport);
  await page.addInitScript((articles) => {
    window.MULTIMODAL_VIEWER_TEST_FIXTURE = { isEditor: true, articles };
  }, ARTICLES);
  await page.route("https://www.gstatic.com/firebasejs/**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: FIREBASE_STUB }));
  await page.goto("/");
}

test("4つのタブで、記事がそれぞれ1つのタブにだけ出る", async ({ page }) => {
  await open(page);
  const nav = page.locator("nav.shelf-nav");
  await expect(nav.locator(".shelf-nav-button")).toHaveCount(4);
  // 既定は記事一覧
  await expect(nav.locator('[aria-current="page"]')).toContainText("記事一覧");
  await expect(page.locator(".article-row")).toHaveCount(1);
  await expect(page.locator(".article-row")).toContainText("スライドを作った記事");

  await nav.locator('[data-shelf="inbox"]').click();
  await expect(page.locator(".article-row")).toHaveCount(2);
  await expect(page.locator(".inbox-tldr li")).toHaveCount(3);
  await expect(page.locator(".inbox-summary-note")).toContainText("要約を作成中");
  await expect(page.locator(".inbox-action", { hasText: "生成する" })).toHaveCount(2);

  await nav.locator('[data-shelf="subscription"]').click();
  await expect(page.locator(".article-row")).toHaveCount(1);
  await expect(page.locator(".article-row")).toContainText("今日のまとめ");

  await nav.locator('[data-shelf="research"]').click();
  await expect(page.locator(".empty-list")).toContainText("深掘り");
});

test("受信箱の件数と、定期購読の未読件数がバッジに出る", async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-shelf="inbox"] .shelf-nav-badge')).toHaveText("2");
  await expect(page.locator('[data-shelf="subscription"] .shelf-nav-badge')).toHaveText("1");
  await expect(page.locator('[data-shelf="research"] .shelf-nav-badge')).toBeHidden();
});

test("選んだタブは開き直しても保たれる", async ({ page }) => {
  await open(page);
  await page.locator('[data-shelf="inbox"]').click();
  await page.reload();
  await expect(page.locator('nav.shelf-nav [aria-current="page"]')).toContainText("受信箱");
});

test("スマホ幅: ＋ボタンはタブの上にあり、詳細シートを開くとタブは隠れる", async ({ page }) => {
  await open(page, { width: 390, height: 844 });
  const nav = await page.locator("nav.shelf-nav").boundingBox();
  const fab = await page.locator("#floatingActions").boundingBox();
  expect(fab.y + fab.height).toBeLessThanOrEqual(nav.y);
  await page.locator(".article-row").first().click();
  await expect(page.locator("nav.shelf-nav")).toBeHidden();
});
