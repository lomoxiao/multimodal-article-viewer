let articles = [];

const IOS_APP_LINK_HOSTS = [
  "notebooklm.google.com",
  "note.com",
  "x.com"
];

const DESTINATION_ICONS = {
  globe: { src: "assets/icons/globe.svg", className: "is-globe" },
  note: { src: "assets/brands/note.png", className: "is-note" },
  x: { src: "assets/brands/x.png", className: "is-x" },
  youtube: { src: "assets/brands/youtube.png", className: "is-youtube" },
  slides: { src: "assets/brands/google-slides.png", className: "is-google-slides" },
  notebookLm: { src: "assets/brands/notebooklm.png", className: "is-notebooklm" }
};

const SWIPE_ACTION_WIDTH = 88;
const SWIPE_OPEN_THRESHOLD = 44;

const AUTH_WATCHDOG_TIMEOUT_MS = 8000;
const AUTH_RECOVERY_FLAG_KEY = "mmvAuthRecoveryRequested";
// Firebase SDKが作るIndexedDB。firebaseLocalStorageDbの破損でauth初期化が
// 完了しなくなる事象があるため、復旧時はこれらを削除する。
const FIREBASE_INDEXED_DB_NAMES = ["firebaseLocalStorageDb", "firebase-heartbeat-database"];

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
  isAutoImmersive: false,
  articlesRef: null,
  articlesValueHandler: null,
  editorAccessRef: null,
  editorAccessHandler: null,
  isEditor: false,
  readFilter: "all",
  readState: {},
  readStateRef: null,
  readStateHandler: null,
  detailMode: "view",
  saveStatusTimer: null,
  authWatchdogTimer: null,
  authSettled: false,
  openSwipeArticleId: null,
  openSwipeSide: null,
  isFilterPanelOpen: false,
  pendingDeletedIds: new Set(),
  operationPanel: {
    type: null,
    articleId: null,
    value: "",
    submitting: false,
    dirty: false,
    error: "",
    diagnostic: null,
    diagnosticLoading: false,
    returnFocus: null
  },
  isSearchOpen: false,
  generationPanel: {
    open: false,
    submitting: false,
    error: "",
    sourceContext: "list",
    mode: "url"
  },
  sharedUrl: {
    value: "",
    consumed: false
  }
};

const apiClient = {
  getConfig() {
    return window.MULTIMODAL_VIEWER_CONFIG || {};
  },

  hasApiUrl() {
    return Boolean(this.getConfig().GAS_API_URL);
  },

  async post(action, payload = {}) {
    try {
      return await this.postOnce(action, payload, false);
    } catch (error) {
      if (!error || error.code !== "unauthorized") throw error;
    }
    // トークン失効の可能性があるため、強制リフレッシュで1回だけ再試行する
    try {
      return await this.postOnce(action, payload, true);
    } catch (retryError) {
      if (retryError && retryError.code === "unauthorized") {
        throw new Error("認可に失敗しました。再ログインしてください");
      }
      throw retryError;
    }
  },

  async postOnce(action, payload, forceTokenRefresh) {
    const config = this.getConfig();
    const user = window.firebase ? firebase.auth().currentUser : null;
    // トークンはURLに載せずPOSTボディでのみ送る
    const idToken = user ? await user.getIdToken(forceTokenRefresh) : "";
    const response = await fetch(config.GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        ...payload,
        action,
        clientKey: config.CLIENT_KEY || "",
        idToken
      })
    });
    return parseApiResponse(response);
  }
};

const els = {
  articleCount: document.getElementById("articleCount"),
  articleList: document.getElementById("articleList"),
  searchInput: document.getElementById("searchInput"),
  segments: Array.from(document.querySelectorAll(".segment[data-kind]")),
  readSegments: Array.from(document.querySelectorAll(".segment[data-read-filter]")),
  filterToggleButton: document.getElementById("filterToggleButton"),
  filterCountBadge: document.getElementById("filterCountBadge"),
  filterChips: document.getElementById("filterChips"),
  filterPanel: document.getElementById("filterPanel"),
  detailTriage: document.getElementById("detailTriage"),
  workspacePane: document.getElementById("workspacePane"),
  emptyWorkspace: document.getElementById("emptyWorkspace"),
  detailPanel: document.getElementById("detailPanel"),
  detailMeta: document.getElementById("detailMeta"),
  detailTitle: document.getElementById("detailTitle"),
  detailHeadline: document.getElementById("detailHeadline"),
  detailActions: document.getElementById("detailActions"),
  editModeControl: document.getElementById("editModeControl"),
  editModeToggle: document.getElementById("editModeToggle"),
  detailOperationBackdrop: document.getElementById("detailOperationBackdrop"),
  detailOperationPanel: document.getElementById("detailOperationPanel"),
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
  thumbnailStrip: document.getElementById("thumbnailStrip"),
  authGate: document.getElementById("authGate"),
  loginForm: document.getElementById("loginForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  loginButton: document.getElementById("loginButton"),
  authError: document.getElementById("authError"),
  signOutButton: document.getElementById("signOutButton"),
  authWatchdogPanel: document.getElementById("authWatchdogPanel"),
  watchdogReloadButton: document.getElementById("watchdogReloadButton"),
  watchdogResetButton: document.getElementById("watchdogResetButton"),
  saveStatus: document.getElementById("saveStatus"),
  floatingActions: document.getElementById("floatingActions"),
  generationFab: document.getElementById("generationFab"),
  searchFab: document.getElementById("searchFab"),
  bottomSearchBar: document.getElementById("bottomSearchBar"),
  searchClearButton: document.getElementById("searchClearButton"),
  searchCloseButton: document.getElementById("searchCloseButton"),
  generationBackdrop: document.getElementById("generationBackdrop"),
  generationPanel: document.getElementById("generationPanel"),
  generationForm: document.getElementById("generationForm"),
  generationCloseButton: document.getElementById("generationCloseButton"),
  generationModeSegments: Array.from(document.querySelectorAll(".segment[data-generation-mode]")),
  generationUrlField: document.getElementById("generationUrlField"),
  generationTextFields: document.getElementById("generationTextFields"),
  generationTitleInput: document.getElementById("generationTitleInput"),
  generationTextInput: document.getElementById("generationTextInput"),
  generationTextCount: document.getElementById("generationTextCount"),
  generationUrlInput: document.getElementById("generationUrlInput"),
  generationSlidesToggle: document.getElementById("generationSlidesToggle"),
  generationAudienceInput: document.getElementById("generationAudienceInput"),
  generationFocusInput: document.getElementById("generationFocusInput"),
  generationMangaToggle: document.getElementById("generationMangaToggle"),
  generationMangaFields: document.getElementById("generationMangaFields"),
  generationMangaArtStyleSelect: document.getElementById("generationMangaArtStyleSelect"),
  generationMangaTreatmentSelect: document.getElementById("generationMangaTreatmentSelect"),
  generationMangaGenreSelect: document.getElementById("generationMangaGenreSelect"),
  generationMessage: document.getElementById("generationMessage"),
  generationSubmitButton: document.getElementById("generationSubmitButton")
};

function wireUiEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    state.openSwipeArticleId = null;
    renderList();
  });
  window.addEventListener("scroll", () => closeOpenSwipeRow(), { passive: true });
  els.bottomSearchBar.addEventListener("submit", (event) => event.preventDefault());
  els.searchFab.addEventListener("click", openSearchBar);
  els.searchCloseButton.addEventListener("click", closeSearchBar);
  els.searchClearButton.addEventListener("click", clearSearchQuery);
  els.generationFab.addEventListener("click", () => openGenerationPanel());
  els.generationBackdrop.addEventListener("click", closeGenerationPanel);
  els.generationCloseButton.addEventListener("click", closeGenerationPanel);
  els.generationMangaToggle.addEventListener("change", () => {
    syncGenerationTargetFields();
  });
  els.generationModeSegments.forEach((button) => {
    button.addEventListener("click", () => setGenerationMode(button.dataset.generationMode));
  });
  els.generationTextInput.addEventListener("input", updateGenerationTextCount);
  els.generationForm.addEventListener("submit", submitGenerationRequest);
  els.watchdogReloadButton.addEventListener("click", () => window.location.reload());
  els.watchdogResetButton.addEventListener("click", requestAuthRecovery);

  els.filterToggleButton.addEventListener("click", () => toggleFilterPanel());
  els.segments.forEach((button) => {
    button.addEventListener("click", () => setKindFilter(button.dataset.kind));
  });
  els.readSegments.forEach((button) => {
    button.addEventListener("click", () => setReadFilter(button.dataset.readFilter));
  });

  els.closeDetailButton.addEventListener("click", closeMobileWorkspace);
  els.sheetBackdrop.addEventListener("click", closeMobileWorkspace);
  els.editModeToggle.addEventListener("change", () => {
    state.detailMode = state.isEditor && els.editModeToggle.checked ? "edit" : "view";
    closeOperationPanel({ force: true, render: false });
    const article = getSelectedArticle();
    if (article && !els.detailPanel.hidden) renderDetailContent(article);
  });
  els.detailOperationBackdrop.addEventListener("click", () => closeOperationPanel());
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
    if (event.key === "Tab" && !els.detailOperationPanel.hidden) {
      trapOperationPanelFocus(event);
      return;
    }
    if (event.key === "Escape" && !els.detailOperationPanel.hidden) {
      closeOperationPanel();
      return;
    }
    if (event.key === "Escape" && state.generationPanel.open) {
      closeGenerationPanel();
      return;
    }
    if (event.key === "Escape" && state.isSearchOpen) {
      closeSearchBar();
      return;
    }
    if (event.key === "Escape" && state.isFilterPanelOpen) {
      toggleFilterPanel(false);
      return;
    }
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

}

