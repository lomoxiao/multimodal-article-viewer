// 束(複数記事のまとめ)の詳細に出す「この束の記事」一覧。
// app.js とは render の1点だけでつながる独立した部品。束でない記事では何も出さない。
//
// 束を読んでも、中の記事は自動では既読にしない(読んだのはまとめであって記事そのものではないため)。
// 「中の記事をすべて既読にする」を押したときだけ既読にする。
(function () {
  "use strict";

  function render(anchor, article, hooks) {
    const parent = anchor.parentNode;
    const previous = parent.querySelector(".bundle-members");
    if (previous) previous.remove();
    if (!article || article.source.kind !== "bundle") return;
    const progress = article.bundleStatus || {};
    const showProgress = progress.status === "processing" || progress.status === "failed";
    if (!article.bundleMembers.length && !showProgress) return;

    const included = article.bundleMembers.filter((member) => member.status === "included");
    const missing = article.bundleMembers.filter((member) => member.status === "missing");

    const section = document.createElement("section");
    section.className = "bundle-members";

    // 作成状況。作成中はいま何をしているか、失敗時は理由を出す(完了後は出さない)
    if (showProgress) {
      const note = document.createElement("p");
      note.className = `bundle-progress is-${progress.status}`;
      note.setAttribute("role", "status");
      note.textContent = progress.status === "processing"
        ? `作成中: ${progress.stage || "準備中"}`
        : progress.message || "束を作れませんでした";
      section.appendChild(note);
    }
    if (!article.bundleMembers.length) {
      parent.insertBefore(section, anchor.nextSibling);
      return;
    }

    const heading = document.createElement("p");
    heading.className = "detail-kicker";
    heading.textContent = `この束の記事（${included.length}本）`;
    section.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "bundle-member-list";
    included.forEach((member) => {
      const item = document.createElement("li");
      const exists = Boolean(hooks.findArticle(member.articleId));
      const label = member.title || member.articleId;
      if (exists) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "bundle-member-link";
        button.textContent = label;
        if (hooks.readStateOf(member.articleId) === "read") button.classList.add("is-read");
        button.addEventListener("click", () => hooks.openArticle(member.articleId));
        item.appendChild(button);
      } else {
        // 一覧から消えている記事(削除済みなど)は名前だけ出す
        item.className = "bundle-member-gone";
        item.textContent = label;
      }
      list.appendChild(item);
    });
    section.appendChild(list);

    if (missing.length) {
      const missingHeading = document.createElement("p");
      missingHeading.className = "detail-kicker";
      missingHeading.textContent = `含められなかった記事（${missing.length}本）`;
      section.appendChild(missingHeading);
      const missingList = document.createElement("ul");
      missingList.className = "bundle-member-list is-missing";
      missing.forEach((member) => {
        const item = document.createElement("li");
        item.textContent = `${member.title || member.articleId}${member.reason ? `（${member.reason}）` : ""}`;
        missingList.appendChild(item);
      });
      section.appendChild(missingList);
    }

    const unread = included.filter(
      (member) => hooks.findArticle(member.articleId) && hooks.readStateOf(member.articleId) !== "read"
    );
    if (unread.length) {
      const markAll = document.createElement("button");
      markAll.type = "button";
      markAll.className = "bundle-mark-read";
      markAll.textContent = `中の記事をすべて既読にする（${unread.length}本）`;
      markAll.addEventListener("click", () => {
        unread.forEach((member) => hooks.markRead(member.articleId));
        hooks.showStatus(`${unread.length}本を既読にしました`);
        markAll.remove();
      });
      section.appendChild(markAll);
    }

    parent.insertBefore(section, anchor.nextSibling);
  }

  window.ArticleBundleView = { render };
})();
