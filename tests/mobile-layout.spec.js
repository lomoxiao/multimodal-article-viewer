import { test, expect } from "@playwright/test";

// iPhone実機で起きていた「余計な改行」「入れ子スクロール」「ボタンと文章の重なり」の回帰検出。
// 数値はUI改善時の実測値（375×667 / 393×852）に基づく。
const DEVICES = [
  { name: "iPhone SE (375x667)", width: 375, height: 667 },
  { name: "iPhone 15 Pro (393x852)", width: 393, height: 852 }
];

const completed = (url) => ({
  status: "completed",
  url,
  origin: "automation",
  locked: false,
  updatedAt: "2026-08-02T12:00:00+09:00"
});

// 最悪ケース: ソース + Slide/漫画/動画 + あとで が同時に立つ記事
const ARTICLES = {
  a1: {
    articleId: "a1",
    title: "生成AIエージェントの長期記憶設計はどこまで実用化できるのか——2026年時点の到達点と課題",
    canonicalUrl: "https://example.com/article",
    source: {
      kind: "web",
      headline: "エージェントの記憶をベクタDBだけで解こうとすると破綻する。階層化された要約・イベントログ・参照解決の3層構成が現実解になりつつある、という論調のまとめ記事。"
    },
    slides: completed("https://docs.google.com/presentation/d/test-slides/edit"),
    manga: { status: "processing", stage: "deck_generation", updatedAt: "2026-08-02T12:00:00+09:00" },
    video: { ...completed("https://drive.google.com/file/d/vid1/view"), fileId: "vid1", durationSec: 60 },
    updatedAt: "2026-08-02T12:00:00+09:00"
  },
  a2: {
    articleId: "a2",
    title: "YouTube: 45分で分かるRetrieval Augmented Generationの落とし穴",
    canonicalUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    source: { kind: "youtube", headline: "チャンク分割・埋め込みモデル選定・リランカーの三点セットを実演。" },
    slides: { status: "action_required", updatedAt: "2026-08-01T09:30:00+09:00" },
    manga: { status: "failed", updatedAt: "2026-08-01T09:30:00+09:00" },
    updatedAt: "2026-08-01T09:30:00+09:00"
  }
};

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

