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
  isAutoImmersive: false,
  articlesRef: null,
  articlesValueHandler: null,
  saveStatusTimer: null,
  mangaUrlEditor: {
    articleId: null,
    value: "",
    submitting: false,
    error: ""
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
  thumbnailStrip: document.getElementById("thumbnailStrip"),
  authGate: document.getElementById("authGate"),
  loginForm: document.getElementById("loginForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  loginButton: document.getElementById("loginButton"),
  authError: document.getElementById("authError"),
  signOutButton: document.getElementById("signOutButton"),
  saveStatus: document.getElementById("saveStatus")
};

function wireUiEvents() {
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

function applyArticlesSnapshot(value) {
  const previousSelectedId = state.selectedId;
  const scrollTop = els.articleList.scrollTop;
  articles = Object.values(value)
    .map(normalizeArticle)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  if (!articles.some((article) => article.articleId === previousSelectedId)) {
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

  renderDetailContent(article);
}

function renderDetailContent(article) {
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
    }
  ].forEach((item) => {
    els.detailActions.appendChild(createDestinationButton(item));
  });
  els.detailActions.appendChild(renderMangaDestination(article));
}

function createDestinationButton(item) {
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
  return button;
}

function renderMangaDestination(article) {
  const group = document.createElement("div");
  group.className = "destination-group";
  const completed = article.manga.status === "completed" && Boolean(article.manga.url);
  const row = document.createElement("div");
  row.className = `destination manga-destination${completed ? " is-completed" : ""}`;

  const mainControl = document.createElement(completed ? "a" : "button");
  mainControl.className = "destination-main";
  if (completed) {
    mainControl.href = article.manga.url;
    mainControl.target = "_blank";
    mainControl.rel = "noopener noreferrer";
  } else {
    mainControl.type = "button";
  }
  mainControl.innerHTML = `
    <span class="destination-icon">N</span>
    <span>
      <span class="destination-title">漫画 / NotebookLM</span>
      <span class="destination-note">${escapeHtml(getMangaDestinationNote(article))}</span>
    </span>
  `;
  if (!completed) {
    mainControl.addEventListener("click", () => openMangaUrlEditor(article));
  }
  row.appendChild(mainControl);

  if (completed) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "destination-edit-button";
    editButton.textContent = "編集";
    editButton.setAttribute("aria-label", "NotebookLM URLを編集");
    editButton.addEventListener("click", () => openMangaUrlEditor(article));
    row.appendChild(editButton);
  }

  const cue = document.createElement("span");
  cue.className = "destination-cue";
  cue.setAttribute("aria-hidden", "true");
  cue.textContent = completed ? "↗" : "›";
  row.appendChild(cue);
  group.appendChild(row);

  if (state.mangaUrlEditor.articleId === article.articleId) {
    group.appendChild(renderMangaUrlForm(article));
  }
  return group;
}

function getMangaDestinationNote(article) {
  if (article.manga.status === "completed" && article.manga.url) return "NotebookLMを外部で開く";
  if (article.manga.status === "processing") return "生成中・URLがあれば登録";
  if (article.manga.status === "failed") return "URLを登録して完了にする";
  return "NotebookLM URLを登録";
}

function renderMangaUrlForm(article) {
  const form = document.createElement("form");
  form.className = "manga-url-form";
  form.noValidate = true;
  form.innerHTML = `
    <label class="manga-url-label" for="mangaUrlInput">NotebookLM URL</label>
    <input
      id="mangaUrlInput"
      class="manga-url-input"
      type="url"
      inputmode="url"
      autocomplete="url"
      placeholder="https://notebooklm.google.com/..."
      value="${escapeHtml(state.mangaUrlEditor.value)}"
      ${state.mangaUrlEditor.submitting ? "disabled" : ""}
    >
    <p class="field-error" role="alert" ${state.mangaUrlEditor.error ? "" : "hidden"}>${escapeHtml(state.mangaUrlEditor.error)}</p>
    <div class="form-actions">
      <button class="form-button is-secondary" type="button" ${state.mangaUrlEditor.submitting ? "disabled" : ""}>キャンセル</button>
      <button class="form-button is-primary" type="submit" ${state.mangaUrlEditor.submitting ? "disabled" : ""}>
        ${state.mangaUrlEditor.submitting ? "登録中..." : article.manga.url ? "更新" : "登録"}
      </button>
    </div>
  `;
  const input = form.querySelector(".manga-url-input");
  input.addEventListener("input", (event) => {
    state.mangaUrlEditor.value = event.target.value;
    state.mangaUrlEditor.error = "";
  });
  form.querySelector(".is-secondary").addEventListener("click", closeMangaUrlEditor);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitMangaUrl(article, state.mangaUrlEditor.value);
  });
  return form;
}

function openMangaUrlEditor(article) {
  state.mangaUrlEditor = {
    articleId: article.articleId,
    value: article.manga.url || "",
    submitting: false,
    error: ""
  };
  renderDetailContent(article);
  window.requestAnimationFrame(() => document.getElementById("mangaUrlInput")?.focus());
}

function closeMangaUrlEditor() {
  state.mangaUrlEditor = { articleId: null, value: "", submitting: false, error: "" };
  const article = getSelectedArticle();
  if (article && !els.detailPanel.hidden) renderDetailContent(article);
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

async function submitMangaUrl(article, value) {
  if (state.mangaUrlEditor.submitting) return;
  const validation = validateNotebookLmUrl(value);
  if (validation.error) {
    state.mangaUrlEditor.error = validation.error;
    renderDetailContent(article);
    window.requestAnimationFrame(() => document.getElementById("mangaUrlInput")?.focus());
    return;
  }
  const isUpdate = Boolean(article.manga.url);
  if (isUpdate && article.manga.url !== validation.url && !window.confirm("NotebookLM URLを更新しますか？")) {
    return;
  }
  if (!/^[^.#$\[\]\/]+$/.test(article.articleId)) {
    state.mangaUrlEditor.error = "記事IDが不正なため更新できません";
    renderDetailContent(article);
    return;
  }

  state.mangaUrlEditor.submitting = true;
  state.mangaUrlEditor.error = "";
  renderDetailContent(article);
  const now = new Date().toISOString();
  const manga = {
    status: "completed",
    url: validation.url,
    origin: "manual",
    locked: true,
    updatedAt: now
  };
  try {
    await firebase.database().ref().update({
      [`articles/${article.articleId}/manga`]: manga,
      [`articles/${article.articleId}/updatedAt`]: now
    });
    article.manga = manga;
    article.updatedAt = now;
    state.mangaUrlEditor = { articleId: null, value: "", submitting: false, error: "" };
    renderList();
    renderDetailContent(article);
    showSaveStatus(isUpdate ? "NotebookLM URLを更新しました" : "NotebookLM URLを登録しました");
  } catch (error) {
    state.mangaUrlEditor.submitting = false;
    state.mangaUrlEditor.error = /permission_denied/i.test(String(error && error.message))
      ? "更新権限がありません"
      : "通信に失敗しました。もう一度お試しください";
    renderDetailContent(article);
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
  if (document.body.classList.contains("sheet-open")) {
    els.sheetBackdrop.hidden = isTabletLayout() || !els.slidesViewer.hidden;
  }
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
      startArticlesSubscription();
    } else {
      stopArticlesSubscription();
      articles = [];
      state.selectedId = null;
      state.mangaUrlEditor = { articleId: null, value: "", submitting: false, error: "" };
      renderList();
      showAuthGate();
    }
  });
}

wireUiEvents();
setupAuth();
