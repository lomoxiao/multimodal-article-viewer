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
  viewerPages: [],
  currentPresentationId: "",
  pageCount: 0,
  pageWindowRequests: {},
  fullscreenRequestId: 0,
  controlsIdleTimer: null,
  viewerTouchStartX: null,
  viewerTouchStartY: null,
  viewerTouchStartTarget: null,
  isAutoImmersive: false
};

const apiClient = {
  getConfig() {
    return window.MULTIMODAL_VIEWER_CONFIG || {};
  },

  hasApiUrl() {
    return Boolean(this.getConfig().GAS_API_URL);
  },

  get(action, params = {}) {
    const config = this.getConfig();
    const url = new URL(config.GAS_API_URL);
    url.searchParams.set("action", action);
    if (config.CLIENT_KEY) {
      url.searchParams.set("clientKey", config.CLIENT_KEY);
    }
    Object.keys(params).forEach((key) => {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.set(key, String(params[key]));
      }
    });
    return fetch(url.toString(), { method: "GET" }).then(parseApiResponse);
  }
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
  fullscreenButton: document.getElementById("fullscreenButton"),
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
  els.backToDetailButton.addEventListener("click", returnFromSlidesViewer);
  els.fullscreenButton.addEventListener("click", toggleViewerFullscreen);
  els.prevSlideButton.addEventListener("click", () => setSlideIndex(state.currentSlideIndex - 1));
  els.nextSlideButton.addEventListener("click", () => setSlideIndex(state.currentSlideIndex + 1));
  els.slidesViewer.addEventListener("touchstart", handleViewerTouchStart, { passive: true });
  els.slidesViewer.addEventListener("touchend", handleViewerTouchEnd, { passive: true });
  ["click", "mousemove"].forEach((eventName) => {
    els.slidesViewer.addEventListener(eventName, () => {
      if (eventName === "click" && isCoarsePointer()) return;
      wakeViewerControls();
    }, { passive: true });
  });

  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
  document.addEventListener("fullscreenerror", handleFullscreenError);
  document.addEventListener("webkitfullscreenerror", handleFullscreenError);
  window.addEventListener("orientationchange", handleViewportChange);
  window.addEventListener("resize", handleViewportChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", handleViewportChange);
  }
  document.addEventListener("keydown", (event) => {
    if (els.slidesViewer.hidden) return;
    if (event.key === "ArrowRight") setSlideIndex(state.currentSlideIndex + 1);
    if (event.key === "ArrowLeft") setSlideIndex(state.currentSlideIndex - 1);
    if (event.key === "Escape") {
      if (isViewerImmersive()) {
        exitViewerFullscreen();
      } else {
        returnFromSlidesViewer();
      }
    }
    wakeViewerControls();
  });

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
  exitViewerFullscreen();
  document.body.classList.remove("slides-viewer-open");
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
  const presentationId = extractPresentationId(article.slides.url);
  state.currentPresentationId = presentationId;
  state.viewerPages = createViewerPlaceholders(article, presentationId);
  state.currentSlideIndex = 0;
  state.pageCount = state.viewerPages.length;
  state.pageWindowRequests = {};
  els.detailPanel.hidden = true;
  els.emptyWorkspace.hidden = true;
  els.slidesViewer.hidden = false;
  els.workspacePane.classList.add("has-mobile-detail");
  document.body.classList.add("sheet-open", "slides-viewer-open");
  els.sheetBackdrop.hidden = true;
  els.slidesTitle.textContent = article.title;
  els.openSlidesExternal.href = article.slides.url;
  renderThumbnails();
  setSlideIndex(0);
  loadSlidePageWindow(0, getInitialPageCount());
  updateViewerViewportHeight();
  applyAutoImmersiveMode();
}

function createViewerPlaceholders(article, presentationId) {
  const previewUrl = presentationId ? createSlidesPreviewUrl(presentationId) : "";
  return Array.from({ length: 1 }, (_, index) => ({
    pageNumber: index + 1,
    title: article.title,
    subtitle: presentationId ? `presentationId: ${presentationId}` : "Google Slides URL",
    speakerNote: presentationId
      ? "ページ画像とspeaker notesを読み込んでいます。"
      : "Google Slides URL から presentationId を抽出できませんでした。外部で開く操作を使ってください。",
    hasSpeakerNote: false,
    imageUrl: "",
    previewUrl,
    isLoaded: false,
    isLoading: Boolean(presentationId)
  }));
}

