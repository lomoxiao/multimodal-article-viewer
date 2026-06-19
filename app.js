const fallbackArticles = [
  {
    articleId: "url_a8f31c9d4e21b7aa",
    canonicalUrl: "https://example.com/article",
    originalUrl: "https://example.com/article?utm_source=twitter",
    title: "記事タイトル",
    source: {
      kind: "web",
      headline:
        "AnthropicがFable 5・Mythos 5を米政府輸出管理指令で全面停止・史上初・SpaceX上場時価総額1.75兆ドル・G7エヴィアン明日15日開幕・トランプ・イラン合意署名・日経平均66,020円"
    },
    slides: {
      status: "completed",
      url: "https://docs.google.com/presentation/d/1ExampleSlidesDeckIdForViewer/edit"
    },
    manga: {
      status: "completed",
      url: "https://notebooklm.google.com/notebook/example"
    },
    updatedAt: "2026-06-14T00:00:00.000Z"
  },
  {
    articleId: "yt_c12b8d4429",
    canonicalUrl: "https://www.youtube.com/watch?v=example",
    originalUrl: "https://youtu.be/example",
    title: "AIエージェント市場の最新動向",
    source: {
      kind: "youtube",
      headline:
        "主要クラウド各社のエージェント基盤、企業導入の壁、ワークフロー自動化の評価軸を20分で整理"
    },
    slides: {
      status: "processing",
      url: ""
    },
    manga: {
      status: "pending",
      url: ""
    },
    updatedAt: "2026-06-13T10:30:00.000Z"
  },
  {
    articleId: "url_b72a901e10",
    canonicalUrl: "https://example.com/report",
    originalUrl: "https://example.com/report",
    title: "週次リサーチまとめ",
    source: {
      kind: "web",
      headline:
        "半導体、生成AI、宇宙開発、金融政策の注目ニュースをチーム共有向けに要点化"
    },
    slides: {
      status: "completed",
      url: "https://docs.google.com/presentation/d/1WeeklyResearchDeckId/edit"
    },
    manga: {
      status: "failed",
      url: ""
    },
    updatedAt: "2026-06-12T21:15:00.000Z"
  }
];

let articles = [];

const state = {
  activeKind: "all",
  query: "",
  selectedId: null,
  currentSlideIndex: 0,
  viewerPages: []
};

const els = {
  articleCount: document.getElementById("articleCount"),
  articleList: document.getElementById("articleList"),
  searchInput: document.getElementById("searchInput"),
  segments: Array.from(document.querySelectorAll(".segment")),
  workspacePane: document.getElementById("workspacePane"),
  emptyWorkspace: document.getElementById("emptyWorkspace"),
  detailPanel: document.getElementById("detailPanel"),
  detailMeta: document.getElementById("detailMeta"),
  detailTitle: document.getElementById("detailTitle"),
  detailHeadline: document.getElementById("detailHeadline"),
  detailActions: document.getElementById("detailActions"),
  closeDetailButton: document.getElementById("closeDetailButton"),
  sheetBackdrop: document.getElementById("sheetBackdrop"),
  slidesViewer: document.getElementById("slidesViewer"),
  slidesTitle: document.getElementById("slidesTitle"),
  openSlidesExternal: document.getElementById("openSlidesExternal"),
  slideFrame: document.getElementById("slideFrame"),
  slideCounter: document.getElementById("slideCounter"),
  prevSlideButton: document.getElementById("prevSlideButton"),
  nextSlideButton: document.getElementById("nextSlideButton"),
  backToDetailButton: document.getElementById("backToDetailButton"),
  speakerNoteContent: document.getElementById("speakerNoteContent"),
  thumbnailStrip: document.getElementById("thumbnailStrip")
};

async function init() {
  articles = await loadArticles();
  articles.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderList();
  });

  els.segments.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeKind = button.dataset.kind;
      els.segments.forEach((segment) => {
        const active = segment === button;
        segment.classList.toggle("is-active", active);
        segment.setAttribute("aria-selected", active ? "true" : "false");
      });
      renderList();
    });
  });

  els.closeDetailButton.addEventListener("click", closeMobileWorkspace);
  els.sheetBackdrop.addEventListener("click", closeMobileWorkspace);
  els.backToDetailButton.addEventListener("click", () => showDetail(getSelectedArticle(), { keepSheet: true }));
  els.prevSlideButton.addEventListener("click", () => setSlideIndex(state.currentSlideIndex - 1));
  els.nextSlideButton.addEventListener("click", () => setSlideIndex(state.currentSlideIndex + 1));

  renderList();
  if (articles.length) {
    selectArticle(articles[0].articleId, { openSheet: false });
  }
}

