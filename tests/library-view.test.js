import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveLibraryView,
  normalizeViewPreference,
  recentFiles,
} from "../public/js/library-view.js";

const files = [
  { id: "1", name: "项目 10.docx", extension: "docx", updatedAt: "2026-07-12T10:00:00.000Z" },
  { id: "2", name: "预算表.xlsx", extension: "xlsx", updatedAt: "2026-07-14T10:00:00.000Z" },
  { id: "3", name: "项目 2.docx", extension: "docx", updatedAt: "2026-07-13T10:00:00.000Z" },
];

test("searches by name and filters Word or Excel without mutating input", () => {
  const original = structuredClone(files);
  assert.deepEqual(
    deriveLibraryView(files, { query: "项目", type: "docx", sort: "newest" }).map(({ id }) => id),
    ["3", "1"],
  );
  assert.deepEqual(
    deriveLibraryView(files, { query: "预算", type: "xlsx", sort: "newest" }).map(({ id }) => id),
    ["2"],
  );
  assert.deepEqual(files, original);
});

test("sorts newest, oldest, and natural Chinese names", () => {
  assert.deepEqual(deriveLibraryView(files, { sort: "newest" }).map(({ id }) => id), ["2", "3", "1"]);
  assert.deepEqual(deriveLibraryView(files, { sort: "oldest" }).map(({ id }) => id), ["1", "3", "2"]);
  assert.deepEqual(deriveLibraryView(files, { sort: "name" }).map(({ id }) => id), ["3", "1", "2"]);
});

test("returns recent files and normalizes persisted view preferences", () => {
  assert.deepEqual(recentFiles(files, 2).map(({ id }) => id), ["2", "3"]);
  assert.equal(normalizeViewPreference("grid"), "grid");
  assert.equal(normalizeViewPreference("list"), "list");
  assert.equal(normalizeViewPreference("cards"), "list");
  assert.equal(normalizeViewPreference(null), "list");
});
