// 記事の詳細に出す深掘りの部品。app.js とは render の1点だけでつながる独立した部品。
// - 深掘りレポート: 作成状況(作成中・失敗の理由)、元の記事、使った出典と確認できなかった出典。
//   出典は「保存」で受信箱に入れられる(依頼キューに kind: "save" を書く)。
// - 通常の記事: 「この記事を深掘りする」と、この記事から作った深掘りレポートへの入口。
(function () {
  "use strict";

  const saved = new Set();

  function render(anchor, article, hooks) {
    const parent = anchor.parentNode;
    const previous = parent.querySelector(".research-panel");
    if (previous) previous.remove();
    if (!article) return;
    const section = article.source.kind === "research"
      ? renderReport(article, hooks)
      : renderEntry(article, hooks);
    if (section) parent.insertBefore(section, anchor.nextSibling);
  }

  function renderEntry(article, hooks) {
    if (!window.ResearchAsk || !window.ResearchAsk.canAsk(article)) return null;
    const section = document.createElement("section");
    section.className = "research-panel is-entry";
    const reports = hooks.findReports(article.articleId);
    if (reports.length) {
      const heading = document.createElement("p");
      heading.className = "detail-kicker";
      heading.textContent = `この記事の深掘り（${reports.length}件）`;
      section.appendChild(heading);
      const list = document.createElement("ul");
      list.className = "research-report-list";
      reports.forEach((report) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "research-report-link";
        button.textContent = report.title || report.articleId;
        button.addEventListener("click", () => hooks.openArticle(report.articleId));
        item.appendChild(button);
        list.appendChild(item);
      });
      section.appendChild(list);
    }
    const ask = document.createElement("button");
    ask.type = "button";
    ask.className = "research-ask-open-button";
    ask.textContent = "この記事を深掘りする";
    ask.addEventListener("click", () => window.ResearchAsk.open(article));
    section.appendChild(ask);
    return section;
  }

  function renderReport(article, hooks) {
    const progress = article.researchStatus || {};
    const sources = article.researchSources || [];
    const section = document.createElement("section");
    section.className = "research-panel is-report";

    if (progress.status === "processing" || progress.status === "failed") {
      const note = document.createElement("p");
      note.className = `bundle-progress is-${progress.status}`;
      note.setAttribute("role", "status");
      note.textContent = progress.status === "processing"
        ? `作成中: ${progress.stage || "準備中"}`
        : progress.message || "深掘りを作れませんでした";
      section.appendChild(note);
    }

    const base = article.researchBaseId ? hooks.findArticle(article.researchBaseId) : null;
    if (base) {
      const heading = document.createElement("p");
      heading.className = "detail-kicker";
      heading.textContent = "元の記事";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "research-report-link";
      button.textContent = base.title || base.articleId;
      button.addEventListener("click", () => hooks.openArticle(base.articleId));
      section.append(heading, button);
    }

    const used = sources.filter((source) => source.status === "used");
    const unreachable = sources.filter((source) => source.status === "unreachable");
    if (used.length) section.append(...sourceList(`出典（${used.length}件）`, used, hooks, false));
    if (unreachable.length) {
      section.append(...sourceList(`確認できなかった出典（${unreachable.length}件・レポートには使っていません）`, unreachable, hooks, true));
    }
    return section.childElementCount ? section : null;
  }

  function sourceList(title, sources, hooks, missing) {
    const heading = document.createElement("p");
    heading.className = "detail-kicker";
    heading.textContent = title;
    const list = document.createElement("ul");
    list.className = `research-source-list${missing ? " is-missing" : ""}`;
    sources.forEach((source) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.className = "research-source-link";
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `${source.index ? `[${source.index}] ` : ""}${source.title || source.url}`;
      item.appendChild(link);
      if (missing && source.reason) {
        const reason = document.createElement("small");
        reason.textContent = source.reason;
        item.appendChild(reason);
      }
      const save = document.createElement("button");
      save.type = "button";
      save.className = "research-source-save";
      save.textContent = saved.has(source.url) ? "保存済み" : "保存";
      save.disabled = saved.has(source.url);
      save.addEventListener("click", () => saveSource(source, save, hooks));
      item.appendChild(save);
      list.appendChild(item);
    });
    return [heading, list];
  }

  async function saveSource(source, button, hooks) {
    const user = firebase.auth().currentUser;
    if (!user) {
      hooks.showStatus("サインインが必要です");
      return;
    }
    button.disabled = true;
    try {
      await firebase.database().ref("/generationRequests").push().set({
        ownerUid: user.uid,
        kind: "save",
        urls: [source.url],
        ...(source.title ? { title: source.title.slice(0, 200) } : {}),
        status: "queued",
        createdAt: new Date().toISOString(),
        trigger: { provider: "web" }
      });
      saved.add(source.url);
      button.textContent = "保存済み";
      hooks.showStatus("受信箱に保存しました");
    } catch (error) {
      button.disabled = false;
      hooks.showStatus(/permission_denied/i.test(String(error && error.message)) ? "保存する権限がありません" : "保存に失敗しました");
    }
  }

  function isHttpUrl(value) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }

  // Firebase の値を表示用にそろえる(app.js の normalizeArticle から呼ぶ)
  function normalizeSources(value) {
    const list = Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
    return list
      .map((source) => ({
        index: Number((source || {}).index) || 0,
        title: String((source || {}).title || ""),
        url: String((source || {}).url || ""),
        status: (source || {}).status === "unreachable" ? "unreachable" : "used",
        reason: String((source || {}).reason || "")
      }))
      .filter((source) => isHttpUrl(source.url));
  }

  window.ArticleResearchView = { render, normalizeSources };
})();
