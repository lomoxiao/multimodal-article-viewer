// 深掘りの依頼。記事の詳細や受信箱の「深掘り」から開き、観点を選んで依頼キュー(/generationRequests)に
// kind: "research" の依頼を書く。調査とレポートづくりは常駐プロセスが行う。
// app.js とは init / open / canAsk の3点だけでつながる独立した部品。
// 観点の ID と表示名は article-to-slides-automation の researchAspects.ts と同じ(変えるときは両方を直す)。
(function () {
  "use strict";

  const ASPECTS = [
    { id: "related", label: "関連する記事" },
    { id: "reception", label: "世間の評価" },
    { id: "counter", label: "反対意見・懸念" },
    { id: "evidence", label: "技術的な裏付け" },
    { id: "followup", label: "その後の動き" },
    { id: "impact", label: "自分の仕事への影響" }
  ];
  const DEFAULT_ASPECTS = ["related", "reception"];
  const MAX_NOTE_LENGTH = 500;
  const WATCH_TIMEOUT_MS = 40 * 60 * 1000;
  // 深掘りの元にできるのは通常の記事だけ(束や深掘りレポートは元にできない)
  const BASE_ID_PATTERN = /^(url|yt|txt)_[0-9a-f]+$/;

  const state = { hooks: null, article: null, selected: [], submitting: false, els: null, returnFocus: null };

  function canAsk(article) {
    return Boolean(article) && BASE_ID_PATTERN.test(article.articleId)
      && article.source.kind !== "bundle" && article.source.kind !== "research";
  }

  function init(hooks) {
    state.hooks = hooks;
  }

  function notify(message) {
    if (state.hooks && state.hooks.showStatus) state.hooks.showStatus(message);
  }

  function ensureSheet() {
    if (state.els) return state.els;
    const backdrop = document.createElement("div");
    backdrop.className = "research-ask-backdrop";
    backdrop.hidden = true;
    backdrop.addEventListener("click", close);

    const sheet = document.createElement("section");
    sheet.className = "research-ask-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", "research-ask-title");
    sheet.hidden = true;

    const title = document.createElement("h2");
    title.id = "research-ask-title";
    title.className = "research-ask-title";
    title.textContent = "深掘りする";
    const target = document.createElement("p");
    target.className = "research-ask-target";

    const lead = document.createElement("p");
    lead.className = "research-ask-lead";
    lead.textContent = "調べる観点（1つ以上）";
    const aspects = document.createElement("div");
    aspects.className = "research-ask-aspects";
    const aspectButtons = ASPECTS.map((aspect) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "research-ask-aspect";
      button.dataset.aspect = aspect.id;
      button.textContent = aspect.label;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => toggleAspect(aspect.id));
      aspects.appendChild(button);
      return button;
    });

    const noteLabel = document.createElement("label");
    noteLabel.className = "research-ask-note";
    const noteText = document.createElement("span");
    noteText.textContent = "補足（任意）";
    const note = document.createElement("textarea");
    note.rows = 2;
    note.maxLength = MAX_NOTE_LENGTH;
    note.placeholder = "例：決済サービスへの影響を中心に";
    noteLabel.append(noteText, note);

    const options = document.createElement("div");
    options.className = "research-ask-options";
    const audio = checkbox("音声も作る");
    const vault = checkbox("Vault の候補にする");
    options.append(audio.label, vault.label);

    const hint = document.createElement("p");
    hint.className = "research-ask-hint";
    hint.textContent = "Web で調べ、開いて確かめられた出典だけでレポートを作ります。10〜20分ほどかかります。";

    const actions = document.createElement("div");
    actions.className = "research-ask-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "research-ask-cancel";
    cancel.textContent = "やめる";
    cancel.addEventListener("click", close);
    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "research-ask-submit";
    submit.textContent = "深掘りする";
    submit.addEventListener("click", submitResearch);
    actions.append(cancel, submit);

    sheet.append(title, target, lead, aspects, noteLabel, options, hint, actions);
    sheet.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    document.body.append(backdrop, sheet);
    state.els = { backdrop, sheet, target, aspectButtons, note, audio: audio.input, vault: vault.input, submit };
    return state.els;
  }

  function checkbox(text) {
    const label = document.createElement("label");
    label.className = "research-ask-check";
    const input = document.createElement("input");
    input.type = "checkbox";
    const span = document.createElement("span");
    span.textContent = text;
    label.append(input, span);
    return { label, input };
  }

  function toggleAspect(id) {
    const index = state.selected.indexOf(id);
    if (index >= 0) state.selected.splice(index, 1);
    else state.selected.push(id);
    sync();
  }

  function sync() {
    const els = ensureSheet();
    els.aspectButtons.forEach((button) => {
      const on = state.selected.includes(button.dataset.aspect);
      button.classList.toggle("is-selected", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    els.submit.disabled = state.submitting || state.selected.length === 0;
    els.submit.textContent = state.submitting ? "送信中…" : "深掘りする";
  }

  function open(article) {
    if (!canAsk(article)) {
      notify("この記事は深掘りの元にできません");
      return;
    }
    const els = ensureSheet();
    state.article = article;
    state.selected = DEFAULT_ASPECTS.slice();
    state.submitting = false;
    state.returnFocus = document.activeElement;
    els.target.textContent = article.title || article.canonicalUrl || article.articleId;
    els.note.value = "";
    els.audio.checked = false;
    els.vault.checked = false;
    els.backdrop.hidden = false;
    els.sheet.hidden = false;
    document.body.classList.add("research-ask-open");
    sync();
    els.aspectButtons[0].focus();
  }

  function close() {
    if (!state.els) return;
    state.els.backdrop.hidden = true;
    state.els.sheet.hidden = true;
    document.body.classList.remove("research-ask-open");
    state.article = null;
    if (state.returnFocus && typeof state.returnFocus.focus === "function") state.returnFocus.focus();
  }

  async function submitResearch() {
    if (state.submitting || !state.article || !state.selected.length) return;
    const user = firebase.auth().currentUser;
    if (!user) {
      notify("サインインが必要です");
      return;
    }
    const els = ensureSheet();
    const note = els.note.value.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_LENGTH);
    // 観点は表の順にそろえる(同じ依頼なら同じレポートを上書きするため)
    const aspects = ASPECTS.map((aspect) => aspect.id).filter((id) => state.selected.includes(id));
    state.submitting = true;
    sync();
    try {
      const ref = firebase.database().ref("/generationRequests").push();
      await ref.set({
        ownerUid: user.uid,
        kind: "research",
        articleId: state.article.articleId,
        aspects,
        ...(note ? { note } : {}),
        audio: Boolean(els.audio.checked),
        vaultCandidate: Boolean(els.vault.checked),
        status: "queued",
        createdAt: new Date().toISOString(),
        trigger: { provider: "web" }
      });
      watchRequest(ref);
      state.submitting = false;
      close();
      notify("深掘りを依頼しました。できあがると「深掘り」タブに出ます");
    } catch (error) {
      state.submitting = false;
      sync();
      notify(/permission_denied/i.test(String(error && error.message))
        ? "深掘りを依頼する権限がありません"
        : "深掘りの依頼に失敗しました。もう一度お試しください");
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
        const research = value.research || {};
        const unreachable = Number(research.unreachable) || 0;
        notify(unreachable > 0
          ? `深掘りができました（出典${Number(research.used) || 0}件。${unreachable}件は確認できませんでした）`
          : "深掘りができました");
      } else if (value.status === "failed") {
        settle();
        notify(value.statusMessage || "深掘りを作れませんでした");
      }
    };
    const timer = window.setTimeout(settle, WATCH_TIMEOUT_MS);
    ref.on("value", handler);
  }

  window.ResearchAsk = { init, open, close, canAsk, aspects: ASPECTS };
})();
