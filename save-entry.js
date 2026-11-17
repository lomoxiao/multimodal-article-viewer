// 保存だけの入口(PC のブックマークレット用)。
// Viewer を ?save=<記事のURL>&title=<ページ名> 付きで開くと、依頼キュー(/generationRequests)に
// kind: "save" の依頼を書いて「保存しました」を出し、小窓なら自動で閉じる。
// 記事の登録は常駐プロセスが行い、スライド等は作らない(受信箱に入る)。
// app.js とは「サインイン後に run(user) を呼ぶ」1点だけでつながる独立した部品。
(function () {
  "use strict";

  const MAX_URL_LENGTH = 2048;
  const MAX_TITLE_LENGTH = 200;
  const CLOSE_DELAY_MS = 1500;

  function readPending() {
    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return null;
    }
    const url = (params.get("save") || "").trim();
    if (!url) return null;
    return { url, title: (params.get("title") || "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH) };
  }

  function isSavableUrl(value) {
    if (!value || value.length > MAX_URL_LENGTH) return false;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }

  const state = { pending: readPending(), sent: false, panel: null, message: null, detail: null, button: null };

  function ensurePanel() {
    if (state.panel) return;
    const panel = document.createElement("section");
    panel.className = "save-entry-panel";
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
    const card = document.createElement("div");
    card.className = "save-entry-card";
    const message = document.createElement("p");
    message.className = "save-entry-message";
    const detail = document.createElement("p");
    detail.className = "save-entry-detail";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "save-entry-button";
    button.textContent = "Viewer を開く";
    button.hidden = true;
    button.addEventListener("click", () => panel.remove());
    card.append(message, detail, button);
    panel.appendChild(card);
    document.body.appendChild(panel);
    Object.assign(state, { panel, message, detail, button });
  }

  function show(message, detail, options = {}) {
    ensurePanel();
    state.message.textContent = message;
    state.detail.textContent = detail || "";
    state.panel.classList.toggle("is-error", Boolean(options.error));
    state.button.hidden = !options.done;
  }

  // 再読み込みで二重に送らないよう、アドレスから save / title を消す
  function clearQuery() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("save");
      url.searchParams.delete("title");
      window.history.replaceState(null, "", url.toString());
    } catch {
      // 消せなくても保存自体には影響しない
    }
  }

  async function run(user) {
    if (!state.pending || state.sent || !user) return;
    state.sent = true;
    const { url, title } = state.pending;
    clearQuery();
    if (!isSavableUrl(url)) {
      show("保存できないURLです", "http または https で始まるページだけ保存できます。", { error: true, done: true });
      return;
    }
    show("保存しています…", title || url);
    try {
      await firebase.database().ref("/generationRequests").push().set({
        ownerUid: user.uid,
        kind: "save",
        urls: [url],
        ...(title ? { title } : {}),
        status: "queued",
        createdAt: new Date().toISOString(),
        trigger: { provider: "web" }
      });
      show("Viewer に保存しました", "受信箱に入ります。3行要約はあとで付きます。", { done: true });
      // ブックマークレットが開いた小窓なら自動で閉じる(通常のタブは閉じられないので表示を残す)
      window.setTimeout(() => {
        try {
          window.close();
        } catch {
          // 閉じられない場合は何もしない
        }
      }, CLOSE_DELAY_MS);
    } catch (error) {
      show(
        /permission_denied/i.test(String(error && error.message)) ? "保存する権限がありません" : "保存に失敗しました",
        "もう一度ブックマークバーのボタンを押してください。",
        { error: true, done: true }
      );
    }
  }

  if (state.pending) show("サインインを確認しています…", state.pending.title || state.pending.url);

  window.ViewerSaveEntry = { run, hasPending: () => Boolean(state.pending) && !state.sent, isSavableUrl };
})();