function trapOperationPanelFocus(event) {
  const focusable = Array.from(
    els.detailOperationPanel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function startArticlesSubscription() {
  stopArticlesSubscription();
  const ref = firebase.database().ref("/articles");
  const valueHandler = (snapshot) => applyArticlesSnapshot(snapshot.val() || {});
  const errorHandler = (error) => {
    if (!articles.length) showDataError(error);
  };
  state.articlesRef = ref;
  state.articlesValueHandler = valueHandler;
  ref.on("value", valueHandler, errorHandler);
}

function stopArticlesSubscription() {
  if (state.articlesRef && state.articlesValueHandler) {
    state.articlesRef.off("value", state.articlesValueHandler);
  }
  state.articlesRef = null;
  state.articlesValueHandler = null;
}

function startEditorAccessSubscription(uid) {
  stopEditorAccessSubscription();
  const ref = firebase.database().ref(`/access/editors/${uid}`);
  const valueHandler = (snapshot) => {
    state.isEditor = snapshot.val() === true;
    if (!state.isEditor) resetDetailEditing();
    if (!state.isEditor) state.openSwipeArticleId = null;
    renderList();
    const article = getSelectedArticle();
    if (article && !els.detailPanel.hidden) renderDetailContent(article);
  };
  const errorHandler = () => {
    state.isEditor = false;
    resetDetailEditing();
    state.openSwipeArticleId = null;
    renderList();
    const article = getSelectedArticle();
    if (article && !els.detailPanel.hidden) renderDetailContent(article);
  };
  state.editorAccessRef = ref;
  state.editorAccessHandler = valueHandler;
  ref.on("value", valueHandler, errorHandler);
}

function stopEditorAccessSubscription() {
  if (state.editorAccessRef && state.editorAccessHandler) {
    state.editorAccessRef.off("value", state.editorAccessHandler);
  }
  state.editorAccessRef = null;
  state.editorAccessHandler = null;
}

function startReadStateSubscription(uid) {
  stopReadStateSubscription();
  const ref = firebase.database().ref(`/readState/${uid}`);
  const valueHandler = (snapshot) => {
    state.readState = snapshot.val() || {};
    renderList();
    const article = getSelectedArticle();
    if (article && !els.detailPanel.hidden) renderTriageBar(article);
  };
  const errorHandler = () => {
    state.readState = {};
  };
  state.readStateRef = ref;
  state.readStateHandler = valueHandler;
  ref.on("value", valueHandler, errorHandler);
}

function stopReadStateSubscription() {
  if (state.readStateRef && state.readStateHandler) {
    state.readStateRef.off("value", state.readStateHandler);
  }
  state.readStateRef = null;
  state.readStateHandler = null;
}

function readStateOf(articleId) {
  const entry = state.readState[articleId];
  return entry && (entry.state === "read" || entry.state === "later") ? entry.state : "unread";
}

function markReadState(articleId, value) {
  const user = firebase.auth().currentUser;
  if (!user || !articleId) return;
  const ref = firebase.database().ref(`/readState/${user.uid}/${articleId}`);
  const operation = value
    ? ref.set({ state: value, updatedAt: new Date().toISOString() })
    : ref.remove();
  operation.catch(() => showSaveStatus("既読状態の保存に失敗しました"));
}

function applyArticlesSnapshot(value) {
  const previousSelectedId = state.selectedId;
  const scrollTop = els.articleList.scrollTop;
  articles = Object.values(value)
    .map(normalizeArticle)
    .filter((article) => !article.deletedAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  if (!articles.some((article) => article.articleId === previousSelectedId)) {
    resetDetailEditing();
    state.selectedId = articles[0]?.articleId || null;
  }

  renderList();
  els.articleList.scrollTop = scrollTop;

  const selected = getSelectedArticle();
  if (!selected) {
    els.detailPanel.hidden = true;
    els.emptyWorkspace.hidden = false;
    return;
  }

  if (!els.detailPanel.hidden) {
    renderDetailContent(selected);
  } else if (!previousSelectedId && els.slidesViewer.hidden) {
    showDetail(selected, { openSheet: false });
  }
}

function normalizeArticle(raw) {
  const article = raw || {};
  const source = article.source || {};
  const slides = article.slides || {};
  const manga = article.manga || {};
  return {
    articleId: article.articleId || article.canonicalUrl || article.originalUrl || "",
    canonicalUrl: article.canonicalUrl || article.originalUrl || "",
    originalUrl: article.originalUrl || article.canonicalUrl || "",
    title: article.title || "",
    source: {
      kind: source.kind === "youtube" ? "youtube" : source.kind === "text" ? "text" : "web",
      headline: source.headline || ""
    },
    slides: normalizeArtifact(slides),
    manga: normalizeArtifact(manga),
    deletedAt: article.deletedAt || "",
    updatedAt: article.updatedAt || article.registeredAt || ""
  };
}

function normalizeArtifact(artifact) {
  return {
    status: artifact.status || "pending",
    stage: artifact.stage || "",
    statusMessage: artifact.statusMessage || "",
    url: artifact.url || "",
    origin: artifact.origin || "",
    locked: Boolean(artifact.locked),
    updatedAt: artifact.updatedAt || ""
  };
}

function showDataError(error) {
  const message = /permission_denied/i.test(String(error && error.message))
    ? "閲覧権限がありません。管理者に viewer 登録（/access/viewers）を依頼してください。"
    : "記事の取得に失敗しました。時間をおいて再読み込みしてください。";
  els.articleCount.textContent = "0件";
  els.articleList.innerHTML = `<p class="empty-list">${escapeHtml(message)}</p>`;
}

function renderList() {
  const filtered = getFilteredArticles();
  if (!filtered.some((article) => article.articleId === state.openSwipeArticleId)) {
    state.openSwipeArticleId = null;
    state.openSwipeSide = null;
  }
  els.articleCount.textContent = `${filtered.length}件`;
  els.articleList.innerHTML = "";
  syncChromeState();

  if (!filtered.length) {
    els.articleList.innerHTML = '<p class="empty-list">該当する記事がありません。</p>';
    return;
  }

  filtered.forEach((article) => {
    const readState = readStateOf(article.articleId);
    const openSide = state.openSwipeArticleId === article.articleId ? state.openSwipeSide : null;
    const shell = document.createElement("div");
    shell.className = "article-swipe-shell";
    if (state.isEditor) shell.classList.add("has-delete");
    if (openSide === "left") shell.classList.add("is-open-left");
    if (openSide === "right") shell.classList.add("is-open-right");
    shell.dataset.articleId = article.articleId;

    // 右スワイプで露出する左側アクション: あとでトグル
    const laterButton = document.createElement("button");
    laterButton.type = "button";
    laterButton.className = "swipe-action swipe-action--later";
    laterButton.textContent = readState === "later" ? "解除" : "あとで";
    laterButton.setAttribute("aria-label", `${article.title || "記事"}を${readState === "later" ? "「あとで」から解除" : "あとで読む"}`);
    laterButton.addEventListener("focus", () => setSwipeRowOpen(shell, "left"));
    laterButton.addEventListener("click", (event) => {
      event.stopPropagation();
      markReadState(article.articleId, readState === "later" ? null : "later");
      closeOpenSwipeRow();
    });

    // 左スワイプで露出する右側アクション: 既読トグル + (editor)削除
    const rightActions = document.createElement("div");
    rightActions.className = "swipe-actions-right";
    const readButton = document.createElement("button");
    readButton.type = "button";
    readButton.className = "swipe-action swipe-action--read";
    readButton.textContent = readState === "read" ? "未読へ" : "既読";
    readButton.setAttribute("aria-label", `${article.title || "記事"}を${readState === "read" ? "未読に戻す" : "既読にする"}`);
    readButton.addEventListener("focus", () => setSwipeRowOpen(shell, "right"));
    readButton.addEventListener("click", (event) => {
      event.stopPropagation();
      markReadState(article.articleId, readState === "read" ? null : "read");
      closeOpenSwipeRow();
    });
    rightActions.appendChild(readButton);
    if (state.isEditor) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "swipe-action swipe-action--delete";
      deleteButton.textContent = "削除";
      deleteButton.setAttribute("aria-label", `${article.title || "記事"}を削除`);
      deleteButton.addEventListener("focus", () => setSwipeRowOpen(shell, "right"));
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteArticle(article);
      });
      rightActions.appendChild(deleteButton);
    }
    const row = document.createElement("button");
    row.type = "button";
    row.className = `article-row${article.articleId === state.selectedId ? " is-selected" : ""}${readState === "unread" ? " is-unread" : ""}`;
    row.addEventListener("click", () => {
      if (row.dataset.suppressClick === "true") {
        row.dataset.suppressClick = "false";
        return;
      }
      if (state.openSwipeArticleId === article.articleId) {
        setSwipeRowOpen(shell, null);
        return;
      }
      closeOpenSwipeRow();
      selectArticle(article.articleId, { openSheet: true });
    });
    row.innerHTML = `
      <div class="row-main">
        <div class="row-top">
          ${sourceChip(article.source.kind)}
          ${statusChip("Slides", article.slides.status)}
          ${statusChip("Manga", article.manga.status)}
          ${readState === "later" ? '<span class="chip is-later">あとで</span>' : ""}
        </div>
        <p class="row-title">${escapeHtml(article.title)}</p>
        <p class="row-headline">${escapeHtml(article.source.headline)}</p>
      </div>
      <span class="detail-cue">詳細</span>
    `;
    shell.appendChild(row);
    shell.appendChild(laterButton);
    shell.appendChild(rightActions);
    attachSwipeHandlers(shell, row, article.articleId);
    els.articleList.appendChild(shell);
  });
}

