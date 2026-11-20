// 受信箱(保存しただけの記事)の行の中身と操作ボタン。
// 行そのもの(タップで詳細、スワイプで既読・あとで)は app.js が作り、ここは中身と下の操作だけを受け持つ。
(function () {
  "use strict";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function tldrLines(article) {
    return String(article.tldr || "")
      .split(/\n+/)
      .map((line) => line.replace(/^[-・•*]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  function savedLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    if (days <= 0) return `今日 ${time} に保存`;
    if (days === 1) return `昨日 ${time} に保存`;
    return `${date.getMonth() + 1}月${date.getDate()}日 に保存`;
  }

  /** 3行要約の状態。要約があれば行、無ければ理由か「作成中」。 */
  function summaryState(article) {
    const lines = tldrLines(article);
    if (lines.length) return { kind: "tldr", lines };
    const ingest = article.ingest || {};
    if (ingest.verdict === "failed") return { kind: "failed", text: ingest.message || "本文が取れていません" };
    const status = (article.triage || {}).summaryStatus;
    if (status === "unavailable") return { kind: "failed", text: ingest.message || "本文が取れていません" };
    if (status === "failed") return { kind: "pending", text: "要約を作成できませんでした。次の確認でもう一度試します" };
    return { kind: "pending", text: "要約を作成中（PC の常駐プロセスが動いていれば数分で付きます）" };
  }

  /** 行(button)の中身の HTML。sourceChip は app.js の表示関数を受け取る。 */
  function renderRowContent(article, sourceChip) {
    const summary = summaryState(article);
    const body =
      summary.kind === "tldr"
        ? `<ul class="inbox-tldr">${summary.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
        : `<p class="inbox-summary-note is-${summary.kind}">${escapeHtml(summary.text)}</p>`;
    const saved = savedLabel(article.registeredAt || article.updatedAt);
    return `
      <div class="row-main">
        <div class="row-status">
          ${sourceChip(article.source.kind)}
          ${saved ? `<span class="inbox-saved">${escapeHtml(saved)}</span>` : ""}
        </div>
        <p class="row-title">${escapeHtml(article.title)}</p>
        ${body}
      </div>
      <span class="row-cue" aria-hidden="true">›</span>
    `;
  }

  /**
   * 行の下に置く操作ボタン。hooks: { generate, research, remove, canRemove }
   * 押せない操作(テキスト投入の記事の「生成する」、編集権限の無いときの「削除」、深掘りが未実装のとき)は出さない。
   */
  function renderActions(article, hooks) {
    const actions = document.createElement("div");
    actions.className = "inbox-actions";
    const add = (label, className, handler) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `inbox-action ${className}`;
      button.textContent = label;
      button.setAttribute("aria-label", `${article.title || "記事"}を${label}`);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        handler(article);
      });
      actions.appendChild(button);
    };
    if (article.source.kind === "web" || article.source.kind === "youtube") add("生成する", "is-primary", hooks.generate);
    if (hooks.research) add("深掘り", "", hooks.research);
    if (hooks.canRemove) add("削除", "is-danger", hooks.remove);
    return actions.childElementCount ? actions : null;
  }

  window.InboxRow = { renderRowContent, renderActions, summaryState, tldrLines };
})();
