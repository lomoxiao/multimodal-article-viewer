window.MULTIMODAL_VIEWER_CONFIG = {
  // Reuses the GAS API used by google-slides-speakerdeck-viewer.
  GAS_API_URL: "https://script.google.com/macros/s/AKfycbwRtSbq1PWzfbrs1ME-yXJIL_M9633mJNy_6yqPl_i9oeRCUaMxMIdNCjiCQbEn0PtbBg/exec",
  CLIENT_KEY: "",
  INITIAL_PAGE_COUNT: 3,
  NOTEBOOKLM_URL: "https://notebooklm.google.com/",
  VIDEO_GENERATION_ENABLED: true,
  // URL投入の経路。false(既定)は依頼キュー(/generationRequests)、true は旧経路(GAS → Slack)。
  // 依頼キュー経路の動作確認が済んだら、この設定と旧経路のコードは削除する。
  USE_GAS_GENERATION: false,

  // Firebase Web config for Phase 3 (private read of /articles behind Email/Password auth).
  // These values are NOT secrets — access is protected by Firebase Auth + the
  // /access/viewers allowlist + Security Rules. Copy them from:
  //   Firebase Console → Project settings → General → Your apps → Web app → SDK setup → Config.
  // Use the SAME project as the Phase 2 article registration (same Realtime Database).
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyAfyvmKhGA39bx1QoIF15rcQDtncmpuldQ",
    authDomain: "knowledge-article-registry.firebaseapp.com",          // e.g. your-project.firebaseapp.com
    databaseURL: "https://knowledge-article-registry-default-rtdb.asia-southeast1.firebasedatabase.app",        // e.g. https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app
    projectId: "knowledge-article-registry",
    appId: "1:555500203908:web:5bd7068fe31453ba6a37d1"
  }
};