function getFilteredArticles() {
  return articles.filter((article) => {
    if (state.pendingDeletedIds.has(article.articleId)) return false;
    const kindMatches = state.activeKind === "all" || article.source.kind === state.activeKind;
    const readMatches =
      state.readFilter === "all" || readStateOf(article.articleId) === state.readFilter;
    const haystack = `${article.title} ${article.source.headline}`.toLowerCase();
    return kindMatches && readMatches && (!state.query || haystack.includes(state.query));
  });
}

function setKindFilter(kind) {
  state.activeKind = kind;
  state.openSwipeArticleId = null;
  syncFilterControls();
  renderList();
}

function setReadFilter(value) {
  state.readFilter = value;
  state.openSwipeArticleId = null;
  syncFilterControls();
  renderList();
}

function syncFilterControls() {
  els.segments.forEach((segment) => {
    const active = segment.dataset.kind === state.activeKind;
    segment.classList.toggle("is-active", active);
    segment.setAttribute("aria-selected", active ? "true" : "false");
  });
  els.readSegments.forEach((segment) => {
    const active = segment.dataset.readFilter === state.readFilter;
    segment.classList.toggle("is-active", active);
    segment.setAttribute("aria-selected", active ? "true" : "false");
  });
  renderFilterChips();
}

function renderFilterChips() {
  const chips = [];
  if (state.activeKind !== "all") {
    chips.push({ label: sourceLabel(state.activeKind), clear: () => setKindFilter("all") });
  }
  if (state.readFilter !== "all") {
    chips.push({ label: state.readFilter === "unread" ? "未読" : "あとで", clear: () => setReadFilter("all") });
  }
  els.filterChips.replaceChildren();
  chips.forEach((chip) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-chip";
    button.innerHTML = `${escapeHtml(chip.label)}<span aria-hidden="true">×</span>`;
    button.setAttribute("aria-label", `絞り込み「${chip.label}」を解除`);
    button.addEventListener("click", chip.clear);
    els.filterChips.appendChild(button);
  });
  els.filterCountBadge.hidden = chips.length === 0;
  els.filterCountBadge.textContent = chips.length ? String(chips.length) : "";
}

function toggleFilterPanel(force) {
  state.isFilterPanelOpen = typeof force === "boolean" ? force : !state.isFilterPanelOpen;
  els.filterPanel.hidden = !state.isFilterPanelOpen;
  els.filterToggleButton.setAttribute("aria-expanded", state.isFilterPanelOpen ? "true" : "false");
  els.filterToggleButton.classList.toggle("is-active", state.isFilterPanelOpen);
}

function selectArticle(articleId, options = {}) {
  resetDetailEditing();
  closeSearchBar({ keepQuery: true });
  state.selectedId = articleId;
  // 開いたら既読。「あとで」は明示操作のみで解除する
  if (readStateOf(articleId) === "unread") markReadState(articleId, "read");
  renderList();
  showDetail(getSelectedArticle(), { keepSheet: options.openSheet });
}

function getSelectedArticle() {
  const activeArticles = articles.filter((article) => !state.pendingDeletedIds.has(article.articleId));
  return activeArticles.find((article) => article.articleId === state.selectedId) || activeArticles[0];
}

function attachSwipeHandlers(shell, row, articleId) {
  let startX = 0;
  let startY = 0;
  let currentOffset = 0;
  let startOffset = 0;
  let direction = null;
  let pointerId = null;

  const rightWidth = () => (state.isEditor ? SWIPE_ACTION_WIDTH * 2 : SWIPE_ACTION_WIDTH);

  row.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    if (state.openSwipeArticleId === articleId && state.openSwipeSide === "left") {
      startOffset = SWIPE_ACTION_WIDTH;
    } else if (state.openSwipeArticleId === articleId && state.openSwipeSide === "right") {
      startOffset = -rightWidth();
    } else {
      startOffset = 0;
    }
    currentOffset = startOffset;
    direction = null;
    row.dataset.suppressClick = "false";
    row.setPointerCapture?.(pointerId);
  });

  row.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!direction && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 8) {
      direction = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
      if (direction === "horizontal") {
        closeOpenSwipeRow(articleId);
        shell.classList.add("is-dragging");
      }
    }
    if (direction !== "horizontal") return;
    event.preventDefault();
    currentOffset = Math.max(-rightWidth(), Math.min(SWIPE_ACTION_WIDTH, startOffset + deltaX));
    row.style.transform = `translateX(${currentOffset}px)`;
    row.dataset.suppressClick = "true";
  });

  const finishSwipe = (event) => {
    if (pointerId !== event.pointerId) return;
    if (row.hasPointerCapture?.(pointerId)) row.releasePointerCapture(pointerId);
    pointerId = null;
    shell.classList.remove("is-dragging");
    if (direction === "horizontal") {
      let side = null;
      if (currentOffset >= SWIPE_OPEN_THRESHOLD) side = "left";
      else if (currentOffset <= -SWIPE_OPEN_THRESHOLD) side = "right";
      setSwipeRowOpen(shell, side);
    } else {
      row.style.removeProperty("transform");
    }
    direction = null;
  };

  row.addEventListener("pointerup", finishSwipe);
  row.addEventListener("pointercancel", finishSwipe);
}

function closeOpenSwipeRow(exceptArticleId = null) {
  if (!state.openSwipeArticleId || state.openSwipeArticleId === exceptArticleId) return;
  const openShell = els.articleList.querySelector(".article-swipe-shell.is-open-left, .article-swipe-shell.is-open-right");
  if (openShell) {
    setSwipeRowOpen(openShell, null);
  } else {
    state.openSwipeArticleId = null;
    state.openSwipeSide = null;
  }
}

function setSwipeRowOpen(shell, side) {
  const articleId = shell.dataset.articleId;
  if (side) closeOpenSwipeRow(articleId);
  shell.classList.toggle("is-open-left", side === "left");
  shell.classList.toggle("is-open-right", side === "right");
  shell.querySelector(".article-row")?.style.removeProperty("transform");
  state.openSwipeArticleId = side ? articleId : null;
  state.openSwipeSide = side || null;
}

