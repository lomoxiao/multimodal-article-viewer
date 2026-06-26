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
  detailMode: "view",
  saveStatusTimer: null,
  operationPanel: {
    type: null,
    articleId: null,
    value: "",
    submitting: false,
    dirty: false,
    error: ""
  },
  isSearchOpen: false,
  generationPanel: {
    open: false,
    submitting: false,
    error: "",
    sourceContext: "list"
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
  },

  post(action, payload = {}) {
    const config = this.getConfig();
    return fetch(config.GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        ...payload,
        action,
        clientKey: config.CLIENT_KEY || ""
      })
    }).then(parseApiResponse);
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
    renderList();
  });
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
  els.generationForm.addEventListener("submit", submitGenerationRequest);

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
    const article = getSelectedArticle();
    if (article && !els.detailPanel.hidden) renderDetailContent(article);
  };
  const errorHandler = () => {
    state.isEditor = false;
    resetDetailEditing();
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

function applyArticlesSnapshot(value) {
  const previousSelectedId = state.selectedId;
  const scrollTop = els.articleList.scrollTop;
  articles = Object.values(value)
    .map(normalizeArticle)
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
      kind: source.kind === "youtube" ? "youtube" : "web",
      headline: source.headline || ""
    },
    slides: { status: slides.status || "pending", url: slides.url || "" },
    manga: { status: manga.status || "pending", url: manga.url || "" },
    updatedAt: article.updatedAt || article.registeredAt || ""
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
  els.articleCount.textContent = `${filtered.length}件`;
  els.articleList.innerHTML = "";
  syncChromeState();

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
  resetDetailEditing();
  closeSearchBar({ keepQuery: true });
  state.selectedId = articleId;
  renderList();
  showDetail(getSelectedArticle(), { keepSheet: options.openSheet });
}

function getSelectedArticle() {
  return articles.find((article) => article.articleId === state.selectedId) || articles[0];
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
  els.editModeControl.hidden = !state.isEditor;
  els.editModeToggle.checked = state.isEditor && state.detailMode === "edit";
  els.detailActions.innerHTML = "";

  [
    {
      icon: getSourceDestinationIcon(article),
      title: "元記事",
      note: getUrlHost(article.canonicalUrl || article.originalUrl),
      enabled: Boolean(article.canonicalUrl || article.originalUrl),
      externalUrl: article.canonicalUrl || article.originalUrl
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

function createDestinationButton(item) {
  const isExternalLink = item.enabled && Boolean(item.externalUrl);
  const control = document.createElement(isExternalLink ? "a" : "button");
  control.className = "destination";
  control.setAttribute("aria-disabled", item.enabled ? "false" : "true");
  if (isExternalLink) {
    configureExternalLink(control, item.externalUrl);
  } else {
    control.type = "button";
  }
  const statusMarkup = item.status
    ? `<span class="artifact-status is-${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span>`
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
  if (!isExternalLink) {
    control.addEventListener("click", () => {
      if (item.enabled) item.action();
    });
  }
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
      <span class="artifact-status is-${escapeHtml(artifact.status)}">${escapeHtml(statusLabel(artifact.status))}</span>
    </span>
  `;
  const urlButton = row.querySelector(".artifact-action-button");
  urlButton.addEventListener("click", () => openArtifactUrlPanel(article, artifactType));
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
  if (artifact.status === "failed") return "生成に失敗しました";
  return "URL未登録";
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

function openArtifactUrlPanel(article, artifactType) {
  if (!state.isEditor || state.detailMode !== "edit") return;
  state.operationPanel = {
    type: `${artifactType}-url`,
    articleId: article.articleId,
    value: article[artifactType].url || "",
    submitting: false,
    dirty: false,
    error: ""
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

function renderOperationPanel() {
  const article = articles.find((item) => item.articleId === state.operationPanel.articleId);
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

function getOperationArtifactType() {
  if (state.operationPanel.type === "slides-url") return "slides";
  if (state.operationPanel.type === "manga-url") return "manga";
  return null;
}

function closeOperationPanel(options = {}) {
  if (state.operationPanel.submitting && !options.force) return false;
  if (state.operationPanel.dirty && !options.force && !window.confirm("入力内容を破棄して閉じますか？")) return false;
  state.operationPanel = { type: null, articleId: null, value: "", submitting: false, dirty: false, error: "" };
  els.detailPanel.classList.remove("has-operation-panel");
  els.detailOperationBackdrop.hidden = true;
  els.detailOperationPanel.hidden = true;
  els.detailOperationPanel.innerHTML = "";
  if (options.render !== false) els.editModeToggle.focus();
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

function showSaveStatus(message) {
  if (!els.saveStatus) return;
  window.clearTimeout(state.saveStatusTimer);
  els.saveStatus.textContent = message;
  els.saveStatus.hidden = false;
  state.saveStatusTimer = window.setTimeout(() => {
    els.saveStatus.hidden = true;
  }, 3000);
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

function openGenerationPanel(options = {}) {
  if (!els.slidesViewer.hidden) return;
  closeSearchBar({ keepQuery: true });
  const article = isDetailContextOpen() ? getSelectedArticle() : null;
  state.generationPanel = {
    open: true,
    submitting: false,
    error: "",
    sourceContext: article ? "detail" : "list"
  };
  els.generationUrlInput.value = options.sourceUrl || (article ? article.canonicalUrl || article.originalUrl || "" : "");
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
    els.generationSlidesToggle,
    els.generationAudienceInput,
    els.generationFocusInput,
    els.generationMangaToggle,
    els.generationMangaArtStyleSelect,
    els.generationMangaTreatmentSelect,
    els.generationMangaGenreSelect,
    els.generationSubmitButton
  ].forEach((node) => {
    if (node) node.disabled = submitting;
  });
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
  els.authGate.hidden = false;
  els.signOutButton.hidden = true;
  if (message) {
    els.authError.textContent = message;
    els.authError.hidden = false;
  }
}

function hideAuthGate() {
  els.authGate.hidden = true;
  els.authError.hidden = true;
  els.signOutButton.hidden = false;
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
      startArticlesSubscription();
      applySharedUrlIfNeeded();
    } else {
      stopArticlesSubscription();
      stopEditorAccessSubscription();
      articles = [];
      state.selectedId = null;
      state.isEditor = false;
      resetDetailEditing();
      renderList();
      showAuthGate();
    }
  });
}

state.sharedUrl.value = readSharedUrlFromQuery();
wireUiEvents();
setupAuth();