async function loadArticles() {
  if (window.location.protocol === "file:") {
    return fallbackArticles;
  }

  try {
    const response = await fetch("articles.json", { cache: "no-store" });
    if (!response.ok) return fallbackArticles;
    const payload = await response.json();
    return Array.isArray(payload) ? payload : fallbackArticles;
  } catch {
    return fallbackArticles;
  }
}

function renderList() {
  const filtered = getFilteredArticles();
  els.articleCount.textContent = `${filtered.length}件`;
  els.articleList.innerHTML = "";

  if (!filtered.length) {
    els.articleList.innerHTML = '<p class="empty-list">該当する記事がありません。</p>';
    return;
  }

  filtered.forEach((article) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `article-row${article.articleId === state.selectedId ? " is-selected" : ""}`;
    row.addEventListener("click", () => selectArticle(article.articleId, { openSheet: true }));
    row.innerHTML = `
      <div class="row-main">
        <div class="row-top">
          ${sourceChip(article.source.kind)}
          ${statusChip("Slides", article.slides.status)}
          ${statusChip("Manga", article.manga.status)}
        </div>
        <p class="row-title">${escapeHtml(article.title)}</p>
        <p class="row-headline">${escapeHtml(article.source.headline)}</p>
      </div>
      <span class="detail-cue">詳細</span>
    `;
    els.articleList.appendChild(row);
  });
}

function getFilteredArticles() {
  return articles.filter((article) => {
    const kindMatches = state.activeKind === "all" || article.source.kind === state.activeKind;
    const haystack = `${article.title} ${article.source.headline}`.toLowerCase();
    return kindMatches && (!state.query || haystack.includes(state.query));
  });
}

function selectArticle(articleId, options = {}) {
  state.selectedId = articleId;
  renderList();
  showDetail(getSelectedArticle(), { keepSheet: options.openSheet });
}

function getSelectedArticle() {
  return articles.find((article) => article.articleId === state.selectedId) || articles[0];
}

function showDetail(article, options = {}) {
  if (!article) return;
  els.emptyWorkspace.hidden = true;
  els.slidesViewer.hidden = true;
  els.detailPanel.hidden = false;
  els.workspacePane.classList.toggle("has-mobile-detail", Boolean(options.keepSheet));
  document.body.classList.toggle("sheet-open", Boolean(options.keepSheet));
  els.sheetBackdrop.hidden = !options.keepSheet || isTabletLayout();

  els.detailMeta.textContent = `${sourceLabel(article.source.kind)} · ${formatDate(article.updatedAt)} · ${article.articleId}`;
  els.detailTitle.textContent = article.title;
  els.detailHeadline.textContent = article.source.headline;
  els.detailActions.innerHTML = "";

  [
    {
      icon: "W",
      title: "元記事",
      note: getUrlHost(article.canonicalUrl || article.originalUrl),
      enabled: Boolean(article.canonicalUrl || article.originalUrl),
      action: () => openExternal(article.canonicalUrl || article.originalUrl)
    },
    {
      icon: "S",
      title: "Google Slides",
      note: article.slides.status === "completed" ? "ビューアで開く" : statusLabel(article.slides.status),
      enabled: article.slides.status === "completed" && Boolean(article.slides.url),
      action: () => openSlidesViewer(article)
    },
    {
      icon: "N",
      title: "漫画 / NotebookLM",
      note: article.manga.status === "completed" ? "NotebookLMを外部で開く" : statusLabel(article.manga.status),
      enabled: article.manga.status === "completed" && Boolean(article.manga.url),
      action: () => openExternal(article.manga.url)
    }
  ].forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "destination";
    button.setAttribute("aria-disabled", item.enabled ? "false" : "true");
    button.innerHTML = `
      <span class="destination-icon">${item.icon}</span>
      <span>
        <span class="destination-title">${escapeHtml(item.title)}</span>
        <span class="destination-note">${escapeHtml(item.note || "URL未設定")}</span>
      </span>
      <span aria-hidden="true">›</span>
    `;
    button.addEventListener("click", () => {
      if (item.enabled) item.action();
    });
    els.detailActions.appendChild(button);
  });
}