async function deleteArticle(article) {
  const user = firebase.auth().currentUser;
  if (!state.isEditor || !user || state.pendingDeletedIds.has(article.articleId)) return;

  const visibleBeforeDelete = getFilteredArticles();
  const deletedIndex = visibleBeforeDelete.findIndex((item) => item.articleId === article.articleId);
  const previousSelectedId = state.selectedId;
  state.pendingDeletedIds.add(article.articleId);
  state.openSwipeArticleId = null;

  if (state.selectedId === article.articleId) {
    const replacement = visibleBeforeDelete[deletedIndex + 1] || visibleBeforeDelete[deletedIndex - 1] || null;
    state.selectedId = replacement?.articleId || null;
    resetDetailEditing();
  }

  renderList();
  syncDetailAfterArticleRemoval();

  try {
    await firebase.database().ref(`articles/${article.articleId}`).update({
      deletedAt: new Date().toISOString(),
      deletedBy: user.uid
    });
    state.pendingDeletedIds.delete(article.articleId);
    showSaveStatus(`「${article.title || "記事"}」を削除しました`, {
      duration: 6000,
      actionLabel: "元に戻す",
      action: () => restoreDeletedArticle(article)
    });
  } catch (error) {
    state.pendingDeletedIds.delete(article.articleId);
    state.selectedId = previousSelectedId;
    renderList();
    syncDetailAfterArticleRemoval();
    showSaveStatus(/permission_denied/i.test(String(error && error.message))
      ? "削除権限がありません"
      : "記事を削除できませんでした。もう一度お試しください");
  }
}

async function restoreDeletedArticle(article) {
  if (!state.isEditor) return;
  try {
    await firebase.database().ref(`articles/${article.articleId}`).update({
      deletedAt: null,
      deletedBy: null
    });
    showSaveStatus(`「${article.title || "記事"}」を元に戻しました`);
  } catch (error) {
    showSaveStatus(/permission_denied/i.test(String(error && error.message))
      ? "復元権限がありません"
      : "記事を元に戻せませんでした。もう一度お試しください");
  }
}

function syncDetailAfterArticleRemoval() {
  const selected = getSelectedArticle();
  if (!selected) {
    els.detailPanel.hidden = true;
    els.emptyWorkspace.hidden = false;
    closeMobileWorkspace();
    return;
  }
  if (!els.detailPanel.hidden) renderDetailContent(selected);
}

function showDetail(article, options = {}) {
  if (!article) return;
  closeSearchBar({ keepQuery: true });
  exitViewerFullscreen();
  document.body.classList.remove("slides-viewer-open");
  els.emptyWorkspace.hidden = true;
  els.slidesViewer.hidden = true;
  els.detailPanel.hidden = false;
  els.workspacePane.classList.toggle("has-mobile-detail", Boolean(options.keepSheet));
  document.body.classList.toggle("sheet-open", Boolean(options.keepSheet));
  els.sheetBackdrop.hidden = !options.keepSheet || isTabletLayout();

  renderDetailContent(article);
  syncChromeState();
}

function renderDetailContent(article) {
  els.detailMeta.textContent = `${sourceLabel(article.source.kind)} · ${formatDate(article.updatedAt)} · ${article.articleId}`;
  els.detailTitle.textContent = article.title;
  els.detailHeadline.textContent = article.source.headline;
  renderTriageBar(article);
  els.editModeControl.hidden = !state.isEditor;
  els.editModeToggle.checked = state.isEditor && state.detailMode === "edit";
  els.detailActions.innerHTML = "";

  const isTextSource = article.source.kind === "text";
  [
    {
      icon: getSourceDestinationIcon(article),
      title: "元記事",
      note: isTextSource ? "テキスト投入" : getUrlHost(article.canonicalUrl || article.originalUrl),
      enabled: !isTextSource && Boolean(article.canonicalUrl || article.originalUrl),
      externalUrl: isTextSource ? "" : article.canonicalUrl || article.originalUrl
    },
  ].forEach((item) => els.detailActions.appendChild(createDestinationButton(item)));

  if (state.detailMode === "edit" && state.isEditor) {
    els.detailActions.appendChild(renderEditableArtifactDestination(article, "slides"));
    els.detailActions.appendChild(renderEditableArtifactDestination(article, "manga"));
  } else {
    els.detailActions.appendChild(renderViewArtifactDestination(article, "slides"));
    els.detailActions.appendChild(renderViewArtifactDestination(article, "manga"));
  }
}

function renderTriageBar(article) {
  els.detailTriage.innerHTML = "";
  const current = readStateOf(article.articleId);
  [
    {
      label: current === "read" ? "未読に戻す" : "既読にする",
      active: current === "read",
      next: current === "read" ? null : "read"
    },
    {
      label: current === "later" ? "「あとで」を解除" : "あとで読む",
      active: current === "later",
      next: current === "later" ? null : "later"
    }
  ].forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `triage-button${item.active ? " is-active" : ""}`;
    button.textContent = item.label;
    button.addEventListener("click", () => markReadState(article.articleId, item.next));
    els.detailTriage.appendChild(button);
  });
}

function createDestinationButton(item) {
  const isExternalLink = item.enabled && Boolean(item.externalUrl);
  const hasPrimaryAction = item.enabled && typeof item.action === "function";
  const control = document.createElement(isExternalLink ? "a" : hasPrimaryAction ? "button" : "div");
  control.className = "destination";
  control.setAttribute("aria-disabled", item.enabled || item.statusInteractive ? "false" : "true");
  if (isExternalLink) {
    configureExternalLink(control, item.externalUrl);
  } else if (hasPrimaryAction) {
    control.type = "button";
  }
  const statusMarkup = item.status
    ? item.statusInteractive
      ? `<button class="artifact-status is-${escapeHtml(item.status)} is-interactive" type="button" aria-haspopup="dialog">${escapeHtml(statusLabel(item.status))}<span aria-hidden="true">›</span></button>`
      : `<span class="artifact-status is-${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span>`
    : "";
  control.innerHTML = `
    ${createDestinationIconMarkup(item.icon)}
    <span class="destination-copy">
      <span class="destination-title">${escapeHtml(item.title)}</span>
      <span class="destination-note">${escapeHtml(item.note || "URL未設定")}</span>
    </span>
    <span class="destination-trailing">
      ${statusMarkup}
      <span class="destination-cue" aria-hidden="true">${item.enabled ? (isExternalLink ? "↗" : "›") : ""}</span>
    </span>
  `;
  if (hasPrimaryAction) {
    control.addEventListener("click", () => {
      item.action();
    });
  }
  const statusButton = control.querySelector(".artifact-status.is-interactive");
  statusButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    item.statusAction(statusButton);
  });
  return control;
}

function renderViewArtifactDestination(article, artifactType) {
  const artifact = article[artifactType];
  const completed = artifact.status === "completed" && Boolean(artifact.url);
  const item = {
    icon: artifactIcon(artifactType),
    title: artifactTitle(artifactType),
    note: artifactViewNote(artifactType, artifact),
    status: artifact.status,
    statusInteractive: hasStatusDetails(artifact.status),
    statusAction: (trigger) => openStatusDetailPanel(article, artifactType, trigger),
    enabled: completed
  };
  if (artifactType === "slides") item.action = () => openSlidesViewer(article);
  if (artifactType === "manga" && completed) item.externalUrl = artifact.url;
  return createDestinationButton(item);
}

function renderEditableArtifactDestination(article, artifactType) {
  const artifact = article[artifactType];
  const row = document.createElement("div");
  row.className = "destination artifact-edit-destination";
  row.innerHTML = `
    ${createDestinationIconMarkup(artifactIcon(artifactType))}
    <span class="destination-copy">
      <span class="destination-title">${escapeHtml(artifactTitle(artifactType))}</span>
      <span class="destination-note">${escapeHtml(artifact.url ? "既存URLあり" : "URL未登録")}</span>
    </span>
    <span class="destination-trailing">
      <button class="artifact-action-button" type="button">${escapeHtml(artifact.url ? "URL編集" : "URL登録")}</button>
      ${hasStatusDetails(artifact.status)
        ? `<button class="artifact-status is-${escapeHtml(artifact.status)} is-interactive" type="button" aria-haspopup="dialog">${escapeHtml(statusLabel(artifact.status))}<span aria-hidden="true">›</span></button>`
        : `<span class="artifact-status is-${escapeHtml(artifact.status)}">${escapeHtml(statusLabel(artifact.status))}</span>`}
    </span>
  `;
  const urlButton = row.querySelector(".artifact-action-button");
  urlButton.addEventListener("click", () => openArtifactUrlPanel(article, artifactType));
  const statusButton = row.querySelector(".artifact-status.is-interactive");
  statusButton?.addEventListener("click", () => openStatusDetailPanel(article, artifactType, statusButton));
  return row;
}

function artifactIcon(artifactType) {
  return artifactType === "slides" ? DESTINATION_ICONS.slides : DESTINATION_ICONS.notebookLm;
}