function setSlideIndex(nextIndex) {
  if (!state.viewerPages.length) return;
  const max = state.viewerPages.length - 1;
  state.currentSlideIndex = Math.max(0, Math.min(max, nextIndex));
  loadSlidePageWindow(state.currentSlideIndex, getInitialPageCount());
  renderSlidesViewer();
}

function renderSlidesViewer() {
  if (!state.viewerPages.length) return;
  const page = state.viewerPages[state.currentSlideIndex];
  if (page.imageUrl) {
    els.slideFrame.innerHTML = `<img class="slide-image" src="${escapeHtml(page.imageUrl)}" alt="${escapeHtml(page.title)} page ${page.pageNumber}">`;
  } else if (page.isLoading) {
    els.slideFrame.innerHTML = `
      <div class="viewer-message">
        <strong>ページを読み込んでいます</strong>
        <span>Google Slides APIからスライド画像とspeaker notesを取得しています。</span>
      </div>
    `;
  } else if (page.previewUrl) {
    els.slideFrame.innerHTML = `<iframe class="slides-embed" src="${escapeHtml(page.previewUrl)}" title="${escapeHtml(page.title)}" allowfullscreen></iframe>`;
  } else {
    els.slideFrame.innerHTML = `
      <div class="slide-card-preview">
        <strong>${escapeHtml(page.title)}</strong>
        <span>${escapeHtml(page.subtitle)}</span>
        <span>Page ${page.pageNumber}</span>
      </div>
    `;
  }

  const total = state.pageCount || state.viewerPages.length;
  els.slideCounter.textContent = `Page ${page.pageNumber} / ${total}`;
  els.speakerNoteContent.textContent = getSpeakerNoteText(page);
  els.prevSlideButton.disabled = state.currentSlideIndex === 0;
  els.nextSlideButton.disabled = state.currentSlideIndex >= total - 1;
  renderThumbnails();
}

function renderThumbnails() {
  els.thumbnailStrip.innerHTML = "";
  state.viewerPages.forEach((page, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `thumbnail-button${index === state.currentSlideIndex ? " is-active" : ""}`;
    button.innerHTML = page.imageUrl
      ? `<img src="${escapeHtml(page.imageUrl)}" alt="Page ${page.pageNumber}">`
      : `<span>Page ${page.pageNumber}</span>`;
    button.setAttribute("aria-label", `Page ${page.pageNumber}`);
    button.addEventListener("click", () => setSlideIndex(index));
    els.thumbnailStrip.appendChild(button);
  });
}

function loadSlidePageWindow(startIndex, count) {
  if (!state.currentPresentationId || !apiClient.hasApiUrl()) return;
  const safeStart = Math.max(0, startIndex);
  const requestKey = `${state.currentPresentationId}:${safeStart}:${count}`;
  if (state.pageWindowRequests[requestKey]) return;
  const alreadyLoaded = state.viewerPages
    .slice(safeStart, safeStart + count)
    .every((page) => page && page.isLoaded);
  if (alreadyLoaded) return;

  markPagesLoading(safeStart, count);
  state.pageWindowRequests[requestKey] = true;
  apiClient.get("getPageWindow", {
    presentationId: state.currentPresentationId,
    startIndex: safeStart,
    count
  })
    .then((result) => {
      delete state.pageWindowRequests[requestKey];
      mergeSlidePageWindow(result);
      renderSlidesViewer();
    })
    .catch(() => {
      delete state.pageWindowRequests[requestKey];
      markPagesLoadFailed(safeStart, count);
      renderSlidesViewer();
    });
}

function mergeSlidePageWindow(result) {
  if (!result || !Array.isArray(result.pages)) return;
  state.pageCount = Number(result.pageCount || state.pageCount || result.pages.length || 0);
  ensureViewerPageCount(state.pageCount);

  result.pages.forEach((incoming, offset) => {
    const index = Number(result.startIndex || 0) + offset;
    state.viewerPages[index] = {
      ...state.viewerPages[index],
      ...incoming,
      isLoaded: true,
      isLoading: false,
      previewUrl: ""
    };
  });
}

function ensureViewerPageCount(count) {
  const total = Math.max(1, Number(count || 0));
  const article = getSelectedArticle();
  while (state.viewerPages.length < total) {
    const index = state.viewerPages.length;
    state.viewerPages.push({
      pageNumber: index + 1,
      title: article.title,
      subtitle: state.currentPresentationId ? `presentationId: ${state.currentPresentationId}` : "Google Slides URL",
      speakerNote: "ページ読み込み後に表示します。",
      hasSpeakerNote: false,
      imageUrl: "",
      previewUrl: "",
      isLoaded: false,
      isLoading: false
    });
  }
}

