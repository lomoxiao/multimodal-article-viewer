import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rules = JSON.parse(readFileSync(new URL("../database.rules.json", import.meta.url), "utf8")).rules;
const requestRules = rules.generationRequests.$requestId;
const videoRules = rules.articles.$articleId.video;
const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");

function acceptsSelection(input) {
  const booleanKeys = ["slides", "manga", "video"];
  if (booleanKeys.some((key) => key in input && typeof input[key] !== "boolean")) return false;
  if (!booleanKeys.some((key) => input[key] === true)) return false;
  return input.manga === true ? Boolean(input.mangaOptions) : !input.mangaOptions;
}

test("generation request Rules mirror the slides/manga/video selection contract", () => {
  assert.match(requestRules[".validate"], /child\('slides'\)/);
  assert.match(requestRules[".validate"], /child\('manga'\)/);
  assert.match(requestRules[".validate"], /child\('video'\)/);
  assert.match(requestRules[".validate"], /mangaOptions/);
  assert.match(requestRules.slides[".validate"], /isBoolean/);
  assert.match(requestRules.manga[".validate"], /isBoolean/);
  assert.match(requestRules.video[".validate"], /isBoolean/);

  assert.equal(acceptsSelection({ slides: true }), true);
  assert.equal(acceptsSelection({ manga: true, mangaOptions: {} }), true);
  assert.equal(acceptsSelection({ video: true }), true);
  assert.equal(acceptsSelection({ slides: true, manga: true, video: true, mangaOptions: {} }), true);
  assert.equal(acceptsSelection({}), false);
  assert.equal(acceptsSelection({ slides: false, manga: false, video: false }), false);
  assert.equal(acceptsSelection({ video: "true" }), false);
  assert.equal(acceptsSelection({ manga: true }), false);
  assert.equal(acceptsSelection({ video: true, mangaOptions: {} }), false);
});

test("manual video writes are editor-only, locked completed Drive artifacts", () => {
  assert.match(videoRules[".write"], /access\/editors/);
  for (const required of ["completed", "drive.google.com/file/d/", "fileId", "manual", "locked", "updatedAt"]) {
    assert.equal(videoRules[".validate"].includes(required), true, `missing ${required}`);
  }
});

test("generation request failures prefer the server-provided safe status message", () => {
  assert.match(appSource, /value\.statusMessage/);
  assert.match(appSource, /showSaveStatus\(value\.statusMessage \|\|/);
});

test("article audio is readable by viewers only and never client-writable", () => {
  assert.equal(rules.articleAudio[".read"], rules.articleSources[".read"]);
  assert.equal(rules.articleAudio[".write"], false);
  assert.equal(rules.articleAudioIndex[".read"], false);
  assert.equal(rules.articleAudioIndex[".write"], false);
});

test("generation requests accept text or url kinds with mutually exclusive bodies", () => {
  assert.equal(requestRules.kind[".validate"], "newData.val() === 'text' || newData.val() === 'url' || newData.val() === 'bundle'");
  const urlRule = requestRules.urls.$index[".validate"];
  // 最大3件(添字0〜2)、http(s)のみ、長さ制限あり
  for (const required of ["$index.matches(/^[0-2]$/)", "isString()", "<= 2048", "beginsWith('https://')", "beginsWith('http://')"]) {
    assert.equal(urlRule.includes(required), true, `missing ${required}`);
  }
  const validate = requestRules[".validate"];
  // text は text 必須・urls なし、url は urls/0 必須・text なし
  assert.match(validate, /child\('kind'\)\.val\(\) === 'text' && newData\.child\('text'\)\.exists\(\) && !newData\.child\('urls'\)\.exists\(\)/);
  assert.match(validate, /child\('kind'\)\.val\(\) === 'url' && newData\.child\('urls\/0'\)\.exists\(\) && !newData\.child\('text'\)\.exists\(\)/);
  // 漫画・動画を含む依頼は URL 1件のみ
  assert.match(validate, /!newData\.child\('urls\/1'\)\.exists\(\) \|\| \(newData\.child\('manga'\)\.val\(\) !== true && newData\.child\('video'\)\.val\(\) !== true\)/);
  // 既存の制約(本人・queued・web・新規のみ)は変えていない
  const write = requestRules[".write"];
  for (const required of ["!data.exists()", "child('ownerUid').val() === auth.uid", "child('status').val() === 'queued'", "child('trigger/provider').val() === 'web'"]) {
    assert.equal(write.includes(required), true, `missing ${required}`);
  }
});

test("URL generation requests go to the request queue (the legacy GAS path is gone)", () => {
  assert.match(appSource, /submitQueuedGenerationRequest\(result\.queuePayload/);
  assert.match(appSource, /kind: "url"/);
  assert.doesNotMatch(appSource, /requestGeneration/);
  assert.doesNotMatch(appSource, /USE_GAS_GENERATION/);
});

test("bundle requests carry 2-10 article ids and need no slides/manga/video selection", () => {
  const validate = requestRules[".validate"];
  // 束はスライド等を選ばなくてよい。メンバーは2件以上必須で、text / urls と同居しない
  assert.match(validate, /^\(newData\.child\('kind'\)\.val\(\) === 'bundle' \|\| newData\.child\('slides'\)/);
  assert.match(validate, /child\('kind'\)\.val\(\) === 'bundle' && newData\.child\('members\/0'\)\.exists\(\) && newData\.child\('members\/1'\)\.exists\(\) && !newData\.child\('text'\)\.exists\(\) && !newData\.child\('urls'\)\.exists\(\)/);
  // 束以外の依頼に members は付けられない
  assert.match(validate, /\(newData\.child\('kind'\)\.val\(\) === 'bundle' \|\| !newData\.child\('members'\)\.exists\(\)\)$/);

  const memberRule = requestRules.members.$index[".validate"];
  // 最大10件(添字0〜9)。記事IDの形のみ(束そのもの bnd_ や URL は不可)
  for (const required of ["$index.matches(/^[0-9]$/)", "isString()", "<= 64", "matches(/^(url|yt|txt)_[0-9a-f]+$/)"]) {
    assert.equal(memberRule.includes(required), true, `missing ${required}`);
  }
  const memberPattern = /^(url|yt|txt)_[0-9a-f]+$/;
  assert.equal(memberPattern.test("url_0123456789ab"), true);
  assert.equal(memberPattern.test("bnd_0123456789ab"), false);
  assert.equal(memberPattern.test("https://example.com/"), false);
  assert.match(requestRules.audio[".validate"], /isBoolean/);
  assert.match(requestRules.title[".validate"], /<= 200/);
});

test("per-article digests are server-only", () => {
  assert.equal(rules.articleDigests[".read"], false);
  assert.equal(rules.articleDigests[".write"], false);
});

test("bundle UI parts are loaded before app.js and stay decoupled from it", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const order = ["bundle-select.js", "bundle-view.js", "app.js"].map((file) => html.indexOf(`src="${file}"`));
  assert.ok(order.every((index) => index > 0));
  assert.ok(order[0] < order[2] && order[1] < order[2]);
  const select = readFileSync(new URL("../bundle-select.js", import.meta.url), "utf8");
  assert.match(select, /kind: "bundle"/);
  assert.match(select, /\/generationRequests/);
  // 束を読んでも中の記事は自動で既読にしない(ボタンを押したときだけ)
  const view = readFileSync(new URL("../bundle-view.js", import.meta.url), "utf8");
  assert.match(view, /addEventListener\("click", \(\) => \{\s*unread\.forEach/);
});
