import { readFile } from "node:fs/promises";
import path from "node:path";
import MarkdownIt from "markdown-it";
import { AppError } from "../errors.js";

export const guideCatalog = Object.freeze([
  {
    slug: "quick-start",
    title: "快速开始",
    group: "新手入门",
    summary: "用 Docker Compose 完成第一次 Word 和 Excel 编辑",
    file: "quick-start.md",
  },
  {
    slug: "demo-guide",
    title: "演示与验收",
    group: "新手入门",
    summary: "完整体验创建、编辑、保存、下载和删除",
    file: "demo-guide.md",
  },
  {
    slug: "windows-beginner",
    title: "Windows 新手指南",
    group: "Windows",
    summary: "从 Docker Desktop 安装到浏览器验证",
    file: "windows-beginner-guide.md",
  },
  {
    slug: "linux-beginner",
    title: "Linux 新手指南",
    group: "Linux",
    summary: "在 Ubuntu 服务器上完成首次部署",
    file: "linux-beginner-guide.md",
  },
  {
    slug: "linux-deployment",
    title: "Linux 生产部署",
    group: "Linux",
    summary: "HTTPS、反向代理、备份、升级与回滚",
    file: "linux-deployment.md",
  },
  {
    slug: "backend-installation",
    title: "后端安装与配置",
    group: "开发接入",
    summary: "Document Server、Node 服务、JWT 与回调",
    file: "backend-installation.md",
  },
  {
    slug: "frontend-library",
    title: "前端 Docs API 接入",
    group: "开发接入",
    summary: "加载编辑器、组织配置并处理保存回调",
    file: "frontend-library.md",
  },
  {
    slug: "research-report",
    title: "选型与集成调研",
    group: "开发接入",
    summary: "部署方式、组件边界与集成结论",
    file: "research-report.md",
  },
  {
    slug: "troubleshooting",
    title: "故障排查",
    group: "运维排错",
    summary: "按症状定位端口、JWT、回调和网络问题",
    file: "troubleshooting.md",
  },
]);

function notFound() {
  return new AppError("GUIDE_NOT_FOUND", "文档不存在", 404);
}

function publicEntry(entry) {
  const { slug, title, group, summary } = entry;
  return { slug, title, group, summary };
}

function neighbor(entry) {
  return entry ? { slug: entry.slug, title: entry.title } : null;
}

export function createGuideService({ docsDir, catalog = guideCatalog }) {
  const orderedCatalog = Object.freeze(catalog.map((entry) => ({ ...entry })));
  const bySlug = new Map(orderedCatalog.map((entry) => [entry.slug, entry]));
  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
  });

  return {
    list() {
      return orderedCatalog.map(publicEntry);
    },

    async get(slug) {
      const entry = typeof slug === "string" ? bySlug.get(slug) : undefined;
      if (!entry) throw notFound();

      const source = await readFile(path.resolve(docsDir, entry.file), "utf8");
      const environment = {};
      const tokens = markdown.parse(source, environment);
      const outline = [];
      let headingNumber = 0;

      for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.type !== "heading_open") continue;
        headingNumber += 1;
        const id = `section-${headingNumber}`;
        token.attrSet("id", id);
        outline.push({
          id,
          level: Number(token.tag.slice(1)),
          text: tokens[index + 1]?.content ?? "",
        });
      }

      const catalogIndex = orderedCatalog.indexOf(entry);
      return {
        ...publicEntry(entry),
        html: markdown.renderer.render(tokens, markdown.options, environment),
        outline,
        previous: neighbor(orderedCatalog[catalogIndex - 1]),
        next: neighbor(orderedCatalog[catalogIndex + 1]),
      };
    },
  };
}