function artifactTitle(artifactType) {
  return artifactType === "slides" ? "Google Slides" : "漫画 / NotebookLM";
}

function artifactViewNote(artifactType, artifact) {
  if (artifact.status === "completed" && artifact.url) {
    return artifactType === "slides" ? "ビューアで開く" : "NotebookLMを外部で開く";
  }
  if (artifact.status === "processing") return "生成中";
  if (artifact.status === "action_required") return artifact.statusMessage || "手動での確認が必要です";
  if (artifact.status === "failed") return "生成に失敗しました";
  return artifact.status === "pending" ? "未着手" : "URL未登録";
}

function hasStatusDetails(status) {
  return status === "processing" || status === "action_required" || status === "failed";
}

function getSourceDestinationIcon(article) {
  const url = article.canonicalUrl || article.originalUrl || "";
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    // Unknown and non-URL sources use the generic globe icon.
  }

  if (article.source.kind === "youtube" || hostname === "youtu.be" || matchesHostname(hostname, "youtube.com")) {
    return DESTINATION_ICONS.youtube;
  }
  if (matchesHostname(hostname, "note.com")) return DESTINATION_ICONS.note;
  if (matchesHostname(hostname, "x.com") || matchesHostname(hostname, "twitter.com")) return DESTINATION_ICONS.x;
  return DESTINATION_ICONS.globe;
}

function matchesHostname(hostname, expected) {
  return hostname === expected || hostname.endsWith(`.${expected}`);
}

function createDestinationIconMarkup(icon) {
  return `
    <span class="destination-icon ${escapeHtml(icon.className)}" aria-hidden="true">
      <img src="${escapeHtml(icon.src)}" alt="">
    </span>
  `;
}

function validateNotebookLmUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return { error: "NotebookLMのURLを入力してください" };
  if (trimmed.length > 2048) return { error: "URLは2,048文字以内で入力してください" };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "notebooklm.google.com" || url.pathname === "/") {
      return { error: "このURLはNotebookLMのURLではありません" };
    }
    return { url: url.toString() };
  } catch {
    return { error: "このURLはNotebookLMのURLではありません" };
  }
}

function validateGoogleSlidesUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return { error: "Google SlidesのURLを入力してください" };
  if (trimmed.length > 2048) return { error: "URLは2,048文字以内で入力してください" };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "docs.google.com" || !url.pathname.startsWith("/presentation/")) {
      return { error: "このURLはGoogle SlidesのURLではありません" };
    }
    return { url: url.toString() };
  } catch {
    return { error: "このURLはGoogle SlidesのURLではありません" };
  }
}

function openArtifactUrlPanel(article, artifactType, options = {}) {
  if (!state.isEditor || (state.detailMode !== "edit" && !options.allowViewMode)) return;
  state.operationPanel = {
    type: `${artifactType}-url`,
    articleId: article.articleId,
    value: article[artifactType].url || "",
    submitting: false,
    dirty: false,
    error: "",
    diagnostic: null,
    diagnosticLoading: false,
    returnFocus: document.activeElement
  };
  renderOperationPanel();
  els.detailPanel.classList.add("has-operation-panel");
  els.detailOperationBackdrop.hidden = false;
  els.detailOperationPanel.hidden = false;
  window.requestAnimationFrame(() => {
    const input = els.detailOperationPanel.querySelector(".operation-url-input");
    input?.focus();
    if (state.operationPanel.value) input?.select();
  });
}

function openStatusDetailPanel(article, artifactType, trigger) {
  if (!hasStatusDetails(article[artifactType].status)) return;
  state.operationPanel = {
    type: `${artifactType}-status`,
    articleId: article.articleId,
    value: "",
    submitting: false,
    dirty: false,
    error: "",
    diagnostic: null,
    diagnosticLoading: state.isEditor,
    returnFocus: trigger || document.activeElement
  };
  showOperationPanel();
  renderOperationPanel();
  window.requestAnimationFrame(() => els.detailOperationPanel.querySelector(".operation-close-button")?.focus());
  if (state.isEditor) loadArtifactDiagnostic(article, artifactType);
}

function showOperationPanel() {
  els.detailPanel.classList.add("has-operation-panel");
  els.detailOperationBackdrop.hidden = false;
  els.detailOperationPanel.hidden = false;
  els.detailOperationPanel.setAttribute("role", "dialog");
  els.detailOperationPanel.setAttribute("aria-modal", "true");
}

async function loadArtifactDiagnostic(article, artifactType) {
  if (!/^[^.#$\[\]\/]+$/.test(article.articleId)) return;
  try {
    const snapshot = await firebase.database().ref(`artifactDiagnostics/${article.articleId}/${artifactType}`).once("value");
    if (state.operationPanel.type !== `${artifactType}-status` || state.operationPanel.articleId !== article.articleId) return;
    state.operationPanel.diagnostic = snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    state.operationPanel.error = /permission_denied/i.test(String(error && error.message))
      ? "技術情報の閲覧権限がありません"
      : "技術情報を取得できませんでした";
  } finally {
    if (state.operationPanel.type === `${artifactType}-status` && state.operationPanel.articleId === article.articleId) {
      state.operationPanel.diagnosticLoading = false;
      renderOperationPanel();
    }
  }
}

function renderOperationPanel() {
  const article = articles.find((item) => item.articleId === state.operationPanel.articleId);
  const statusArtifactType = getStatusArtifactType();
  if (article && statusArtifactType) {
    renderStatusDetailPanel(article, statusArtifactType);
    return;
  }
  const artifactType = getOperationArtifactType();
  if (!article || !artifactType) {
    closeOperationPanel({ force: true });
    return;
  }
  const artifact = article[artifactType];
  const isUpdate = Boolean(artifact.url);
  const title = `${artifactTitle(artifactType)} URLを${isUpdate ? "編集" : "登録"}`;
  const description = isUpdate ? "現在のURLを差し替えます" : "成果物をこの記事へ紐付けます";
  const placeholder = artifactType === "slides"
    ? "https://docs.google.com/presentation/d/.../edit"
    : "https://notebooklm.google.com/notebook/...";
  els.detailOperationPanel.innerHTML = `
    <form class="operation-panel-form" novalidate>
      <header class="operation-panel-head">
        <button class="operation-close-button" type="button" aria-label="編集を閉じる">
          <span class="mobile-only" aria-hidden="true">‹</span><span class="desktop-only" aria-hidden="true">×</span>
        </button>
        ${createDestinationIconMarkup(artifactIcon(artifactType))}
        <span class="operation-title-copy">
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(description)}</small>
        </span>
      </header>
      <div class="operation-panel-body">
        <div class="operation-article-summary">
          <strong>対象記事</strong>
          <span>${escapeHtml(article.title)}</span>
        </div>
        <label class="operation-field-label" for="operationUrlInput">${escapeHtml(artifactTitle(artifactType))} URL</label>
        <input
          id="operationUrlInput"
          class="operation-url-input"
          type="url"
          inputmode="url"
          autocomplete="url"
          placeholder="${escapeHtml(placeholder)}"
          value="${escapeHtml(state.operationPanel.value)}"
          ${state.operationPanel.submitting ? "disabled" : ""}
        >
        <p class="field-error" role="alert" ${state.operationPanel.error ? "" : "hidden"}>${escapeHtml(state.operationPanel.error)}</p>
        <div class="operation-result-preview">
          ${createDestinationIconMarkup(artifactIcon(artifactType))}
          <span><strong>保存後の表示</strong><small>${escapeHtml(artifactTitle(artifactType))} · 利用可能</small></span>
        </div>
      </div>
      <footer class="operation-panel-footer">
        <button class="operation-button is-secondary" type="button" ${state.operationPanel.submitting ? "disabled" : ""}>キャンセル</button>
        <button class="operation-button is-primary" type="submit" ${state.operationPanel.submitting ? "disabled" : ""}>
          ${state.operationPanel.submitting ? "保存中..." : `URLを${isUpdate ? "更新" : "登録"}`}
        </button>
      </footer>
    </form>
  `;
  const form = els.detailOperationPanel.querySelector("form");
  const input = form.querySelector(".operation-url-input");
  input.addEventListener("input", (event) => {
    state.operationPanel.value = event.target.value;
    state.operationPanel.dirty = true;
    state.operationPanel.error = "";
  });
  form.querySelector(".operation-close-button").addEventListener("click", () => closeOperationPanel());
  form.querySelector(".is-secondary").addEventListener("click", () => closeOperationPanel());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitArtifactUrl(article, artifactType, state.operationPanel.value);
  });
}

