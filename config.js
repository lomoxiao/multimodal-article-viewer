window.MULTIMODAL_VIEWER_CONFIG = {
  // Reuses the GAS API used by google-slides-speakerdeck-viewer.
  GAS_API_URL: "https://script.google.com/macros/s/AKfycbwRtSbq1PWzfbrs1ME-yXJIL_M9633mJNy_6yqPl_i9oeRCUaMxMIdNCjiCQbEn0PtbBg/exec",
  CLIENT_KEY: "",
  INITIAL_PAGE_COUNT: 3,

  // Firebase Web config for Phase 3 (private read of /articles behind Email/Password auth).
  // These values are NOT secrets — access is protected by Firebase Auth + the
  // /access/viewers allowlist + Security Rules. Copy them from:
  //   Firebase Console → Project settings → General → Your apps → Web app → SDK setup → Config.
  // Use the SAME project as the Phase 2 article registration (same Realtime Database).
  FIREBASE_CONFIG: {
    apiKey: "REPLACE_WITH_apiKey",
    authDomain: "REPLACE_WITH_authDomain",          // e.g. your-project.firebaseapp.com
    databaseURL: "REPLACE_WITH_databaseURL",        // e.g. https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app
    projectId: "REPLACE_WITH_projectId",
    appId: "REPLACE_WITH_appId"
  }
};
