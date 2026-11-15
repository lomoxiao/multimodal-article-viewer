// 記事に付いた音声(1日のまとめの読み上げ)の再生。
// app.js とは「詳細画面にボタンを足す」1点だけでつながる独立した部品。
//
// 音声データは Realtime Database の /articleAudio/{articleId} に base64 で置かれている。
// 押されたときに1回だけ読み込み、ページ内の <audio> で再生する。
// プレーヤーは画面下の固定バーに置く。詳細画面は記事データの更新のたびに描き直されるため、
// その中に <audio> を置くと再生が途切れる。固定バーなら記事を切り替えても再生が続く。
(function () {
  "use strict";

  const SPEEDS = [1, 1.25, 1.5, 2];
  const state = { articleId: null, objectUrl: null, bar: null, audio: null, title: null, message: null };

  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (!total) return "";
    return `${Math.floor(total / 60)}分${String(total % 60).padStart(2, "0")}秒`;
  }

  function ensureBar() {
    if (state.bar) return state.bar;
    const bar = document.createElement("section");
    bar.className = "audio-player-bar";
    bar.setAttribute("aria-label", "音声プレーヤー");
    bar.hidden = true;

    const head = document.createElement("div");
    head.className = "audio-player-head";
    const title = document.createElement("strong");
    title.className = "audio-player-title";
    const speed = document.createElement("select");
    speed.className = "audio-player-speed";
    speed.setAttribute("aria-label", "再生速度");
    SPEEDS.forEach((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${value}倍`;
      speed.appendChild(option);
    });
    const close = document.createElement("button");
    close.type = "button";
    close.className = "audio-player-close";
    close.setAttribute("aria-label", "音声プレーヤーを閉じる");
    close.textContent = "×";
    head.append(title, speed, close);

    const audio = document.createElement("audio");
    audio.className = "audio-player-audio";
    audio.controls = true;
    audio.preload = "auto";

    const message = document.createElement("p");
    message.className = "audio-player-message";
    message.hidden = true;

    speed.addEventListener("change", () => {
      audio.playbackRate = Number(speed.value) || 1;
    });
    // 再生速度は src の差し替えで既定値に戻るため、読み込みのたびに掛け直す
    audio.addEventListener("loadedmetadata", () => {
      audio.playbackRate = Number(speed.value) || 1;
    });
    close.addEventListener("click", closePlayer);

    bar.append(head, audio, message);
    document.body.appendChild(bar);
    Object.assign(state, { bar, audio, title, message });
    return bar;
  }

  function showMessage(text) {
    state.message.textContent = text;
    state.message.hidden = !text;
    state.audio.hidden = Boolean(text);
  }

  function releaseObjectUrl() {
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }

  function closePlayer() {
    if (!state.bar) return;
    state.audio.pause();
    state.audio.removeAttribute("src");
    state.audio.load();
    releaseObjectUrl();
    state.articleId = null;
    state.bar.hidden = true;
  }

  async function loadAudioRecord(articleId) {
    const fixture = window.MULTIMODAL_VIEWER_TEST_FIXTURE;
    if (fixture) return (fixture.articleAudio || {})[articleId] || null;
    const snapshot = await firebase.database().ref(`articleAudio/${articleId}`).once("value");
    return snapshot.val();
  }

  function base64ToBlob(base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mimeType || "audio/mp4" });
  }

  async function open(article) {
    ensureBar();
    state.bar.hidden = false;
    state.title.textContent = article.title || "音声";
    if (state.articleId === article.articleId && state.objectUrl) {
      state.audio.play().catch(() => {});
      return;
    }
    state.audio.pause();
    releaseObjectUrl();
    state.articleId = article.articleId;
    showMessage("音声を読み込んでいます…");
    try {
      const record = await loadAudioRecord(article.articleId);
      // 読み込み中に別の記事へ切り替えられた場合は、古い結果を捨てる
      if (state.articleId !== article.articleId) return;
      if (!record || typeof record.base64 !== "string" || !record.base64) {
        showMessage("音声が見つかりません。保存期間（14日）を過ぎた可能性があります。");
        return;
      }
      state.objectUrl = URL.createObjectURL(base64ToBlob(record.base64, record.mimeType));
      state.audio.src = state.objectUrl;
      showMessage("");
      if ("mediaSession" in navigator && window.MediaMetadata) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: article.title || "音声", artist: "Multimodal Article Viewer" });
      }
      // 自動再生がブラウザに止められても、プレーヤーの再生ボタンから始められる
      state.audio.play().catch(() => {});
    } catch (error) {
      if (state.articleId !== article.articleId) return;
      showMessage("音声を読み込めませんでした。通信状態を確認して、もう一度お試しください。");
    }
  }

  /** 詳細画面の「読み方」一覧に、音声の行を足す。音声が無い記事には何も足さない。 */
  function appendDestination(container, article) {
    const audio = article && article.audio;
    if (!audio || !audio.status) return;
    const expired = audio.status === "expired";
    const row = document.createElement("button");
    row.type = "button";
    row.className = "destination audio-destination";
    if (expired) row.setAttribute("aria-disabled", "true");
    const icon = document.createElement("span");
    icon.className = "destination-icon audio-destination-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "♪";
    const copy = document.createElement("span");
    copy.className = "destination-copy";
    const title = document.createElement("span");
    title.className = "destination-title";
    title.textContent = "音声で聴く";
    const note = document.createElement("span");
    note.className = "destination-note";
    note.textContent = expired ? "保存期間（14日）を過ぎました" : formatDuration(audio.durationSec) || "読み上げ";
    copy.append(title, note);
    const trailing = document.createElement("span");
    trailing.className = "destination-trailing";
    trailing.setAttribute("aria-hidden", "true");
    trailing.textContent = expired ? "" : "▶";
    row.append(icon, copy, trailing);
    if (!expired) row.addEventListener("click", () => open(article));
    container.appendChild(row);
  }

  window.ArticleAudioPlayer = { appendDestination, open, close: closePlayer };
})();