function openSlidesViewer(article) {
  state.viewerPages = createViewerPages(article);
  state.currentSlideIndex = 0;
  els.detailPanel.hidden = true;
  els.emptyWorkspace.hidden = true;
  els.slidesViewer.hidden = false;
  els.workspacePane.classList.add("has-mobile-detail");
  document.body.classList.add("sheet-open");
  els.sheetBackdrop.hidden = true;
  els.slidesTitle.textContent = article.title;
  els.openSlidesExternal.href = article.slides.url;
  renderThumbnails();
  setSlideIndex(0);
}

function createViewerPages(article) {
  const presentationId = extractPresentationId(article.slides.url);
  const baseNotes = [
    "既存 Google Slides Viewer のスライド閲覧部分を想定したプレビューです。",
    "本番では presentationId を使ってページ画像、サムネイル、スピーカーノートを取得します。",
    "iPadでは一覧を左に残し、右側でスライドとノートを同時に確認できます。",
    "外部で開く操作からGoogle Slides本体にも移動できます。"
  ];
  return baseNotes.map((note, index) => ({
    pageNumber: index + 1,
    title: index === 0 ? article.title : `${article.title} ${index + 1}`,
    subtitle: presentationId ? `presentationId: ${presentationId}` : "Google Slides URL",
    speakerNote: note
  }));
}

function setSlideIndex(nextIndex) {
  if (!state.viewerPages.length) return;
  const max = state.viewerPages.length - 1;
  state.currentSlideIndex = Math.max(0, Math.min(max, nextIndex));
  const page = state.viewerPages[state.currentSlideIndex];
  els.slideFrame.innerHTML = `
    <div class="slide-card-preview">
      <strong>${escapeHtml(page.title)}</strong>
      <span>${escapeHtml(page.subtitle)}</span>
      <span>Page ${page.pageNumber}</span>
    </div>
  `;
  els.slideCounter.textContent = `${page.pageNumber} / ${state.viewerPages.length}`;
  els.speakerNoteContent.textContent = page.speakerNote;
  els.prevSlideButton.disabled = state.currentSlideIndex === 0;
  els.nextSlideButton.disabled = state.currentSlideIndex === max;
  renderThumbnails();
}

function renderThumbnails() {
  els.thumbnailStrip.innerHTML = "";
  state.viewerPages.forEach((page, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `thumbnail-button${index === state.currentSlideIndex ? " is-active" : ""}`;
    button.textContent = page.pageNumber;
    button.setAttribute("aria-label", `Page ${page.pageNumber}`);
    button.addEventListener("click", () => setSlideIndex(index));
    els.thumbnailStrip.appendChild(button);
  });
}

function closeMobileWorkspace() {
  els.workspacePane.classList.remove("has-mobile-detail");
  document.body.classList.remove("sheet-open");
  els.sheetBackdrop.hidden = true;
}

function openExternal(url) {
  window.open(url, "_blank", "noopener");
}

function isTabletLayout() {
  return window.matchMedia("(min-width: 768px)").matches;
}

function sourceChip(kind) {
  return `<span class="chip is-${escapeHtml(kind)}">${sourceLabel(kind)}</span>`;
}

function statusChip(label, status) {
  return `<span class="status-chip is-${escapeHtml(status)}">${label}: ${statusLabel(status)}</span>`;
}

function sourceLabel(kind) {
  if (kind === "youtube") return "YouTube";
  if (kind === "web") return "Web";
  return kind || "Source";
}

function statusLabel(status) {
  const labels = {
    completed: "完了",
    processing: "処理中",
    pending: "待機中",
    failed: "失敗"
  };
  return labels[status] || status || "未設定";
}

function formatDate(value) {
  if (!value) return "更新日時なし";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getUrlHost(url) {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function extractPresentationId(url) {
  if (!url) return "";
  const match = url.match(/\/presentation\/d\/([^/]+)/);
  return match ? match[1] : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

init();