function markPagesLoading(startIndex, count) {
  ensureViewerPageCount(Math.max(state.viewerPages.length, startIndex + count));
  for (let index = startIndex; index < startIndex + count; index += 1) {
    if (state.viewerPages[index] && !state.viewerPages[index].isLoaded) {
      state.viewerPages[index].isLoading = true;
    }
  }
}

function markPagesLoadFailed(startIndex, count) {
  for (let index = startIndex; index < startIndex + count; index += 1) {
    if (state.viewerPages[index] && !state.viewerPages[index].isLoaded) {
      state.viewerPages[index].isLoading = false;
      state.viewerPages[index].speakerNote = "ページを読み込めなかったため、speaker notesを表示できません。";
    }
  }
}

function getSpeakerNoteText(page) {
  if (!page) return "";
  if (page.hasSpeakerNote) return page.speakerNote || "";
  if (page.isLoading) return "ページ読み込み後に表示します。";
  return page.speakerNote || "このページにはspeaker notesがありません。";
}

function getInitialPageCount() {
  const config = apiClient.getConfig();
  return Math.max(1, Number(config.INITIAL_PAGE_COUNT || 3));
}

function parseApiResponse(response) {
  if (!response.ok) {
    throw new Error(`API request failed: HTTP ${response.status}`);
  }
  return response.json().then((result) => {
    if (!result || !result.ok) {
      const message = result && result.error && result.error.message
        ? result.error.message
        : "API request failed.";
      throw new Error(message);
    }
    return result.data;
  });
}

function closeMobileWorkspace() {
  els.workspacePane.classList.remove("has-mobile-detail");
  document.body.classList.remove("sheet-open", "slides-viewer-open");
  els.sheetBackdrop.hidden = true;
  exitViewerFullscreen();
}

function returnFromSlidesViewer() {
  exitViewerFullscreen();
  showDetail(getSelectedArticle(), { keepSheet: true });
}

function toggleViewerFullscreen() {
  if (getFullscreenElement() || isViewerImmersive()) {
    state.isAutoImmersive = false;
    exitViewerFullscreen();
    return;
  }

  state.fullscreenRequestId += 1;
  const requestId = state.fullscreenRequestId;
  enterViewerImmersive({ auto: false, wakeControls: true });

  const requestFullscreen = els.slidesViewer.requestFullscreen ||
    els.slidesViewer.webkitRequestFullscreen ||
    els.slidesViewer.webkitRequestFullScreen ||
    els.slidesViewer.msRequestFullscreen;

  if (!requestFullscreen) {
    markFullscreenUnavailable();
    return;
  }

  try {
    const result = requestFullscreen.call(els.slidesViewer, { navigationUI: "hide" });
    if (result && result.catch) {
      result
        .then(() => {
          if (requestId !== state.fullscreenRequestId) return;
          document.body.classList.add("viewer-native-fullscreen");
          document.body.classList.remove("viewer-fullscreen-unavailable");
          syncFullscreenButton();
        })
        .catch(markFullscreenUnavailable);
    } else {
      window.setTimeout(() => {
        if (requestId !== state.fullscreenRequestId) return;
        if (getFullscreenElement()) {
          document.body.classList.add("viewer-native-fullscreen");
          document.body.classList.remove("viewer-fullscreen-unavailable");
        } else {
          markFullscreenUnavailable();
        }
        syncFullscreenButton();
      }, 350);
    }
  } catch {
    markFullscreenUnavailable();
  }
}

function enterViewerImmersive(options = {}) {
  state.isAutoImmersive = Boolean(options.auto);
  document.body.classList.add("viewer-immersive");
  document.body.classList.remove("viewer-fullscreen-unavailable");
  updateViewerViewportHeight();
  syncFullscreenButton();
  if (options.wakeControls) {
    wakeViewerControls();
  } else {
    document.body.classList.add("viewer-controls-idle");
  }
}

function exitViewerFullscreen() {
  state.fullscreenRequestId += 1;
  state.isAutoImmersive = false;
  clearViewerControlsTimer();
  document.body.classList.remove(
    "viewer-immersive",
    "viewer-native-fullscreen",
    "viewer-fullscreen-unavailable",
    "viewer-controls-idle"
  );

  const fullscreenElement = getFullscreenElement();
  const exitFullscreen = document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.webkitCancelFullScreen ||
    document.msExitFullscreen;
  if (fullscreenElement && exitFullscreen) {
    try {
      const result = exitFullscreen.call(document);
      if (result && result.catch) result.catch(() => {});
    } catch {}
  }
  syncFullscreenButton();
}

