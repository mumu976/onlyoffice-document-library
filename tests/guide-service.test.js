import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGuideService } from "../src/services/guide-service.js";

async function createFixture(t) {
  const docsDir = await mkdtemp(path.join(tmpdir(), "onlyoffice-guides-"));
  await mkdir(path.join(docsDir, "nested"));
  await writeFile(
    path.join(docsDir, "quick.md"),
    "# 快速开始\n\n欢迎使用。\n\n<script>alert('x')</script>\n",
  );
  await writeFile(
    path.join(docsDir, "nested", "linux.md"),
    "# Linux 部署\n\n## 环境准备\n\n安装 Docker。\n\n## 启动服务\n\n运行 Compose。\n",
  );
  t.after(() => rm(docsDir, { recursive: true, force: true }));
  const catalog = [
    {
      slug: "quick-start",
      title: "快速开始",
      group: "新手入门",
      summary: "五分钟运行演示",
      file: "quick.md",
    },
    {
      slug: "linux",
      title: "Linux 部署",
      group: "部署",
      summary: "部署到 Linux 服务器",
      file: "nested/linux.md",
    },
  ];
  return createGuideService({ docsDir, catalog });
}

test("lists guides in catalog order without exposing source paths", async (t) => {
  const service = await createFixture(t);

  assert.deepEqual(service.list(), [
    {
      slug: "quick-start",
      title: "快速开始",
      group: "新手入门",
      summary: "五分钟运行演示",
    },
    {
      slug: "linux",
      title: "Linux 部署",
      group: "部署",
      summary: "部署到 Linux 服务器",
    },
  ]);
});

test("renders safe Markdown, an outline, and previous/next metadata", async (t) => {
  const service = await createFixture(t);
  const guide = await service.get("linux");

  assert.equal(guide.slug, "linux");
  assert.match(guide.html, /<h1 id="section-1">Linux 部署<\/h1>/);
  assert.match(guide.html, /<h2 id="section-2">环境准备<\/h2>/);
  assert.deepEqual(guide.outline, [
    { id: "section-1", level: 1, text: "Linux 部署" },
    { id: "section-2", level: 2, text: "环境准备" },
    { id: "section-3", level: 2, text: "启动服务" },
  ]);
  assert.deepEqual(guide.previous, {
    slug: "quick-start",
    title: "快速开始",
  });
  assert.equal(guide.next, null);

  const quickStart = await service.get("quick-start");
  assert.doesNotMatch(quickStart.html, /<script>/);
  assert.match(quickStart.html, /&lt;script&gt;/);
  assert.deepEqual(quickStart.next, { slug: "linux", title: "Linux 部署" });
});

test("rejects unknown and path-like slugs with the stable guide error", async (t) => {
  const service = await createFixture(t);

  for (const slug of ["not-real", "../package", "linux/../../secret", ""]) {
    await assert.rejects(() => service.get(slug), {
      code: "GUIDE_NOT_FOUND",
      message: "文档不存在",
      status: 404,
    });
  }
});
