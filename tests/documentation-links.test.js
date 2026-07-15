import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function localTargets(markdown) {
  return [...markdown.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)]
    .map((match) => match[1].trim().split("#", 1)[0])
    .filter((target) => target && !/^(?:https?:|mailto:|#)/i.test(target));
}

test("README hubs only link to files that exist", async () => {
  for (const relativeFile of ["README.md", "docs/README.md"]) {
    const absoluteFile = path.join(root, relativeFile);
    const markdown = await readFile(absoluteFile, "utf8");
    for (const target of localTargets(markdown)) {
      const absoluteTarget = path.resolve(path.dirname(absoluteFile), target);
      await assert.doesNotReject(
        access(absoluteTarget),
        `${relativeFile} contains a missing local link: ${target}`,
      );
    }
  }
});

test("documentation screenshots are available through the local guide server", async () => {
  for (const filename of ["word-editor.png", "excel-editor.png"]) {
    await assert.doesNotReject(
      access(path.join(root, "public", "assets", "evidence", filename)),
      `missing public documentation screenshot: ${filename}`,
    );
  }
});