function handleFullscreenChange() {
  const isNativeFullscreen = Boolean(getFullscreenElement());
  document.body.classList.toggle("viewer-native-fullscreen", isNativeFullscreen);
  if (isViewerImmersive() && isNativeFullscreen) {
    document.body.classList.remove("viewer-fullscreen-unavailable");
  }
  updateViewerViewportHeight();
  syncFullscreenButton();
}

function handleFullscreenError() {
  markFullscreenUnavailable();
}

function markFullscreenUnavailable() {
  document.body.classList.add("viewer-fullscreen-unavailable");
  document.body.classList.remove("viewer-native-fullscreen");
  syncFullscreenButton();
}

function handleViewportChange() {
  updateViewerViewportHeight();
  applyAutoImmersiveMode();
}

function applyAutoImmersiveMode() {
  if (shouldAutoEnterImmersive()) {
    if (!isViewerImmersive()) {
      enterViewerImmersive({ auto: true, wakeControls: false });
    }
    return;
  }

  if (state.isAutoImmersive && isViewerImmersive()) {
    exitViewerFullscreen();
  }
}

function shouldAutoEnterImmersive() {
  return Boolean(
    !els.slidesViewer.hidden &&
    isCoarsePointer() &&
    isLandscapeViewport() &&
    isMobileViewport()
  );
}

function updateViewerViewportHeight() {
  const height = window.visualViewport && window.visualViewport.height
    ? window.visualViewport.height
    : window.innerHeight;
  document.documentElement.style.setProperty("--viewer-height", `${Math.max(1, Math.round(height))}px`);
}

function getFullscreenElement() {
  return document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.webkitFullScreenElement ||
    document.msFullscreenElement ||
    null;
}

function isViewerImmersive() {
  return document.body.classList.contains("viewer-immersive");
}

function isLandscapeViewport() {
  const width = window.visualViewport && window.visualViewport.width
    ? window.visualViewport.width
    : window.innerWidth;
  const height = window.visualViewport && window.visualViewport.height
    ? window.visualViewport.height
    : window.innerHeight;
  return width > height;
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 767px)").matches;
}

function isCoarsePointer() {
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function syncFullscreenButton() {
  const active = isViewerImmersive() || Boolean(getFullscreenElement());
  els.fullscreenButton.textContent = active ? "解除" : "全画面";
  els.fullscreenButton.setAttribute("aria-pressed", active ? "true" : "false");
}

function wakeViewerControls() {
  if (!isViewerImmersive()) return;
  document.body.classList.remove("viewer-controls-idle");
  clearViewerControlsTimer();
  state.controlsIdleTimer = window.setTimeout(() => {
    if (isViewerImmersive()) {
      document.body.classList.add("viewer-controls-idle");
    }
  }, 2200);
}

function clearViewerControlsTimer() {
  if (!state.controlsIdleTimer) return;
  window.clearTimeout(state.controlsIdleTimer);
  state.controlsIdleTimer = null;
}

function handleViewerTouchStart(event) {
  if (els.slidesViewer.hidden || !event.changedTouches.length) return;
  state.viewerTouchStartX = event.changedTouches[0].clientX;
  state.viewerTouchStartY = event.changedTouches[0].clientY;
  state.viewerTouchStartTarget = event.target;
}

function handleViewerTouchEnd(event) {
  if (els.slidesViewer.hidden || state.viewerTouchStartX === null || !event.changedTouches.length) return;
  const startTarget = state.viewerTouchStartTarget;
  const dx = event.changedTouches[0].clientX - state.viewerTouchStartX;
  const dy = event.changedTouches[0].clientY - state.viewerTouchStartY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  state.viewerTouchStartX = null;
  state.viewerTouchStartY = null;
  state.viewerTouchStartTarget = null;

  if (startTarget && startTarget.closest && startTarget.closest("button, a, .thumbnail-strip, .speaker-notes")) {
    wakeViewerControls();
    return;
  }
  if (dy > 40 && absDy > absDx) {
    wakeViewerControls();
    return;
  }
  if (absDx < 40 || absDx < absDy) return;
  if (dx < 0) setSlideIndex(state.currentSlideIndex + 1);
  if (dx > 0) setSlideIndex(state.currentSlideIndex - 1);
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

function createSlidesPreviewUrl(presentationId) {
  return `https://docs.google.com/presentation/d/${encodeURIComponent(presentationId)}/preview`;
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