function renderStatusDetailPanel(article, artifactType) {
  const artifact = article[artifactType];
  const diagnostic = state.operationPanel.diagnostic;
  const notebookUrl = (window.MULTIMODAL_VIEWER_CONFIG || {}).NOTEBOOKLM_URL || "https://notebooklm.google.com/";
  const showNotebookAction = artifactType === "manga" &&
    (artifact.stage === "deck_generation" || artifact.stage === "url_retrieval");
  const technicalMarkup = state.isEditor
    ? `<section class="status-technical">
        <h3>技術情報</h3>
        ${state.operationPanel.diagnosticLoading
          ? "<p>読み込み中...</p>"
          : diagnostic
            ? `<dl class="status-detail-list">
                <div><dt>コード</dt><dd>${escapeHtml(diagnostic.code || "-")}</dd></div>
                ${diagnostic.jobId ? `<div><dt>Job ID</dt><dd>${escapeHtml(diagnostic.jobId)}</dd></div>` : ""}
              </dl><pre>${escapeHtml(diagnostic.detail || "詳細なし")}</pre>`
            : `<p>${escapeHtml(state.operationPanel.error || "技術情報はありません")}</p>`}
      </section>`
    : "";

  els.detailOperationPanel.innerHTML = `
    <div class="operation-panel-form status-detail-panel">
      <header class="operation-panel-head">
        <button class="operation-close-button" type="button" aria-label="処理状況を閉じる">×</button>
        ${createDestinationIconMarkup(artifactIcon(artifactType))}
        <span class="operation-title-copy"><strong>処理状況</strong><small>${escapeHtml(artifactTitle(artifactType))}</small></span>
      </header>
      <div class="operation-panel-body">
        <dl class="status-detail-list">
          <div><dt>成果物</dt><dd>${escapeHtml(artifactTitle(artifactType))}</dd></div>
          <div><dt>状態</dt><dd><span class="artifact-status is-${escapeHtml(artifact.status)}">${escapeHtml(statusLabel(artifact.status))}</span></dd></div>
          <div><dt>工程</dt><dd>${escapeHtml(stageLabel(artifact.stage))}</dd></div>
        </dl>
        <p class="status-guidance">${escapeHtml(artifact.statusMessage || defaultStatusMessage(artifact))}</p>
        ${technicalMarkup}
      </div>
      <footer class="operation-panel-footer status-detail-actions">
        <button class="operation-button is-secondary status-close-button" type="button">閉じる</button>
        ${state.isEditor ? `<button class="operation-button is-secondary manual-url-button" type="button">URLを手動登録</button>` : ""}
        ${showNotebookAction ? `<a class="operation-button is-primary" href="${escapeHtml(notebookUrl)}" target="_blank" rel="noopener noreferrer">NotebookLMを開く</a>` : ""}
      </footer>
    </div>`;
  els.detailOperationPanel.querySelector(".operation-close-button").addEventListener("click", () => closeOperationPanel());
  els.detailOperationPanel.querySelector(".status-close-button").addEventListener("click", () => closeOperationPanel());
  els.detailOperationPanel.querySelector(".manual-url-button")?.addEventListener("click", () => {
    closeOperationPanel({ force: true, render: false });
    openArtifactUrlPanel(article, artifactType, { allowViewMode: true });
  });
}

function getStatusArtifactType() {
  if (state.operationPanel.type === "slides-status") return "slides";
  if (state.operationPanel.type === "manga-status") return "manga";
  return null;
}

function stageLabel(stage) {
  const labels = {
    preparing: "準備中",
    drive_registration: "1/4 Google Drive登録",
    source_registration: "2/4 NotebookLMソース登録",
    deck_generation: "3/4 スライドデック生成",
    url_retrieval: "4/4 URL取得",
    slides_generation: "Google Slides生成"
  };
  return labels[stage] || "工程情報なし";
}

function defaultStatusMessage(artifact) {
  if (artifact.status === "processing") return "自動処理を実行しています";
  if (artifact.status === "action_required") return "手動での確認が必要です";
  if (artifact.status === "failed") return "自動処理を継続できませんでした";
  return "";
}

function getOperationArtifactType() {
  if (state.operationPanel.type === "slides-url") return "slides";
  if (state.operationPanel.type === "manga-url") return "manga";
  return null;
}

function closeOperationPanel(options = {}) {
  if (state.operationPanel.submitting && !options.force) return false;
  if (state.operationPanel.dirty && !options.force && !window.confirm("入力内容を破棄して閉じますか？")) return false;
  const returnFocus = state.operationPanel.returnFocus;
  state.operationPanel = {
    type: null,
    articleId: null,
    value: "",
    submitting: false,
    dirty: false,
    error: "",
    diagnostic: null,
    diagnosticLoading: false,
    returnFocus: null
  };
  els.detailPanel.classList.remove("has-operation-panel");
  els.detailOperationBackdrop.hidden = true;
  els.detailOperationPanel.hidden = true;
  els.detailOperationPanel.removeAttribute("role");
  els.detailOperationPanel.removeAttribute("aria-modal");
  els.detailOperationPanel.innerHTML = "";
  if (options.render !== false) (returnFocus?.isConnected ? returnFocus : els.editModeToggle).focus();
  return true;
}

function resetDetailEditing() {
  state.detailMode = "view";
  if (els.editModeToggle) els.editModeToggle.checked = false;
  closeOperationPanel({ force: true, render: false });
}

