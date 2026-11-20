import { test, expect } from "@playwright/test";

// 深掘りの依頼(research-ask.js)と、詳細の深掘り表示(research-view.js)
const ARTICLES = {
  url_00aa11: {
    articleId: "url_00aa11",
    title: "保存しただけの記事",
    canonicalUrl: "https://example.com/saved",
    source: { kind: "web", headline: "" },
    tldr: "- 一\n- 二\n- 三",
    updatedAt: "2026-11-21T07:00:00+09:00"
  },
  url_00bb22: {
    articleId: "url_00bb22",
    title: "スライドを作った記事",
    canonicalUrl: "https://example.com/generated",
    source: { kind: "web", headline: "生成済み" },
    slides: { status: "completed", url: "https://docs.google.com/presentation/d/x", updatedAt: "2026-11-20T09:00:00+09:00" },
    updatedAt: "2026-11-20T09:00:00+09:00"
  },
  rsc_0123456789ab: {
    articleId: "rsc_0123456789ab",
    title: "スライドを作った記事の深掘り",
    canonicalUrl: "research:rsc_0123456789ab",
    source: { kind: "research", headline: "" },
    tldr: "- 一\n- 二\n- 三",
    registeredFrom: "research",
    research: {
      baseArticleId: "url_00bb22",
      aspects: ["related", "reception"],
      status: "completed",
      sources: [
        { index: 1, title: "出典A", url: "https://a.example/1", status: "used" },
        { index: 2, title: "出典B", url: "https://b.example/2", status: "used" },
        { index: 3, title: "出典C", url: "https://c.example/3", status: "unreachable", reason: "サイトに取得を拒否されました" },
        { index: 4, title: "危ない", url: "javascript:alert(1)", status: "used" }
      ]
    },
    updatedAt: "2026-11-21T08:00:00+09:00"
  },
  rsc_00000000ffff: {
    articleId: "rsc_00000000ffff",
    title: "保存しただけの記事の深掘り（作成中）",
    canonicalUrl: "research:rsc_00000000ffff",
    source: { kind: "research", headline: "" },
    research: { baseArticleId: "url_00aa11", aspects: ["related"], status: "processing", stage: "出典を確認中（2/5）", updatedAt: "2999-01-01T00:00:00+09:00" },
    updatedAt: "2026-11-21T08:30:00+09:00"
  }
};

// Firebase SDK の代役。依頼キューへの書き込み(push().set)は window.__pushed に残す
const FIREBASE_STUB = `
  (function(){
    if (window.firebase) return;
    window.__pushed = [];
    function snap(v){ return { val: function(){ return v; }, exists: function(){ return v !== null; } }; }
    function ref(path){ return {
      once: function(){ return Promise.resolve(snap(null)); },
      on: function(){}, off: function(){},
      push: function(){ var r = ref(path); r.set = function(v){ window.__pushed.push({ path: path, value: v }); return Promise.resolve(); }; return r; },
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

async function open(page, shelf) {
  await page.addInitScript(({ articles, shelf }) => {
    window.MULTIMODAL_VIEWER_TEST_FIXTURE = { isEditor: true, articles };
    if (shelf) window.localStorage.setItem("viewer.shelf", shelf);
  }, { articles: ARTICLES, shelf });
  await page.route("https://www.gstatic.com/firebasejs/**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: FIREBASE_STUB }));
  await page.goto("/");
}

const pushed = (page) => page.evaluate(() => window.__pushed);

test("受信箱の「深掘り」から観点を選んで依頼すると、kind: research の依頼を書く", async ({ page }) => {
  await open(page, "inbox");
  await page.locator(".inbox-item", { hasText: "保存しただけの記事" }).locator(".inbox-action", { hasText: "深掘り" }).click();
  const sheet = page.locator(".research-ask-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".research-ask-target")).toHaveText("保存しただけの記事");
  // 既定は「関連する記事」「世間の評価」
  await expect(sheet.locator('.research-ask-aspect[aria-pressed="true"]')).toHaveCount(2);
  await sheet.locator('[data-aspect="impact"]').click();
  await sheet.locator("textarea").fill("  決済の\n観点で  ");
  await sheet.locator(".research-ask-check", { hasText: "音声も作る" }).locator("input").check();
  await sheet.locator(".research-ask-submit").click();
  await expect(sheet).toBeHidden();
  const [request] = await pushed(page);
  expect(request.path).toBe("/generationRequests");
  expect(request.value).toMatchObject({
    ownerUid: "u",
    kind: "research",
    articleId: "url_00aa11",
    aspects: ["related", "reception", "impact"],
    note: "決済の 観点で",
    audio: true,
    vaultCandidate: false,
    status: "queued",
    trigger: { provider: "web" }
  });
  expect(request.value.slides).toBeUndefined();
});

test("観点をすべて外すと依頼できない。やめると何も書かない", async ({ page }) => {
  await open(page, "inbox");
  await page.locator(".inbox-item", { hasText: "保存しただけの記事" }).locator(".inbox-action", { hasText: "深掘り" }).click();
  const sheet = page.locator(".research-ask-sheet");
  await sheet.locator('[data-aspect="related"]').click();
  await sheet.locator('[data-aspect="reception"]').click();
  await expect(sheet.locator(".research-ask-submit")).toBeDisabled();
  await sheet.locator(".research-ask-cancel").click();
  await expect(sheet).toBeHidden();
  expect(await pushed(page)).toEqual([]);
});

test("深掘りタブ: 作成中は段階を出し、レポートの詳細に出典と確認できなかった出典が出る", async ({ page }) => {
  await open(page, "research");
  await expect(page.locator(".article-row")).toHaveCount(2);
  await expect(page.locator(".article-row", { hasText: "作成中" })).toContainText("出典を確認中（2/5）");

  await page.locator(".article-row", { hasText: "スライドを作った記事の深掘り" }).click();
  const actions = page.locator("#detailActions");
  await expect(actions).toContainText("レポートを読む");
  // 深掘りはスライド・漫画を作っていなければ出さない
  await expect(actions).not.toContainText("スライド");
  const panel = page.locator(".research-panel.is-report");
  await expect(panel).toContainText("元の記事");
  await expect(panel.locator(".research-report-link")).toHaveText("スライドを作った記事");
  // http(s) でない出典は出さない
  await expect(panel.locator(".research-source-list:not(.is-missing) li")).toHaveCount(2);
  await expect(panel.locator(".research-source-list.is-missing li")).toContainText("サイトに取得を拒否されました");
  await expect(panel.locator(".research-source-link").first()).toHaveAttribute("rel", "noopener noreferrer");

  await panel.locator(".research-source-list.is-missing .research-source-save").click();
  await expect(panel.locator(".research-source-list.is-missing .research-source-save")).toHaveText("保存済み");
  const [request] = await pushed(page);
  expect(request.value).toMatchObject({ kind: "save", urls: ["https://c.example/3"], title: "出典C" });
});

test("元の記事の詳細に、作った深掘りへの入口と「この記事を深掘りする」が出る", async ({ page }) => {
  await open(page, "list");
  await page.locator(".article-row", { hasText: "スライドを作った記事" }).click();
  const panel = page.locator(".research-panel.is-entry");
  await expect(panel).toContainText("この記事の深掘り（1件）");
  await panel.locator(".research-report-link").click();
  await expect(page.locator(".research-panel.is-report")).toBeVisible();
  await page.locator(".research-report-link", { hasText: "スライドを作った記事" }).click();
  await page.locator(".research-ask-open-button").click();
  await expect(page.locator(".research-ask-sheet")).toBeVisible();
});
