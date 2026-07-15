import { groupGuides, safeExternalLink, slugFromPath } from "./guide-view.js";

const elements = {
  article: document.querySelector("#guide-article"),
  breadcrumb: document.querySelector("#guide-breadcrumb"),
  filter: document.querySelector("#guide-filter"),
  navigation: document.querySelector("#guide-navigation"),
  outline: document.querySelector("#guide-outline"),
  pagination: document.querySelector("#guide-pagination"),
  status: document.querySelector("#guide-status"),
};

const slugByMarkdownFile = new Map([
  ["quick-start.md", "quick-start"],
  ["demo-guide.md", "demo-guide"],
  ["windows-beginner-guide.md", "windows-beginner"],
  ["linux-beginner-guide.md", "linux-beginner"],
  ["linux-deployment.md", "linux-deployment"],
  ["backend-installation.md", "backend-installation"],
  ["frontend-library.md", "frontend-library"],
  ["research-report.md", "research-report"],
  ["troubleshooting.md", "troubleshooting"],
]);

let guides = [];
const currentSlug = slugFromPath(window.location.pathname);

async function api(path) {
  const response = await fetch(path);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `请求失败 (${response.status})`);
  }
  return payload.data;
}

function showStatus(message, state = "loading") {
  elements.status.textContent = message;
  elements.status.dataset.state = state;
  elements.status.hidden = false;
  elements.article.hidden = true;
  elements.pagination.hidden = true;
}

function renderNavigation(query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const visible = guides.filter((guide) =>
    `${guide.title} ${guide.summary}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery),
  );
  elements.navigation.replaceChildren();

  for (const group of groupGuides(visible)) {
    const section = document.createElement("section");
    section.className = "docs-nav-group";
    const heading = document.createElement("h2");
    heading.textContent = group.name;
    section.append(heading);
    for (const guide of group.guides) {
      const link = document.createElement("a");
      link.href = `/guides/${encodeURIComponent(guide.slug)}`;
      link.textContent = guide.title;
      if (guide.slug === currentSlug) link.setAttribute("aria-current", "page");
      section.append(link);
    }
    elements.navigation.append(section);
  }
}

function decorateArticleLinks() {
  for (const anchor of elements.article.querySelectorAll("a[href]")) {
    const rawHref = anchor.getAttribute("href");
    const [pathPart, fragment] = rawHref.split("#", 2);
    const fileName = pathPart.split("/").pop();
    const slug = slugByMarkdownFile.get(fileName);
    if (slug) {
      anchor.href = `/guides/${slug}${fragment ? `#${fragment}` : ""}`;
      continue;
    }
    safeExternalLink(anchor, window.location.origin);
  }

  for (const image of elements.article.querySelectorAll("img[src]")) {
    const rawSource = image.getAttribute("src");
    if (/^(?:\.\/)?evidence\//.test(rawSource)) {
      image.src = `/assets/evidence/${rawSource.split("/").pop()}`;
    }
    image.loading = "lazy";
  }
}

function renderOutline(outline) {
  elements.outline.replaceChildren();
  for (const item of outline.filter(({ level }) => level <= 3)) {
    const link = document.createElement("a");
    link.href = `#${item.id}`;
    link.dataset.level = String(item.level);
    link.textContent = item.text;
    elements.outline.append(link);
  }
}

function paginationLink(label, guide) {
  const link = document.createElement("a");
  link.href = `/guides/${guide.slug}`;
  link.textContent = `${label}：${guide.title}`;
  return link;
}

function renderGuide(guide) {
  document.title = `${guide.title} | ONLYOFFICE 文档中心`;
  elements.breadcrumb.textContent = `文档 / ${guide.group} / ${guide.title}`;
  elements.article.innerHTML = guide.html;
  decorateArticleLinks();
  renderOutline(guide.outline);
  elements.pagination.replaceChildren();
  if (guide.previous) elements.pagination.append(paginationLink("上一篇", guide.previous));
  if (guide.next) elements.pagination.append(paginationLink("下一篇", guide.next));
  elements.status.hidden = true;
  elements.article.hidden = false;
  elements.pagination.hidden = elements.pagination.children.length === 0;
}

async function initialize() {
  try {
    guides = await api("/api/guides");
    renderNavigation();
    renderGuide(await api(`/api/guides/${encodeURIComponent(currentSlug)}`));
  } catch (error) {
    showStatus(`文档加载失败：${error.message}`, "error");
  }
}

elements.filter.addEventListener("input", () => renderNavigation(elements.filter.value));
initialize();
