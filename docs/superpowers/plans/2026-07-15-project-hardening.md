# ONLYOFFICE Project Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加固 ONLYOFFICE 演示项目的默认网络边界、callback 并发正确性、仓储读取性能、健康检查、文档入口和 GitHub 工程化交付。

**Architecture:** 保持现有 Express、文件系统仓储和双容器 Compose 架构。行为修复集中在现有 service/repository/router 边界；部署与工程化能力通过覆盖 Compose、Markdown 和 `.github` 配置增加，不引入数据库、认证框架或新的运行时依赖。

**Tech Stack:** Node.js 24、Express 5、Node test runner、Docker Compose、ONLYOFFICE Document Server 9.4.0.1、GitHub Actions、Markdown。

## Global Constraints

- 直接在仓库默认 `master` 分支实施，不创建功能分支或 PR。
- 不加入登录、用户权限、数据库、审计、版本历史或多实例状态同步。
- 保持 ONLYOFFICE 镜像固定为 `onlyoffice/documentserver:9.4.0.1`。
- 保持现有 REST envelope 与 ONLYOFFICE callback HTTP 200 协议兼容。
- 任何 callback URL 都必须继续经过 JWT、origin、大小和 OOXML 校验。
- 不输出或提交真实 `JWT_SECRET`。

---

### Task 1: Reject stale editing-session callbacks

**Files:**
- Modify: `tests/callback-service.test.js`
- Modify: `src/services/callback-service.js`

**Interfaces:**
- Consumes: `ActiveFileRegistry.activeKey(id)`、`mutex.run(id, fn)`。
- Produces: 状态 1 记录当前活动 document key；保存状态 2/6 只接受与当前活动会话相同的 key。

- [ ] **Step 1: Write the failing regression test**

