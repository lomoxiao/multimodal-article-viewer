// 画面下のタブ(受信箱／記事一覧／定期購読／深掘り)。
// どの記事もちょうど 1 つのタブに属する(shelfOf)。選んだタブは次に開いたときも保たれる。
// app.js とは init / shelfOf / current / update の4点だけでつながる独立した部品。
(function () {
  "use strict";

  const STORAGE_KEY = "viewer.shelf";
  const DEFAULT_SHELF = "list";

  // アイコンは線画(stroke="currentColor")。絵文字は使わない
  const SHELVES = [
    {
      id: "inbox",
      label: "受信箱",
      icon: '<path d="M4 13l2.5-8h11L20 13v6H4z"/><path d="M4 13h5l1 2.5h4l1-2.5h5"/>'
    },
    {
      id: "list",
      label: "記事一覧",
      icon: '<rect x="4" y="6" width="16" height="13" rx="3"/><path d="M7 3h10M8 11h8M8 15h5"/>'
    },
    {
      id: "subscription",
      label: "定期購読",
      icon: '<rect x="4" y="6" width="16" height="14" rx="3"/><path d="M8 3v4M16 3v4M4 11h16"/><circle cx="12" cy="15.5" r="1.2"/>'
    },
    {
      id: "research",
      label: "深掘り",
      icon: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.6-4.6M11 8.5v5M8.5 11h5"/>'
    }
  ];
  const SHELF_IDS = SHELVES.map((shelf) => shelf.id);

  /**
   * 記事が属するタブ。上から順に判定し、最初に当たったもの。
   * 生成を依頼した時点で成果物の節(processing)ができるので、そこで記事一覧へ移る。
   */
  function shelfOf(article) {
    if (!article) return "list";
    if (article.isDigest) return "subscription";
    const kind = article.source && article.source.kind;
    if (kind === "research") return "research";
    if (kind === "bundle") return "list";
    if ((article.slides && article.slides.exists) || (article.manga && article.manga.exists) || (article.video && article.video.exists)) {
      return "list";
    }
    return "inbox";
  }

  function readStored() {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return SHELF_IDS.includes(value) ? value : DEFAULT_SHELF;
    } catch {
      return DEFAULT_SHELF;
    }
  }

  function store(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // 保存できなくても切り替え自体は動く
    }
  }

  const state = { current: readStored(), nav: null, buttons: {}, badges: {}, hooks: null, pane: null };

  function syncButtons() {
    SHELVES.forEach((shelf) => {
      const button = state.buttons[shelf.id];
      if (!button) return;
      const active = shelf.id === state.current;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    document.body.dataset.shelf = state.current;
  }

  function select(id) {
    if (!SHELF_IDS.includes(id) || id === state.current) return;
    state.current = id;
    store(id);
    syncButtons();
    if (state.hooks && state.hooks.onChange) state.hooks.onChange(id);
    window.scrollTo(0, 0);
  }

  // 768px 以上では、一覧の列の幅に合わせる(右の詳細の列には被せない)
  function syncWidth() {
    if (!state.nav) return;
    if (window.matchMedia("(min-width: 768px)").matches && state.pane) {
      const rect = state.pane.getBoundingClientRect();
      state.nav.style.left = `${Math.max(0, rect.left)}px`;
      state.nav.style.width = `${rect.width}px`;
    } else {
      state.nav.style.left = "";
      state.nav.style.width = "";
    }
  }

  function init(hooks) {
    state.hooks = hooks;
    if (state.nav) return;
    const nav = document.createElement("nav");
    nav.className = "shelf-nav";
    nav.setAttribute("aria-label", "表示の切り替え");
    SHELVES.forEach((shelf) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "shelf-nav-button";
      button.dataset.shelf = shelf.id;
      button.innerHTML =
        `<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${shelf.icon}</svg>` +
        `<span class="shelf-nav-label">${shelf.label}</span>`;
      const badge = document.createElement("span");
      badge.className = "shelf-nav-badge";
      badge.hidden = true;
      button.appendChild(badge);
      button.addEventListener("click", () => select(shelf.id));
      nav.appendChild(button);
      state.buttons[shelf.id] = button;
      state.badges[shelf.id] = badge;
    });
    document.body.appendChild(nav);
    document.body.classList.add("has-shelf-nav");
    state.nav = nav;
    state.pane = document.querySelector(".library-pane");
    syncButtons();
    syncWidth();
    window.addEventListener("resize", syncWidth);
  }

  function formatCount(count) {
    return count > 99 ? "99+" : String(count);
  }

  /** バッジを更新する。受信箱は件数、定期購読と深掘りは未読の件数。 */
  function update(articles, readStateOf) {
    const counts = { inbox: 0, subscription: 0, research: 0 };
    (articles || []).forEach((article) => {
      const shelf = shelfOf(article);
      if (shelf === "inbox") counts.inbox += 1;
      else if ((shelf === "subscription" || shelf === "research") && readStateOf(article.articleId) === "unread") counts[shelf] += 1;
    });
    Object.entries(counts).forEach(([id, count]) => {
      const badge = state.badges[id];
      if (!badge) return;
      badge.hidden = count === 0;
      badge.textContent = count ? formatCount(count) : "";
      const label = SHELVES.find((shelf) => shelf.id === id).label;
      state.buttons[id].setAttribute(
        "aria-label",
        count ? `${label}（${id === "inbox" ? "" : "未読"}${count}件）` : label
      );
    });
    syncWidth();
  }

  window.ShelfNav = {
    init,
    shelfOf,
    update,
    select,
    current: () => state.current,
    shelves: () => SHELVES.map(({ id, label }) => ({ id, label }))
  };
})();
