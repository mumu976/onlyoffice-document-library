# ONLYOFFICE Project Hub Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a coherent README, local documentation center, and fully interactive ONLYOFFICE document workspace based on the approved “Documentation First” design.

**Architecture:** Keep the existing file and ONLYOFFICE APIs unchanged. Add an allowlisted Markdown guide service and API, serve one client-side documentation shell for all guide slugs, and isolate workspace search/filter/sort/view derivation in pure browser functions. README and local guides route users into the same demo and deployment journey.

**Tech Stack:** Node.js 24, Express 5, `markdown-it`, vanilla ES modules, HTML/CSS, Node test runner, Supertest, Docker Compose.

## Global Constraints

- Work directly on the repository default branch `master`; do not create a feature branch.
- Preserve create, upload, open, save callback, download, and delete API contracts.
- Expose only allowlisted Markdown files; never join a request slug directly to a filesystem path.
- Configure Markdown with `html: false`.
- Use only real current-project capabilities; no login, collaboration, comments, versions, favorites, recycle bin, quota, or analytics.
- Use white/light gray and restrained ONLYOFFICE green; verify 1536×1024, 1024×768, and 375×812.
- Use source-library icons, not emoji, text symbols, handmade SVG, or CSS art.
- End with `npm run check`, `npm audit --omit=dev`, Docker validation, browser interaction checks, a commit, and a push to `origin/master`.

---

### Task 1: Allowlisted guide service

**Files:**
- Create: `src/services/guide-service.js`
- Create: `tests/guide-service.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `createGuideService({ docsDir })`.
- Produces: `guideService.list(): Array<{ slug, title, group, summary }>`.
- Produces: `guideService.get(slug): Promise<{ slug, title, group, summary, html, outline, previous, next }>`.

- [ ] **Step 1: Write failing guide-service tests**

Create temporary Markdown files and assert catalog order, rendered headings, escaped raw HTML, previous/next metadata, unknown-slug `GUIDE_NOT_FOUND`, and path-traversal rejection.

```js
const service = createGuideService({ docsDir, catalog });
assert.deepEqual(service.list().map(({ slug }) => slug), ["quick-start", "linux"]);
const guide = await service.get("linux");
assert.match(guide.html, /id="section-1"/);
assert.doesNotMatch(guide.html, /<script>/);
await assert.rejects(() => service.get("../package"), { code: "GUIDE_NOT_FOUND" });
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/guide-service.test.js`

Expected: FAIL because `src/services/guide-service.js` does not exist.

- [ ] **Step 3: Install `markdown-it` and implement the service**

Use a frozen catalog containing `quick-start`, `windows-beginner`, `linux-beginner`, `linux-deployment`, `backend-installation`, `frontend-library`, `troubleshooting`, `demo-guide`, and `research-report`. Resolve paths from catalog entries only. Parse tokens, assign deterministic `section-N` IDs to heading tokens, and derive the outline before rendering.

```js
const markdown = new MarkdownIt({ html: false, linkify: true, typographer: false });
const entry = catalog.find((candidate) => candidate.slug === slug);
if (!entry) throw new AppError("GUIDE_NOT_FOUND", "文档不存在", 404);
const source = await readFile(path.resolve(docsDir, entry.file), "utf8");
const tokens = markdown.parse(source, {});
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --test tests/guide-service.test.js`

Expected: all guide-service tests pass.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json src/services/guide-service.js tests/guide-service.test.js
git commit -m "feat: add allowlisted guide service"
```

### Task 2: Guide API and routes

**Files:**
- Create: `src/routes/guides.js`
- Modify: `src/app.js`
- Modify: `src/server.js`
- Modify: `Dockerfile`
- Modify: `tests/api.test.js`

**Interfaces:**
- Consumes: `guideService.list()` and `guideService.get(slug)` from Task 1.
- Produces: `GET /api/guides` and `GET /api/guides/:slug`.
- Produces: `/guides` and `/guides/:slug` serving `public/guides.html`.

- [ ] **Step 1: Add failing API tests**

Pass a guide-service stub into `createApp`, then assert list/detail responses, unknown-guide 404, and HTML shell routing.

```js
await request(app).get("/api/guides").expect(200, { data: guideList });
await request(app).get("/api/guides/linux-beginner").expect(200);
await request(app).get("/api/guides/not-real").expect(404, {
  error: { code: "GUIDE_NOT_FOUND", message: "文档不存在" },
});
await request(app).get("/guides/linux-beginner").expect("Content-Type", /html/);
```

- [ ] **Step 2: Run focused API tests and verify RED**