async function submitArtifactUrl(article, artifactType, value) {
  if (state.operationPanel.submitting) return;
  const validation = artifactType === "slides" ? validateGoogleSlidesUrl(value) : validateNotebookLmUrl(value);
  if (validation.error) {
    state.operationPanel.error = validation.error;
    renderOperationPanel();
    window.requestAnimationFrame(() => els.detailOperationPanel.querySelector(".operation-url-input")?.focus());
    return;
  }
  const artifact = article[artifactType];
  const isUpdate = Boolean(artifact.url);
  if (artifact.url === validation.url) {
    closeOperationPanel({ force: true });
    return;
  }
  if (isUpdate && !window.confirm(`${artifactTitle(artifactType)} URLを更新しますか？`)) {
    return;
  }
  if (!/^[^.#$\[\]\/]+$/.test(article.articleId)) {
    state.operationPanel.error = "記事IDが不正なため更新できません";
    renderOperationPanel();
    return;
  }

  state.operationPanel.submitting = true;
  state.operationPanel.error = "";
  renderOperationPanel();
  const now = new Date().toISOString();
  const artifactValue = {
    status: "completed",
    url: validation.url,
    origin: "manual",
    locked: true,
    updatedAt: now
  };
  try {
    await firebase.database().ref().update({
      [`articles/${article.articleId}/${artifactType}`]: artifactValue,
      [`articles/${article.articleId}/updatedAt`]: now
    });
    article[artifactType] = artifactValue;
    article.updatedAt = now;
    closeOperationPanel({ force: true, render: false });
    renderList();
    renderDetailContent(article);
    showSaveStatus(`${artifactTitle(artifactType)} URLを${isUpdate ? "更新" : "登録"}しました`);
  } catch (error) {
    state.operationPanel.submitting = false;
    state.operationPanel.error = /permission_denied/i.test(String(error && error.message))
      ? "更新権限がありません"
      : "通信に失敗しました。もう一度お試しください";
    renderOperationPanel();
  }
}

function showSaveStatus(message, options = {}) {
  if (!els.saveStatus) return;
  window.clearTimeout(state.saveStatusTimer);
  els.saveStatus.replaceChildren();
  const messageNode = document.createElement("span");
  messageNode.textContent = message;
  els.saveStatus.appendChild(messageNode);
  if (options.actionLabel && typeof options.action === "function") {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "save-status-action";
    actionButton.textContent = options.actionLabel;
    actionButton.addEventListener("click", () => {
      actionButton.disabled = true;
      options.action();
    }, { once: true });
    els.saveStatus.appendChild(actionButton);
  }
  els.saveStatus.hidden = false;
  state.saveStatusTimer = window.setTimeout(() => {
    els.saveStatus.hidden = true;
  }, options.duration || 3000);
}

function openSearchBar() {
  if (!isListSearchAvailable()) return;
  state.isSearchOpen = true;
  syncChromeState();
  window.requestAnimationFrame(() => els.searchInput.focus());
}

function closeSearchBar(options = {}) {
  state.isSearchOpen = false;
  syncChromeState();
  if (!options.keepQuery) return;
  els.searchInput.value = state.query;
}

function clearSearchQuery() {
  state.query = "";
  els.searchInput.value = "";
  renderList();
  if (state.isSearchOpen) {
    window.requestAnimationFrame(() => els.searchInput.focus());
  }
}

function isDetailContextOpen() {
  return Boolean(
    !els.detailPanel.hidden &&
    (isTabletLayout() || els.workspacePane.classList.contains("has-mobile-detail"))
  );
}

function isListSearchAvailable() {
  return !state.generationPanel.open && els.slidesViewer.hidden && !isDetailContextOpen();
}

const GENERATION_TEXT_MAX_LENGTH = 100000;
const GENERATION_REQUEST_WATCH_TIMEOUT_MS = 30 * 60 * 1000;

function setGenerationMode(mode) {
  state.generationPanel.mode = mode === "text" ? "text" : "url";
  const isText = state.generationPanel.mode === "text";
  els.generationModeSegments.forEach((segment) => {
    const active = segment.dataset.generationMode === state.generationPanel.mode;
    segment.classList.toggle("is-active", active);
    segment.setAttribute("aria-selected", active ? "true" : "false");
  });
  els.generationUrlField.hidden = isText;
  els.generationTextFields.hidden = !isText;
  // テキストモードはスライド生成が必須(Rulesの slides === true 検証と対応)
  if (isText) els.generationSlidesToggle.checked = true;
  syncGenerationSubmitting();
  setGenerationMessage("");
}

function updateGenerationTextCount() {
  const length = els.generationTextInput.value.length;
  els.generationTextCount.textContent = `${length.toLocaleString("ja-JP")} / 100,000字`;
  els.generationTextCount.classList.toggle("is-error", length > GENERATION_TEXT_MAX_LENGTH);
}

function validateTextGenerationPayload() {
  const text = els.generationTextInput.value.replace(/\r\n/g, "\n").trim();
  if (!text) return { error: "本文テキストを貼り付けてください" };
  if (text.length > GENERATION_TEXT_MAX_LENGTH) return { error: "本文は100,000字以内にしてください" };
  const manga = els.generationMangaToggle.checked;
  const title = els.generationTitleInput.value.trim();
  const audience = els.generationAudienceInput.value.trim();
  const focus = els.generationFocusInput.value.trim();
  return {
    payload: {
      kind: "text",
      text,
      slides: true,
      manga,
      ...(title ? { title } : {}),
      ...(audience ? { audience } : {}),
      ...(focus ? { focus } : {}),
      ...(manga
        ? {
            mangaOptions: {
              artStyle: els.generationMangaArtStyleSelect.value,
              treatment: els.generationMangaTreatmentSelect.value,
              ...(els.generationMangaGenreSelect.value ? { genre: els.generationMangaGenreSelect.value } : {})
            }
          }
        : {})
    }
  };
}

async function submitTextGenerationRequest() {
  const user = firebase.auth().currentUser;
  if (!user) {
    setGenerationMessage("サインインが必要です", true);
    return;
  }
  const result = validateTextGenerationPayload();
  if (result.error) {
    setGenerationMessage(result.error, true);
    return;
  }
  state.generationPanel.submitting = true;
  setGenerationMessage("");
  syncGenerationSubmitting();
  try {
    const ref = firebase.database().ref("/generationRequests").push();
    await ref.set({
      ownerUid: user.uid,
      ...result.payload,
      status: "queued",
      createdAt: new Date().toISOString(),
      trigger: { provider: "web" }
    });
    watchGenerationRequestStatus(ref);
    closeGenerationPanelAfterSubmit();
    showSaveStatus("テキストの生成依頼を登録しました");
  } catch (error) {
    state.generationPanel.submitting = false;
    setGenerationMessage(
      /permission_denied/i.test(String(error && error.message))
        ? "生成依頼の権限がありません"
        : "生成依頼の登録に失敗しました。もう一度お試しください",
      true
    );
    syncGenerationSubmitting();
  }
}

function watchGenerationRequestStatus(ref) {
  let settled = false;
  let timer = null;
  const handler = (snapshot) => {
    const value = snapshot.val();
    if (!value || settled) return;
    if (value.status === "done") {
      settle();
      showSaveStatus("テキスト投入のスライド生成が完了しました");
    } else if (value.status === "failed") {
      settle();
      showSaveStatus("テキスト投入の生成に失敗しました");
    }
  };
  const settle = () => {
    settled = true;
    ref.off("value", handler);
    if (timer) window.clearTimeout(timer);
  };
  timer = window.setTimeout(settle, GENERATION_REQUEST_WATCH_TIMEOUT_MS);
  ref.on("value", handler);
}

function openGenerationPanel(options = {}) {
  if (!els.slidesViewer.hidden) return;
  closeSearchBar({ keepQuery: true });
  const article = isDetailContextOpen() ? getSelectedArticle() : null;
  state.generationPanel = {
    open: true,
    submitting: false,
    error: "",
    sourceContext: article ? "detail" : "list",
    mode: "url"
  };
  els.generationUrlInput.value = options.sourceUrl || (article ? article.canonicalUrl || article.originalUrl || "" : "");
  els.generationTitleInput.value = "";
  els.generationTextInput.value = "";
  updateGenerationTextCount();
  setGenerationMode("url");
  els.generationSlidesToggle.checked = false;
  els.generationAudienceInput.value = "";
  els.generationFocusInput.value = "";
  els.generationMangaToggle.checked = false;
  els.generationMangaArtStyleSelect.value = "F";
  els.generationMangaTreatmentSelect.value = "B";
  els.generationMangaGenreSelect.value = "";
  syncGenerationTargetFields();
  setGenerationMessage("");
  syncGenerationSubmitting();
  syncChromeState();
  window.requestAnimationFrame(() => els.generationUrlInput.focus());
}

function closeGenerationPanel() {
  if (state.generationPanel.submitting) return;
  state.generationPanel.open = false;
  state.generationPanel.error = "";
  setGenerationMessage("");
  syncChromeState();
}

function validateGenerationPayload() {
  const sourceUrl = els.generationUrlInput.value.trim();
  if (!sourceUrl) return { error: "ソースURLを入力してください" };
  if (sourceUrl.length > 2048) return { error: "URLは2,048文字以内で入力してください" };
  try {
    const parsed = new URL(sourceUrl);
    if (!/^https?:$/.test(parsed.protocol)) {
      return { error: "URLは http:// または https:// で入力してください" };
    }
  } catch {
    return { error: "URLの形式を確認してください" };
  }

  const slides = els.generationSlidesToggle.checked;
  const manga = els.generationMangaToggle.checked;
  if (!slides && !manga) return { error: "生成対象を選択してください" };

  return {
    payload: {
      mode: "url",
      urls: [sourceUrl],
      slides,
      audience: els.generationAudienceInput.value.trim(),
      focus: els.generationFocusInput.value.trim(),
      manga,
      mangaArtStyle: manga ? els.generationMangaArtStyleSelect.value : undefined,
      mangaTreatment: manga ? els.generationMangaTreatmentSelect.value : undefined,
      mangaGenre: manga && els.generationMangaGenreSelect.value ? els.generationMangaGenreSelect.value : undefined
    }
  };
}

async function submitGenerationRequest(event) {
  event.preventDefault();
  if (state.generationPanel.submitting) return;
  if (state.generationPanel.mode === "text") {
    await submitTextGenerationRequest();
    return;
  }
  if (!apiClient.hasApiUrl()) {
    setGenerationMessage("GAS API URLが設定されていません", true);
    return;
  }
  const result = validateGenerationPayload();
  if (result.error) {
    setGenerationMessage(result.error, true);
    return;
  }

  state.generationPanel.submitting = true;
  setGenerationMessage("");
  syncGenerationSubmitting();
  try {
    const response = await apiClient.post("requestGeneration", result.payload);
    closeGenerationPanelAfterSubmit();
    showSaveStatus(formatGenerationResultMessage(result.payload, response));
  } catch (error) {
    state.generationPanel.submitting = false;
    setGenerationMessage(error && error.message ? error.message : "生成依頼に失敗しました", true);
    syncGenerationSubmitting();
  }
}

function closeGenerationPanelAfterSubmit() {
  state.generationPanel.open = false;
  state.generationPanel.submitting = false;
  state.generationPanel.error = "";
  syncGenerationSubmitting();
  syncChromeState();
}

function formatGenerationResultMessage(payload, response) {
  const posted = [];
  if (payload.slides && response && response.slackTs) posted.push("Googleスライド");
  if (payload.manga && response && response.mangaSlackTs) posted.push("漫画");
  if (!posted.length) {
    if (payload.slides) posted.push("Googleスライド");
    if (payload.manga) posted.push("漫画");
  }
  const tracking = response && response.trackingId ? `（${response.trackingId}）` : "";
  return `生成依頼をSlackへ送信しました: ${posted.join(" / ")}${tracking}`;
}

function setGenerationMessage(message, isError = false) {
  els.generationMessage.textContent = message || "";
  els.generationMessage.classList.toggle("is-error", Boolean(isError));
}

function syncGenerationTargetFields() {
  els.generationMangaFields.hidden = !els.generationMangaToggle.checked;
}

function syncGenerationSubmitting() {
  const submitting = state.generationPanel.submitting;
  [
    els.generationUrlInput,
    els.generationTitleInput,
    els.generationTextInput,
    els.generationAudienceInput,
    els.generationFocusInput,
    els.generationMangaToggle,
    els.generationMangaArtStyleSelect,
    els.generationMangaTreatmentSelect,
    els.generationMangaGenreSelect,
    els.generationSubmitButton,
    ...els.generationModeSegments
  ].forEach((node) => {
    if (node) node.disabled = submitting;
  });
  els.generationSlidesToggle.disabled = submitting || state.generationPanel.mode === "text";
  els.generationSubmitButton.textContent = submitting ? "送信中..." : "生成を依頼";
}

function syncChromeState() {
  const slidesOpen = !els.slidesViewer.hidden;
  const detailOpen = isDetailContextOpen();
  const generationOpen = state.generationPanel.open;
  const searchAvailable = isListSearchAvailable();
  const showGenerationFab = !slidesOpen && !generationOpen;
  const showSearchFab = searchAvailable && !state.isSearchOpen;

  els.floatingActions.hidden = !showGenerationFab && !showSearchFab;
  els.generationFab.hidden = !showGenerationFab;
  els.searchFab.hidden = !showSearchFab;
  els.bottomSearchBar.hidden = !state.isSearchOpen || !searchAvailable;
  els.generationPanel.hidden = !generationOpen;
  els.generationBackdrop.hidden = !generationOpen;
  document.body.classList.toggle("search-bar-open", state.isSearchOpen && searchAvailable);
  document.body.classList.toggle("generation-panel-open", generationOpen);
  document.body.classList.toggle("detail-context-open", detailOpen);
}

function openSlidesViewer(article) {
  closeSearchBar({ keepQuery: true });
  closeGenerationPanel();
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
  syncChromeState();
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
  apiClient.post("getPageWindow", {
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
      const error = new Error(message);
      if (result && result.error && result.error.code) {
        error.code = result.error.code;
      }
      throw error;
    }
    return result.data;
  });
}

