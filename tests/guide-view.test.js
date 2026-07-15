import test from "node:test";
import assert from "node:assert/strict";
import {
  groupGuides,
  safeExternalLink,
  slugFromPath,
} from "../public/js/guide-view.js";

test("derives a guide slug from supported documentation paths", () => {
  assert.equal(slugFromPath("/guides"), "quick-start");
  assert.equal(slugFromPath("/guides/"), "quick-start");
  assert.equal(slugFromPath("/guides/linux-beginner"), "linux-beginner");
  assert.equal(slugFromPath("/not-guides/linux"), "quick-start");
});

test("groups guide navigation without changing API order", () => {
  const guides = [
    { slug: "quick", group: "新手入门" },
    { slug: "windows", group: "Windows" },
    { slug: "demo", group: "新手入门" },
  ];

  assert.deepEqual(groupGuides(guides), [
    { name: "新手入门", guides: [guides[0], guides[2]] },
    { name: "Windows", guides: [guides[1]] },
  ]);
});

test("marks only cross-origin HTTP links for safe new-tab navigation", () => {
  const external = { href: "https://github.com/example/project" };
  const internal = { href: "http://localhost:3000/guides/linux" };
  const hash = { href: "http://localhost:3000/guides/linux#install" };

  assert.equal(safeExternalLink(external, "http://localhost:3000"), true);
  assert.deepEqual(external, {
    href: "https://github.com/example/project",
    target: "_blank",
    rel: "noreferrer",
  });
  assert.equal(safeExternalLink(internal, "http://localhost:3000"), false);
  assert.equal(safeExternalLink(hash, "http://localhost:3000"), false);
});