Run: `node --test tests/api.test.js --test-name-pattern="guide|document library page"`

Expected: FAIL because the guide routes are absent.

- [ ] **Step 3: Implement routes and production wiring**

Create a router that returns `{ data }`, instantiate the guide service from the repository `docs/` directory in `startServer`, mount the router before the API 404 handler, and serve the guide shell through an anchored regular-expression route. Add `COPY docs ./docs` to the Docker image.

```js
app.use("/api/guides", createGuidesRouter({ guideService }));
app.get(/^\/guides(?:\/[^/]+)?\/?$/, (_request, response) => {
  response.sendFile(path.join(publicDirectory, "guides.html"));
});
```

- [ ] **Step 4: Run focused API tests and verify GREEN**

Run: `node --test tests/api.test.js --test-name-pattern="guide|document library page"`

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/routes/guides.js src/app.js src/server.js Dockerfile tests/api.test.js
git commit -m "feat: expose local guide routes"
```

### Task 3: Documentation center UI

**Files:**
- Create: `public/guides.html`
- Create: `public/css/guides.css`
- Create: `public/js/guides.js`
- Create: `public/js/guide-view.js`
- Create: `tests/guide-view.test.js`

**Interfaces:**
- Consumes: `GET /api/guides` and `GET /api/guides/:slug`.
- Produces: `slugFromPath(pathname)`, `groupGuides(guides)`, and `safeExternalLink(anchor)` pure helpers.

- [ ] **Step 1: Write failing guide-view tests**

Assert `/guides` selects `quick-start`, `/guides/linux-beginner` selects that slug, grouped navigation preserves API order, and external links receive `target="_blank"` plus `rel="noreferrer"`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/guide-view.test.js`

Expected: FAIL because `guide-view.js` does not exist.

- [ ] **Step 3: Implement the guide shell and client rendering**

Build a responsive three-column layout: grouped left navigation, semantic `<article>` content, and right outline. Add top links to the document workspace, GitHub, and README. Render loading, 404, and retry states without injecting untrusted values as HTML; only the server-rendered `guide.html` is assigned to the article.

- [ ] **Step 4: Run the guide-view and API tests**

Run: `node --test tests/guide-view.test.js tests/api.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add public/guides.html public/css/guides.css public/js/guides.js public/js/guide-view.js tests/guide-view.test.js
git commit -m "feat: add local documentation center"
```

### Task 4: Workspace view model

**Files:**
- Create: `public/js/library-view.js`
- Create: `tests/library-view.test.js`

**Interfaces:**
- Produces: `deriveLibraryView(files, { query, type, sort })`.
- Produces: `recentFiles(files, limit = 4)`.
- Produces: `normalizeViewPreference(value)` returning `"list"` or `"grid"`.

- [ ] **Step 1: Write failing pure-function tests**