function closeMobileWorkspace() {
  resetDetailEditing();
  els.workspacePane.classList.remove("has-mobile-detail");
  document.body.classList.remove("sheet-open", "slides-viewer-open");
  els.sheetBackdrop.hidden = true;
  exitViewerFullscreen();
  syncChromeState();
}

function returnFromSlidesViewer() {
  exitViewerFullscreen();
  showDetail(getSelectedArticle(), { keepSheet: true });
  syncChromeState();
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
  if (document.body.classList.contains("sheet-open")) {
    els.sheetBackdrop.hidden = isTabletLayout() || !els.slidesViewer.hidden;
  }
  syncChromeState();
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

function configureExternalLink(link, url) {
  link.href = url;
  link.rel = "noopener noreferrer";
  if (shouldOpenIosAppLinkInSameTab(url)) {
    link.removeAttribute("target");
  } else {
    link.target = "_blank";
  }
}

function shouldOpenIosAppLinkInSameTab(url) {
  if (!isIosOrIpadOs()) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return IOS_APP_LINK_HOSTS.some((allowedHost) =>
      hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
    );
  } catch {
    return false;
  }
}

function isIosOrIpadOs() {
  const userAgent = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
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
  if (kind === "text") return "テキスト";
  return kind || "Source";
}

function statusLabel(status) {
  const labels = {
    completed: "完了",
    processing: "生成中",
    action_required: "要対応",
    pending: "未着手",
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

function readSharedUrlFromQuery() {
  const value = new URLSearchParams(window.location.search).get("url");
  if (!value || value.length > 2048) return "";

  try {
    const parsed = new URL(value);
    return /^https?:$/.test(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function removeSharedUrlQueryParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("url")) return;
  url.searchParams.delete("url");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

function applySharedUrlIfNeeded() {
  if (!state.sharedUrl.value || state.sharedUrl.consumed) return;
  state.sharedUrl.consumed = true;
  openGenerationPanel({ sourceUrl: state.sharedUrl.value });
  removeSharedUrlQueryParam();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showAuthGate(message) {
  settleAuthWatchdog();
  els.authGate.hidden = false;
  els.signOutButton.hidden = true;
  if (message) {
    els.authError.textContent = message;
    els.authError.hidden = false;
  }
}

function hideAuthGate() {
  settleAuthWatchdog();
  els.authGate.hidden = true;
  els.authError.hidden = true;
  els.signOutButton.hidden = false;
}

function startAuthWatchdog() {
  state.authWatchdogTimer = window.setTimeout(() => {
    if (!state.authSettled) els.authWatchdogPanel.hidden = false;
  }, AUTH_WATCHDOG_TIMEOUT_MS);
}

function settleAuthWatchdog() {
  state.authSettled = true;
  if (state.authWatchdogTimer) {
    window.clearTimeout(state.authWatchdogTimer);
    state.authWatchdogTimer = null;
  }
  els.authWatchdogPanel.hidden = true;
}

function requestAuthRecovery() {
  try {
    window.sessionStorage.setItem(AUTH_RECOVERY_FLAG_KEY, "1");
  } catch {
    // sessionStorage不可時はフラグなし再読み込みにフォールバック
  }
  window.location.reload();
}

function consumeAuthRecoveryFlag() {
  try {
    if (window.sessionStorage.getItem(AUTH_RECOVERY_FLAG_KEY) !== "1") return false;
    window.sessionStorage.removeItem(AUTH_RECOVERY_FLAG_KEY);
    return true;
  } catch {
    return false;
  }
}

function deleteFirebaseIndexedDbs() {
  if (!window.indexedDB) return Promise.resolve();
  const deletions = FIREBASE_INDEXED_DB_NAMES.map((name) => new Promise((resolve) => {
    let request;
    try {
      request = window.indexedDB.deleteDatabase(name);
    } catch {
      resolve();
      return;
    }
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  }));
  // 破損したIndexedDBでは削除要求も返らないことがあるため待ち時間に上限を設ける
  const timeLimit = new Promise((resolve) => window.setTimeout(resolve, 3000));
  return Promise.race([Promise.all(deletions), timeLimit]);
}

function authErrorMessage(error) {
  switch (error && error.code) {
    case "auth/invalid-email":
    case "auth/missing-password":
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "メールアドレスまたはパスワードが正しくありません。";
    case "auth/too-many-requests":
      return "試行回数が多すぎます。しばらくしてから再度お試しください。";
    case "auth/network-request-failed":
      return "ネットワークエラーです。接続を確認してください。";
    default:
      return "ログインに失敗しました。もう一度お試しください。";
  }
}

function setupAuth() {
  const firebaseConfig = (window.MULTIMODAL_VIEWER_CONFIG || {}).FIREBASE_CONFIG;
  if (!window.firebase || !firebaseConfig || /^REPLACE_WITH_/.test(firebaseConfig.apiKey || "")) {
    showAuthGate("Firebase 設定が未完了です。config.js の FIREBASE_CONFIG を設定してください。");
    return;
  }

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    els.authError.hidden = true;
    els.loginButton.disabled = true;
    try {
      await auth.signInWithEmailAndPassword(els.loginEmail.value.trim(), els.loginPassword.value);
      // onAuthStateChanged handles the success path.
    } catch (error) {
      els.authError.textContent = authErrorMessage(error);
      els.authError.hidden = false;
    } finally {
      els.loginButton.disabled = false;
    }
  });

  els.signOutButton.addEventListener("click", () => auth.signOut());

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      hideAuthGate();
      els.loginPassword.value = "";
      startEditorAccessSubscription(user.uid);
      startReadStateSubscription(user.uid);
      startArticlesSubscription();
      applySharedUrlIfNeeded();
    } else {
      stopArticlesSubscription();
      stopEditorAccessSubscription();
      stopReadStateSubscription();
      articles = [];
      state.selectedId = null;
      state.isEditor = false;
      state.readState = {};
      resetDetailEditing();
      renderList();
      showAuthGate();
    }
  });
}

state.sharedUrl.value = readSharedUrlFromQuery();
wireUiEvents();
syncFilterControls();
startAuthWatchdog();
if (consumeAuthRecoveryFlag()) {
  // firebase初期化前に削除することで、自ページの接続がブロック要因になるのを避ける
  deleteFirebaseIndexedDbs().then(setupAuth);
} else {
  setupAuth();
}