在 callback service 测试中先把 `<id>-2` 记录为当前活动 key，再发送 callback key 为 `<id>-1` 的已签名状态 2 请求，并断言结果为 `{ error: 1 }`、fetch 和 `replaceContent` 都未调用。

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-name-pattern="rejects a stale revision callback" tests/callback-service.test.js`

Expected: FAIL，因为现有实现仅检查 key 以文件 ID 开头，并会执行下载。

- [ ] **Step 3: Implement active editing-key validation inside the mutex**

在下载前执行：

```js
if (this.registry.activeKey(fileId) !== body.key) {
  throw new Error("callback 文档版本已过期");
}
```

状态 1 使用 `markActive(fileId, body.key)` 建立活动 key；比较必须位于同一个文件互斥锁中，随后才允许下载和替换。状态 4 和最终状态 2 只清理相同 key，避免旧会话关闭新会话。同一活动 key 的多次状态 6 强制保存必须继续成功。

- [ ] **Step 4: Run focused and full callback tests**

Run: `node --test tests/callback-service.test.js`

Expected: 所有 callback service 测试通过。

### Task 2: Avoid repeated file reads

**Files:**
- Modify: `tests/file-repository.test.js`
- Modify: `tests/api.test.js`
- Modify: `src/repositories/file-repository.js`
- Modify: `src/routes/files.js`

**Interfaces:**
- Produces: `repository.readFile(id) -> { metadata, content }`，一次读取并校验正文。
- Keeps: `repository.get(id)` 继续做完整一致性校验，供 callback revision 检查和单文件读取使用。
- Changes: `repository.list()` 只解析和验证 metadata，不读取正文。

- [ ] **Step 1: Write failing list and download tests**

增加测试证明：列表调用在正文文件不可读时仍可返回有效 metadata；下载路由只调用一次 `repository.readFile(id)`，不再组合 `get()` 与 `readContent()`。

- [ ] **Step 2: Verify RED**

Run: `node --test tests/file-repository.test.js tests/api.test.js`

Expected: 新测试失败，因为 `list()` 当前调用 `get()`，下载路由当前重复读取。

- [ ] **Step 3: Implement metadata-only list and single download read**

提取只读取/验证 metadata 的内部方法。新增：

```js
async readFile(id) {
  const metadata = await this.#getMetadata(id);
  const content = await this.#readRequiredFile(
    this.#contentPath(this.#fileDirectory(id), metadata.extension),
  );
  if (sha256(content) !== metadata.sha256) throw storageCorrupt();
  return { metadata, content };
}
```

`get()` 复用 `readFile()` 并返回 metadata；内容路由一次调用 `readFile()`。

- [ ] **Step 4: Run repository and API tests**

Run: `node --test tests/file-repository.test.js tests/api.test.js`

Expected: 全部通过。

### Task 3: Add liveness and readiness

**Files:**
- Modify: `tests/app.test.js`
- Modify: `tests/config.test.js`
- Modify: `src/app.js`
- Modify: `src/server.js`
- Modify: `src/config.js`
- Create: `src/services/readiness-service.js`
- Create: `tests/readiness-service.test.js`
- Modify: `compose.yaml`

**Interfaces:**
- Produces: `GET /health` 与 `GET /health/live` 返回现有 200 envelope。
- Produces: `GET /health/ready` 成功返回 200，依赖失败返回稳定 503 envelope。
- Produces: `ReadinessService.check()`，验证仓储读取、模板初始化已完成，并请求 `${DOCUMENT_SERVER_INTERNAL_URL}/healthcheck`。

- [ ] **Step 1: Write failing route and service tests**

测试 `/health/live`、readiness 成功与失败响应；测试 Document Server 非 2xx、超时/网络错误时 `check()` 拒绝，但错误不包含内部响应正文。

- [ ] **Step 2: Verify RED**

Run: `node --test tests/app.test.js tests/readiness-service.test.js`

Expected: FAIL，因为路由和 service 尚不存在。

- [ ] **Step 3: Implement readiness service and routes**

readiness service 使用注入的 repository 和 fetch，调用 `repository.list()` 并以 5 秒超时请求内部 `/healthcheck`。应用路由捕获错误并返回：

```json
{"error":{"code":"SERVICE_NOT_READY","message":"服务尚未就绪"}}
```

状态码为 503。Compose app healthcheck 改用 `/health/ready`。

- [ ] **Step 4: Run health tests**

Run: `node --test tests/app.test.js tests/readiness-service.test.js tests/config.test.js`

Expected: 全部通过。

### Task 4: Safe Compose defaults and documentation

**Files:**
- Modify: `compose.yaml`
- Create: `compose.lan.yaml`
- Modify: `.gitattributes`
- Modify: `README.md`
- Create: `docs/quick-start.md`
- Modify: `docs/windows-beginner-guide.md`
- Modify: `docs/linux-beginner-guide.md`
- Modify: `docs/linux-deployment.md`
- Modify: `docs/backend-installation.md`
- Modify: `docs/troubleshooting.md`

**Interfaces:**
- Default: `docker compose up -d --build` 只发布 `127.0.0.1:3000` 和 `127.0.0.1:8080`。
- LAN trial: `docker compose -f compose.yaml -f compose.lan.yaml up -d --build` 发布到所有网卡。

- [ ] **Step 1: Change Compose and add LAN override**

默认端口使用 `127.0.0.1`。LAN 文件用 Compose 长语法 `!override` 明确替换端口列表，避免合并后同时保留本机和全网绑定。

- [ ] **Step 2: Add the ten-minute quick start**

快速指南覆盖复制 `.env`、生成至少 32 字符密钥、启动、健康检查、Word/Excel 验收和停止；Windows 与 Linux 命令分别给出，详细问题链接到现有指南。

- [ ] **Step 3: Update all affected documentation**

所有 Linux IP 试运行命令使用两份 Compose 文件；正式部署和本机默认继续使用安全绑定。补充 stale callback 与 readiness 排错说明。

- [ ] **Step 4: Normalize text attributes**

`.gitattributes` 增加：

```gitattributes
* text=auto
*.md text eol=lf
*.js text eol=lf
*.json text eol=lf
*.yaml text eol=lf
*.yml text eol=lf
```

### Task 5: GitHub maintenance and final verification

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`
- Create: `CHANGELOG.md`
- Modify: `package.json`

**Interfaces:**
- CI runs `npm ci`, `npm test`, coverage and production audit on Node 24.
- Dependabot monitors npm, GitHub Actions and Docker monthly.

- [ ] **Step 1: Add CI, Dependabot and changelog**

CI 使用最小只读权限和 npm 官方 registry。`package.json` 增加 `check` 脚本，顺序运行测试和覆盖率，不增加第三方依赖。

- [ ] **Step 2: Run complete local verification**

Run:

```text
npm test
npm run test:coverage
npm audit --omit=dev --registry=https://registry.npmjs.org
docker compose config --quiet
docker compose -f compose.yaml -f compose.lan.yaml config --quiet
git diff --check
```

Expected: 所有命令退出码为 0，102 个现有测试加新增回归测试全部通过，无空白错误。

- [ ] **Step 3: Verify documentation links and repository scope**

检查所有相对 Markdown 链接存在，检查 `git diff` 不包含 `.env`、storage、node_modules 或真实密钥。

- [ ] **Step 4: Commit and push master**

显式暂存本计划范围内文件，创建实现提交，确认 `master` 与远端关系后执行 `git push origin master`。