Cover case-insensitive name search, `docx`/`xlsx` filters, newest/oldest/name sorting without mutating input, recent-file limiting, and invalid view preference fallback.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/library-view.test.js`

Expected: FAIL because `library-view.js` does not exist.

- [ ] **Step 3: Implement minimal pure functions**

Use `Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" })` for names and copy with `[...files]` before sorting.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/library-view.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add public/js/library-view.js tests/library-view.test.js
git commit -m "feat: add document library view model"
```

### Task 5: Interactive document workspace redesign

**Files:**
- Modify: `public/index.html`
- Modify: `public/css/app.css`
- Modify: `public/js/app.js`
- Modify: `tests/app.test.js`
- Modify: `tests/api.test.js`

**Interfaces:**
- Consumes: Task 4 view functions and existing file APIs.
- Preserves: `OnlyOfficeEditor` open/close and revision-polling behavior.

- [ ] **Step 1: Extend the browser harness and add failing interaction tests**

Add fake elements for query, type, sort, view buttons, recent list, drop zone, and empty-state actions. Assert search and filter update the rendered rows, invalid persisted view falls back to list, dragover/drop calls the existing upload path, and editor rollback tests remain unchanged.

- [ ] **Step 2: Run app tests and verify RED**

Run: `node --test tests/app.test.js`

Expected: new interaction tests fail because controls/listeners are absent.

- [ ] **Step 3: Rebuild semantic HTML**

Add a compact header with real service status and links, primary actions, accessible search/filter/sort controls, list/grid toggle, recent documents, drag-and-drop upload, file list/grid containers, and explicit empty/no-result states. Do not add unsupported sidebar items.

- [ ] **Step 4: Implement interaction wiring**

Keep `files` as the source array, derive visible rows through `deriveLibraryView`, persist only the view name, reuse `uploadSelectedFile(file)`, and render all filenames with `textContent`. Keep delete confirmation and editor lifecycle intact.

- [ ] **Step 5: Implement responsive styling**

Match the approved design at 1536 pixels, collapse the recent grid and toolbar at tablet widths, and produce one-column cards at 375 pixels. Include `:focus-visible`, reduced motion, readable empty states, and disabled/busy states.

- [ ] **Step 6: Run focused tests and static-route assertions**

Run: `node --test tests/app.test.js tests/library-view.test.js tests/api.test.js`

Expected: all selected tests pass.

- [ ] **Step 7: Commit**

```powershell
git add public/index.html public/css/app.css public/js/app.js tests/app.test.js tests/api.test.js
git commit -m "feat: redesign document workspace"
```

### Task 6: Source-library icons and project documentation hub

**Files:**
- Create: `public/assets/icons/`
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `docs/README.md`
- Modify: `README.md`
- Modify: `docs/quick-start.md`
- Modify: `docs/windows-beginner-guide.md`
- Modify: `docs/linux-beginner-guide.md`
- Modify: `docs/frontend-library.md`
- Modify: `docs/troubleshooting.md`

**Interfaces:**
- Produces: stable README anchors and guide links used by the app and documentation center.

- [ ] **Step 1: Add a failing documentation-link test**

Create `tests/documentation-links.test.js` to parse local Markdown links in README and the guide catalog and assert every referenced workspace path exists. Assert README contains anchors for quick start, features, architecture, documentation, security, roadmap, contributing, and license.

- [ ] **Step 2: Run the documentation test and verify RED**

Run: `node --test tests/documentation-links.test.js`

Expected: FAIL for the missing documentation map and required anchors.

- [ ] **Step 3: Add licensed icon assets**

Copy unmodified icons from Lucide and Simple Icons for eye, monitor, upload, search, grid/list, Word, Excel, Windows, Linux, Docker, and JavaScript. Record exact project names, upstream URLs, versions, and licenses in `THIRD_PARTY_NOTICES.md`.

- [ ] **Step 4: Rewrite README and normalize guide navigation**

Use truthful badges only, real Word/Excel screenshots from `docs/evidence`, a three-step quick start, supported/not-supported matrix, architecture flow, document navigation with the approved icon semantics, security boundary, FAQ, roadmap, contributing, and license. Add a consistent “文档地图 / 上一篇 / 下一篇 / 返回演示” navigation block to the selected guides without replacing their operational detail.

- [ ] **Step 5: Run documentation tests and verify GREEN**

Run: `node --test tests/documentation-links.test.js`

Expected: all local links and required sections pass.

- [ ] **Step 6: Commit**

```powershell
git add README.md THIRD_PARTY_NOTICES.md docs public/assets/icons tests/documentation-links.test.js
git commit -m "docs: build complete project learning hub"
```

### Task 7: Full verification, visual QA, and GitHub delivery

**Files:**
- Modify if required by verified defects: files already listed in Tasks 1–6.
- Update: `docs/evidence/test-output.txt`
- Update: `docs/evidence/verification-output.txt`

**Interfaces:**
- Produces: verified `master` commit pushed to `origin/master`.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm run check`

Expected: zero failed tests and coverage command exit code 0.

- [ ] **Step 2: Run dependency and container checks**

Run: `npm audit --omit=dev`

Expected: zero known production vulnerabilities.

Run: `docker compose config`

Expected: exit code 0 with valid services.

- [ ] **Step 3: Start the app and perform browser interaction QA**

Verify create Word, create Excel, upload, search, filter, sort, list/grid, download, delete confirmation, guide navigation, 404 guide, and editor open/close. Capture the app and guide pages at 1536×1024 and mobile width.

- [ ] **Step 4: Perform visual comparison**

Combine the approved design image and implementation screenshots into the same comparison input. Correct visible spacing, typography, borders, radii, clipping, icon, and responsive defects, then repeat the comparison.

- [ ] **Step 5: Record fresh verification evidence**

Write command versions, timestamps, test counts, Docker validation, and manual flow results into the evidence files without including secrets or machine-specific private paths.

- [ ] **Step 6: Commit verified implementation**

```powershell
git add -A
git diff --cached --check
git commit -m "feat: deliver onlyoffice documentation hub"
```

- [ ] **Step 7: Push the repository default branch**

Run: `git push origin master`

Expected: GitHub reports `master -> master` and local `HEAD` equals `origin/master`.
