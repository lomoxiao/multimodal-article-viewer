// 束ねる記事の選択。一覧から2本以上選んで「束を作る」と、依頼キュー(/generationRequests)に
// kind: "bundle" の依頼を書く。束そのもの(3行要約・本文・音声)は常駐プロセスが作る。
// app.js とは init / handleRowClick / decorateRow の3点だけでつながる独立した部品。
(function () {
  "use strict";

  const MIN_MEMBERS = 2;
  const MAX_MEMBERS = 10;
  const WATCH_TIMEOUT_MS = 30 * 60 * 1000;
  // 束に入れられるのは通常の記事だけ(束そのものは入れられない)
  const MEMBER_ID_PATTERN = /^(url|yt|txt)_[0-9a-f]+$/;

  const state = { active: false, ids: [], submitting: false, hooks: null, button: null, bar: null, count: null, submit: null, audio: null };

  function isSelectable(article) {
    return Boolean(article) && MEMBER_ID_PATTERN.test(article.articleId) && article.source.kind !== "bundle";
  }

  function init(hooks) {
    state.hooks = hooks;
    if (!hooks.mount || state.button) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-toggle bundle-select-toggle";
    button.textContent = "束ねる";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => setActive(!state.active));
    hooks.mount.appendChild(button);
    state.button = button;
  }

  function ensureBar() {
    if (state.bar) return state.bar;
    const bar = document.createElement("section");
    bar.className = "bundle-select-bar";
    bar.setAttribute("aria-label", "束ねる記事の選択");
    bar.hidden = true;

    const count = document.createElement("p");
    count.className = "bundle-select-count";
    count.setAttribute("aria-live", "polite");

    const audioLabel = document.createElement("label");
    audioLabel.className = "bundle-select-audio";
    const audio = document.createElement("input");
    audio.type = "checkbox";
    audio.checked = true;
    const audioText = document.createElement("span");
    audioText.textContent = "音声も作る";
    audioLabel.append(audio, audioText);

    const actions = document.createElement("div");
    actions.className = "bundle-select-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "bundle-select-cancel";
    cancel.textContent = "やめる";
    cancel.addEventListener("click", () => setActive(false));
    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "bundle-select-submit";
    submit.textContent = "束を作る";
    submit.addEventListener("click", submitBundle);
    actions.append(cancel, submit);

    bar.append(count, audioLabel, actions);
    document.body.appendChild(bar);
    Object.assign(state, { bar, count, submit, audio });
    return bar;
  }

  function setActive(active) {
    state.active = active;
    if (!active) state.ids = [];
    ensureBar().hidden = !active;
    document.body.classList.toggle("is-bundle-selecting", active);
    if (state.button) {
      state.button.classList.toggle("is-active", active);
      state.button.setAttribute("aria-pressed", active ? "true" : "false");
    }
    syncBar();
    if (state.hooks) state.hooks.rerenderList();
  }

  function syncBar() {
    if (!state.bar) return;
    const n = state.ids.length;
    state.count.textContent = n < MIN_MEMBERS
      ? `束ねる記事を選んでください（${n}本・2本以上）`
      : `${n}本を選択中（最大${MAX_MEMBERS}本）`;
    state.submit.disabled = state.submitting || n < MIN_MEMBERS;
    state.submit.textContent = state.submitting ? "送信中…" : "束を作る";
  }

  // 選択中なら true を返し、app.js 側の「詳細を開く」を止める
  function handleRowClick(article, row) {
    if (!state.active) return false;
    if (!isSelectable(article)) {
      notify("束は束に入れられません");
      return true;
    }
    const index = state.ids.indexOf(article.articleId);
    if (index >= 0) {
      state.ids.splice(index, 1);
    } else if (state.ids.length >= MAX_MEMBERS) {
      notify(`束にできる記事は${MAX_MEMBERS}本までです`);
      return true;
    } else {
      state.ids.push(article.articleId);
    }
    decorateRow(row, article);
    syncBar();
    return true;
  }

  function decorateRow(row, article) {
    const selected = state.active && state.ids.includes(article.articleId);
    row.classList.toggle("is-bundle-selected", selected);
    row.classList.toggle("is-bundle-unselectable", state.active && !isSelectable(article));
    if (state.active) row.setAttribute("aria-pressed", selected ? "true" : "false");
    else row.removeAttribute("aria-pressed");
  }

  function notify(message) {
    if (state.hooks) state.hooks.showStatus(message);
  }

  async function submitBundle() {
    if (state.submitting || state.ids.length < MIN_MEMBERS) return;
    const user = firebase.auth().currentUser;
    if (!user) {
      notify("サインインが必要です");
      return;
    }
    const members = state.ids.slice();
    state.submitting = true;
    syncBar();
    try {
      const ref = firebase.database().ref("/generationRequests").push();
      await ref.set({
        ownerUid: user.uid,
        kind: "bundle",
        members,
        audio: Boolean(state.audio.checked),
        status: "queued",
        createdAt: new Date().toISOString(),
        trigger: { provider: "web" }
      });
      watchRequest(ref);
      state.submitting = false;
      setActive(false);
      notify(`${members.length}本の束を依頼しました。できあがると一覧に「束」として出ます`);
    } catch (error) {
      state.submitting = false;
      syncBar();
      notify(/permission_denied/i.test(String(error && error.message))
        ? "束を依頼する権限がありません"
        : "束の依頼に失敗しました。もう一度お試しください");
    }
  }

  function watchRequest(ref) {
    let settled = false;
    const settle = () => {
      settled = true;
      ref.off("value", handler);
      window.clearTimeout(timer);
    };
    const handler = (snapshot) => {
      const value = snapshot.val();
      if (!value || settled) return;
      if (value.status === "done") {
        settle();
        const bundle = value.bundle || {};
        const missing = Number(bundle.missing) || 0;
        notify(missing > 0
          ? `束ができました（${Number(bundle.included) || 0}本。${missing}本は含められませんでした）`
          : "束ができました");
      } else if (value.status === "failed") {
        settle();
        notify(value.statusMessage || "束を作れませんでした");
      }
    };
    const timer = window.setTimeout(settle, WATCH_TIMEOUT_MS);
    ref.on("value", handler);
  }

  window.ArticleBundleSelect = { init, handleRowClick, decorateRow, isSelectable };
})();