async function openViewer(page, { isEditor = false } = {}) {
  await page.addInitScript((fx) => { window.MULTIMODAL_VIEWER_TEST_FIXTURE = fx; }, { isEditor, articles: ARTICLES });
  await page.route("https://www.gstatic.com/firebasejs/**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: FIREBASE_STUB }));
  await page.route("https://drive.google.com/**", (route) => route.abort());
  await page.route("https://docs.google.com/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".article-row").first()).toBeVisible();
}

// 祖先のoverflowでクリップされた分を差し引いた「実際に見えている矩形」を返す
const VISIBLE_RECT = `(el) => {
  const r = el.getBoundingClientRect();
  const box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  for (let p = el.parentElement; p; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflow === "visible" && cs.overflowX === "visible" && cs.overflowY === "visible") continue;
    const pr = p.getBoundingClientRect();
    box.left = Math.max(box.left, pr.left);
    box.top = Math.max(box.top, pr.top);
    box.right = Math.min(box.right, pr.right);
    box.bottom = Math.min(box.bottom, pr.bottom);
  }
  return box;
}`;

function findOverlaps(page, selector) {
  return page.evaluate(([sel, visibleRectSource]) => {
    const visibleRect = eval(visibleRectSource);
    const fabs = [...document.querySelectorAll(".fab-button, .bottom-search-bar")]
      .filter((n) => n.offsetParent !== null);
    const hits = [];
    fabs.forEach((fab) => {
      const fr = fab.getBoundingClientRect();
      document.querySelectorAll(sel).forEach((el) => {
        const r = visibleRect(el);
        if (r.right - r.left <= 0 || r.bottom - r.top <= 0) return;
        const ix = Math.min(fr.right, r.right) - Math.max(fr.left, r.left);
        const iy = Math.min(fr.bottom, r.bottom) - Math.max(fr.top, r.top);
        if (ix > 0 && iy > 0) {
          hits.push(`${fab.id || fab.className} × ${el.className || el.tagName} (${Math.round(ix)}×${Math.round(iy)}px)`);
        }
      });
    });
    return hits;
  }, [selector, VISIBLE_RECT]);
}

for (const device of DEVICES) {
  test.describe(device.name, () => {
    test.use({ viewport: { width: device.width, height: device.height }, isMobile: true, hasTouch: true });

    test("ステータスピルが1行に収まり、タイトルが切り詰められない", async ({ page }) => {
      await openViewer(page);

      const status = page.locator(".row-status").first();
      const statusFits = await status.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      expect(statusFits, "ステータスピルが折り返している").toBe(true);

      const title = page.locator(".row-title").first();
      const titleFits = await title.evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
      expect(titleFits, "タイトルがclampで切り詰められている").toBe(true);
    });

    test("アプリ名が1行に収まる", async ({ page }) => {
      await openViewer(page);
      const lines = await page.locator("#appTitle").evaluate((el) => {
        const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize);
        return Math.round(el.scrollHeight / lh);
      });
      expect(lines).toBe(1);
    });

    test("詳細シートのスクロール領域は1箇所だけ", async ({ page }) => {
      await openViewer(page);
      await page.locator(".article-row").first().click();
      await expect(page.locator("#detailPanel")).toBeVisible();

      const scrollers = await page.locator("#detailPanel").evaluate((panel) =>
        [...panel.querySelectorAll("*")].filter((el) => {
          const cs = getComputedStyle(el);
          const scrollable = cs.overflowY === "auto" || cs.overflowY === "scroll";
          return scrollable && el.scrollHeight > el.clientHeight + 1;
        }).map((el) => el.className));

      expect(scrollers.length, `入れ子スクロール: ${scrollers.join(" / ")}`).toBeLessThanOrEqual(1);
    });

    test("詳細シートで浮遊FABが本文・ボタンに重ならない", async ({ page }) => {
      await openViewer(page);
      await page.locator(".article-row").first().click();
      await expect(page.locator("#detailPanel")).toBeVisible();

      const hits = await findOverlaps(page, "#detailPanel .destination, #detailPanel .triage-button, #detailPanel .detail-headline");
      expect(hits, hits.join(" / ")).toEqual([]);
    });

    test("一覧を最下部まで送るとFABが記事カードに重ならない", async ({ page }) => {
      await openViewer(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);

      const hits = await findOverlaps(page, ".article-row");
      expect(hits, hits.join(" / ")).toEqual([]);
    });

    test("検索バー表示中はFABを出さず、プレースホルダが途中で切れない", async ({ page }) => {
      await openViewer(page);
      await page.locator("#searchFab").click();
      await expect(page.locator("#bottomSearchBar")).toBeVisible();

      await expect(page.locator("#generationFab")).toBeHidden();
      await expect(page.locator("#searchFab")).toBeHidden();

      const input = page.locator("#searchInput");
      const placeholderFits = await input.evaluate((el) => {
        const probe = document.createElement("span");
        probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap";
        probe.style.font = getComputedStyle(el).font;
        probe.textContent = el.placeholder;
        document.body.appendChild(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return width <= el.clientWidth;
      });
      expect(placeholderFits, "プレースホルダが入力欄に収まらない").toBe(true);
    });

    test("生成依頼パネルは漫画オプション展開後も送信ボタンが見えている", async ({ page }) => {
      await openViewer(page);
      await page.locator("#generationFab").click();
      await page.locator("#generationMangaToggle").check();
      await page.locator("#generationPanel .generation-body").evaluate((el) => { el.scrollTop = el.scrollHeight; });

      const submit = page.locator("#generationSubmitButton");
      await expect(submit).toBeInViewport();
    });

    test("URL編集はFABを隠し、長いURLが横に隠れない", async ({ page }) => {
      await openViewer(page, { isEditor: true });
      await page.locator(".article-row").first().click();
      await page.locator(".edit-mode-track").click();
      await page.locator(".artifact-action-button").first().click();
      await expect(page.locator("#detailOperationPanel")).toBeVisible();

      await expect(page.locator("#generationFab")).toBeHidden();

      const input = page.locator("#operationUrlInput");
      const fits = await input.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      expect(fits, "URLが横方向にはみ出している").toBe(true);
    });
  });
}
