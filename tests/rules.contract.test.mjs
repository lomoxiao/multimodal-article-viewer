import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rules = JSON.parse(readFileSync(new URL("../database.rules.json", import.meta.url), "utf8")).rules;
const requestRules = rules.generationRequests.$requestId;
const videoRules = rules.articles.$articleId.video;

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
