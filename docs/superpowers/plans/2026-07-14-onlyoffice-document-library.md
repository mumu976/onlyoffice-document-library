# ONLYOFFICE 文档库集成演示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一套可在 Windows Docker Desktop 和 Ubuntu 22.04/24.04 上启动的 ONLYOFFICE Docs 集成应用，完成 Word/Excel 新建、上传、编辑回存、下载和删除闭环，并交付 Linux 部署、后端安装和前端 JavaScript 库文档。

**Architecture:** 一个 Node.js/Express 容器负责静态页面、REST API、文件系统仓储、JWT 编辑配置和异步保存回调；一个 `onlyoffice/documentserver:9.4.0.1` 容器负责编辑器。浏览器使用 Document Server 外部地址加载 `DocsAPI.DocEditor`，Document Server 使用 Compose 内部地址读取文件并回调应用。

**Tech Stack:** Node.js 24、Express 5.2.1、Multer 2.2.0、Helmet 8.2.0、jsonwebtoken 9.0.3、yauzl 3.4.0、原生 ES Modules/HTML/CSS、Node test runner、Supertest 7.2.2、Docker Compose、ONLYOFFICE Docs Community 9.4.0.1。

## Global Constraints

- Node.js 版本必须为 24 或更高，项目使用 ES Modules。
- ONLYOFFICE 镜像固定为 `onlyoffice/documentserver:9.4.0.1`，不得改成 `latest`。
- 默认外部地址为应用 `http://localhost:3000`、Document Server `http://localhost:8080`；容器内部应用地址为 `http://app:3000`。
- 只接受 `.docx` 和 `.xlsx`，默认单文件上限为 20 MiB。
- 文件内容存放在 `storage/<uuid>/content.<extension>`，元数据存放在同目录 `metadata.json`；不引入数据库和对象存储。
- Compose 中 JWT 必须默认启用，密钥只来自环境变量；不得把真实密钥提交到 Git。
- 首期不实现登录、权限、分享、版本历史和多人协作；所有公网部署说明必须警告应用需置于认证网关后并启用 HTTPS。
- callback 状态 `2` 和 `6` 执行回存，状态 `1` 标记活动编辑，状态 `4` 清理活动状态。
- 所有文件替换必须使用同目录临时文件加原子重命名；同内容重复 callback 不增加修订号。
- 所有用户可见文档和错误消息使用简体中文，代码标识符使用英文。

---

## File Structure

```text
.
├── .dockerignore                         # Docker 构建排除项
├── .env.example                          # 完整但无秘密的配置样例
├── .gitignore                            # node_modules、.env、storage 等
├── Dockerfile                            # Node 24 应用镜像
├── README.md                             # 本地快速启动与项目入口
├── compose.yaml                          # app + document-server
├── package.json                          # 依赖、脚本和 Node 版本约束
├── package-lock.json                     # 锁定依赖
├── scripts/
│   └── generate-templates.mjs            # 生成最小有效 blank.docx/blank.xlsx
├── templates/
│   ├── blank.docx
│   └── blank.xlsx
├── src/
│   ├── app.js                            # Express 中间件与路由装配
│   ├── config.js                         # 环境变量解析与校验
│   ├── errors.js                         # AppError 与错误码
│   ├── server.js                         # 组合依赖并监听端口
│   ├── middleware/
│   │   └── error-handler.js              # 统一 JSON 错误响应
│   ├── repositories/
│   │   └── file-repository.js            # 文件与元数据原子读写
│   ├── routes/
│   │   ├── files.js                      # 文件管理与编辑配置接口
│   │   └── onlyoffice.js                 # callback 接口
│   └── services/
│       ├── active-file-registry.js       # 进程内活动编辑状态
│       ├── callback-service.js           # JWT、可信 URL、下载和回存
│       ├── editor-config-service.js      # Docs API 配置与 token
│       ├── keyed-mutex.js                # 同一文件 callback 串行化
│       └── ooxml.js                      # 文件名、扩展名和 OOXML 校验
├── public/
│   ├── index.html                        # 文件管理与编辑器容器
│   ├── css/app.css                       # 响应式页面样式
│   └── js/
│       ├── app.js                        # 页面交互
│       ├── onlyoffice-editor.js          # 可复用前端库
│       └── onlyoffice-editor.d.ts         # 类型声明
├── tests/
│   ├── api.test.js
│   ├── callback-service.test.js
│   ├── config.test.js
│   ├── editor-config-service.test.js
│   ├── file-repository.test.js
│   ├── onlyoffice-editor.test.js
│   └── ooxml.test.js
└── docs/
    ├── backend-installation.md
    ├── demo-guide.md
    ├── frontend-library.md
    ├── linux-deployment.md
    ├── research-report.md
    └── troubleshooting.md
```

## Shared Interfaces

Later tasks must use these exact public contracts:

```js
// src/config.js
export function loadConfig(env = process.env, cwd = process.cwd())

// src/services/ooxml.js
export function extensionFromName(name)
export function normalizeDisplayName(name, extension)
export async function validateOoxmlBuffer(buffer, extension, maxUncompressedBytes)
export function sha256(buffer)

// src/repositories/file-repository.js
export class FileRepository {
  constructor({ storageDir, templateDir, now, idFactory, maxUncompressedBytes })
  async init()
  async list()
  async get(id)
  async create({ name, type })
  async upload({ name, buffer })
  async readContent(id)
  async replaceContent(id, buffer)
  async remove(id)
}

// src/services/editor-config-service.js
export class EditorConfigService {
  constructor({ appInternalUrl, jwtSecret })
  build(metadata)
}

// src/services/callback-service.js
export class CallbackService {
  constructor({ repository, activeFiles, mutex, jwtSecret,
                documentServerInternalUrl, maxFileBytes, fetchImpl })
  async handle({ fileId, body, authorization })
}

// public/js/onlyoffice-editor.js
export class OnlyOfficeEditor extends EventTarget {
  constructor({ containerId, documentServerUrl, apiLoader, windowObject })
  async open(config)
  close()
  get isOpen()
}
export function loadOnlyOfficeApi(documentServerUrl, windowObject = window)
```

---

### Task 1: Project scaffold and validated configuration

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/errors.js`
- Create: `src/config.js`
- Test: `tests/config.test.js`

**Interfaces:**
- Consumes: no project code.
- Produces: `AppError`; `loadConfig(env, cwd)` returning normalized paths, URLs, port, JWT secret and byte limits.

- [ ] **Step 1: Create package metadata and scripts**

Create `package.json` exactly with the pinned dependency set:

```json
{
  "name": "onlyoffice-document-library-demo",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "templates": "node scripts/generate-templates.mjs",
    "test": "node --test --test-reporter=spec",
    "test:coverage": "node --test --experimental-test-coverage"
  },
  "dependencies": {
    "express": "5.2.1",
    "helmet": "8.2.0",
    "jsonwebtoken": "9.0.3",
    "multer": "2.2.0",
    "yauzl": "3.4.0"
  },
  "devDependencies": {
    "supertest": "7.2.2",
    "yazl": "3.3.1"
  }
}
```

Create `.gitignore` with `node_modules/`, `.env`, `storage/`, `coverage/`, `*.log`; create `.env.example` with these exact keys:

```dotenv
PORT=3000
STORAGE_DIR=./storage
TEMPLATE_DIR=./templates
DOCUMENT_SERVER_PUBLIC_URL=http://localhost:8080
DOCUMENT_SERVER_INTERNAL_URL=http://document-server
APP_INTERNAL_URL=http://app:3000
JWT_SECRET=replace-with-at-least-32-random-characters
MAX_FILE_BYTES=20971520
MAX_UNCOMPRESSED_BYTES=104857600
```

Run in the current PowerShell workspace: `npm.cmd install`  
Expected: `package-lock.json` is created and `npm audit` reports no high/critical issue. If the registry reports a high/critical advisory, stop and replace only the affected direct dependency with the nearest patched version before continuing.

- [ ] **Step 2: Write failing configuration tests**

Create `tests/config.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadConfig } from "../src/config.js";

const valid = {
  JWT_SECRET: "12345678901234567890123456789012",
  DOCUMENT_SERVER_PUBLIC_URL: "http://localhost:8080/",
  DOCUMENT_SERVER_INTERNAL_URL: "http://document-server/",
  APP_INTERNAL_URL: "http://app:3000/"
};

test("loadConfig normalizes defaults, paths and URLs", () => {
  const config = loadConfig(valid, "C:/demo");
  assert.equal(config.port, 3000);
  assert.equal(config.maxFileBytes, 20 * 1024 * 1024);
  assert.equal(config.documentServerPublicUrl, "http://localhost:8080");
  assert.equal(config.documentServerInternalUrl, "http://document-server");
  assert.equal(config.appInternalUrl, "http://app:3000");
  assert.equal(config.storageDir, path.resolve("C:/demo", "storage"));
});

test("loadConfig rejects a short JWT secret", () => {
  assert.throws(
    () => loadConfig({ ...valid, JWT_SECRET: "short" }),
    error => error.code === "INVALID_CONFIG" && /JWT_SECRET/.test(error.message)
  );
});

test("loadConfig rejects invalid positive integers and URL protocols", () => {
  assert.throws(() => loadConfig({ ...valid, PORT: "0" }), /PORT/);
  assert.throws(
    () => loadConfig({ ...valid, DOCUMENT_SERVER_PUBLIC_URL: "ftp://docs" }),
    /DOCUMENT_SERVER_PUBLIC_URL/
  );
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm.cmd test -- tests/config.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/config.js`.

- [ ] **Step 4: Implement errors and configuration parsing**

Create `src/errors.js`:

```js
export class AppError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
```

Create `src/config.js` with helpers `positiveInteger(name, value, fallback)`, `httpUrl(name, value)` and `withoutTrailingSlash(value)`. `loadConfig` must resolve storage/template paths against `cwd`, require a JWT secret of at least 32 characters, and return exactly:

```js
{
  port,
  storageDir,
  templateDir,
  documentServerPublicUrl,
  documentServerInternalUrl,
  appInternalUrl,
  jwtSecret,
  maxFileBytes,
  maxUncompressedBytes
}
```

All validation failures throw `new AppError("INVALID_CONFIG", message, 500)`; accepted URL protocols are only `http:` and `https:`.

- [ ] **Step 5: Verify and commit**

Run: `npm.cmd test -- tests/config.test.js`  
Expected: 3 tests pass.

```bash
git add package.json package-lock.json .gitignore .env.example src/errors.js src/config.js tests/config.test.js
git commit -m "chore: scaffold onlyoffice integration app"
```

---

### Task 2: Valid blank templates and OOXML validation

**Files:**
- Create: `scripts/generate-templates.mjs`
- Create: `templates/blank.docx`
- Create: `templates/blank.xlsx`
- Create: `src/services/ooxml.js`
- Test: `tests/ooxml.test.js`

**Interfaces:**
- Consumes: `AppError`, config byte limits.
- Produces: `extensionFromName`, `normalizeDisplayName`, `validateOoxmlBuffer`, `sha256`.

- [ ] **Step 1: Write failing OOXML tests**

Create `tests/ooxml.test.js` that reads both generated templates and asserts:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  extensionFromName, normalizeDisplayName, validateOoxmlBuffer, sha256
} from "../src/services/ooxml.js";

test("recognizes supported extensions case-insensitively", () => {
  assert.equal(extensionFromName("报告.DOCX"), "docx");
  assert.equal(extensionFromName("数据.xlsx"), "xlsx");
  assert.throws(() => extensionFromName("payload.zip"), error => error.code === "UNSUPPORTED_FILE_TYPE");
});

test("normalizes a display name without changing its intended extension", () => {
  assert.equal(normalizeDisplayName("../季度报告", "docx"), "季度报告.docx");
  assert.equal(normalizeDisplayName("表格.xlsx", "xlsx"), "表格.xlsx");
});

test("accepts generated Word and Excel templates", async () => {
  const docx = await readFile(new URL("../templates/blank.docx", import.meta.url));
  const xlsx = await readFile(new URL("../templates/blank.xlsx", import.meta.url));
  await validateOoxmlBuffer(docx, "docx", 100 * 1024 * 1024);
  await validateOoxmlBuffer(xlsx, "xlsx", 100 * 1024 * 1024);
  assert.match(sha256(docx), /^[a-f0-9]{64}$/);
});

test("rejects a renamed non-OOXML buffer", async () => {
  await assert.rejects(
    validateOoxmlBuffer(Buffer.from("not a zip"), "docx", 1024),
    error => error.code === "INVALID_OOXML"
  );
});
```

- [ ] **Step 2: Verify the missing module failure**

Run: `npm.cmd test -- tests/ooxml.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/services/ooxml.js`.

- [ ] **Step 3: Generate minimal valid templates**

Create `scripts/generate-templates.mjs`. Use `yazl.ZipFile`, add UTF-8 buffers with fixed ZIP paths, and pipe to `templates/blank.docx` and `templates/blank.xlsx`. The Word archive must contain `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`; the Excel archive must contain `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/worksheets/sheet1.xml`, `xl/styles.xml`. XML namespaces must use the ECMA-376 transitional namespaces and Sheet1 must reference relationship `rId1`.

Run: `npm.cmd run templates`  
Expected: both template files exist and each is a ZIP/OOXML file larger than 1 KiB.

- [ ] **Step 4: Implement streaming archive inspection**

Create `src/services/ooxml.js`. Use `yauzl.fromBufferPromise(buffer, { lazyEntries: true, validateEntrySizes: true })` and `for await (const entry of zip.eachEntry())`. Sum `entry.uncompressedSize` and reject values above `maxUncompressedBytes`; collect normalized entry names without extracting them. Require `[Content_Types].xml` plus `word/document.xml` for `docx`, or `[Content_Types].xml` plus `xl/workbook.xml` for `xlsx`. Convert all ZIP/parsing failures into `AppError("INVALID_OOXML", "文件不是有效的 OOXML 文档", 400)`.

`normalizeDisplayName` must call `path.basename`, remove control characters, trim whitespace, reject an empty base name, limit the final UTF-16 string to 128 characters, and append the expected extension exactly once. `sha256` returns `createHash("sha256").update(buffer).digest("hex")`.

- [ ] **Step 5: Verify and commit**

Run: `npm.cmd test -- tests/ooxml.test.js`  
Expected: 4 tests pass.

```bash
git add scripts/generate-templates.mjs templates src/services/ooxml.js tests/ooxml.test.js
git commit -m "feat: validate ooxml files and add blank templates"
```

---

### Task 3: Atomic filesystem repository

**Files:**
- Create: `src/repositories/file-repository.js`
- Test: `tests/file-repository.test.js`

**Interfaces:**
- Consumes: OOXML helpers and generated templates.
- Produces: the exact `FileRepository` contract in Shared Interfaces.

- [ ] **Step 1: Write repository lifecycle tests**

Create a fixture helper using `mkdtemp(path.join(tmpdir(), "onlyoffice-repo-"))`, copy the two templates into a temporary template directory, and construct the repository with deterministic `now` and `idFactory`. Tests must assert:

```js
const created = await repository.create({ name: "季度报告", type: "word" });
assert.deepEqual(
  { id: created.id, name: created.name, extension: created.extension, revision: created.revision },
  { id: "11111111-1111-4111-8111-111111111111", name: "季度报告.docx", extension: "docx", revision: 1 }
);
assert.equal((await repository.list()).length, 1);
assert.deepEqual(await repository.readContent(created.id), await readFile(blankDocxPath));

const unchanged = await repository.replaceContent(created.id, await repository.readContent(created.id));
assert.equal(unchanged.changed, false);
assert.equal(unchanged.metadata.revision, 1);

const changed = await repository.replaceContent(created.id, differentValidDocx);
assert.equal(changed.changed, true);
assert.equal(changed.metadata.revision, 2);

await repository.remove(created.id);
await assert.rejects(repository.get(created.id), error => error.code === "FILE_NOT_FOUND");
```

Add separate tests for upload, malformed UUID rejection, metadata/content inconsistency, and newest-first ordering.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm.cmd test -- tests/file-repository.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement repository invariants**

Implement `FileRepository` with these exact rules:

- `init()` creates `storageDir` recursively and validates both templates with `validateOoxmlBuffer`.
- All IDs must match a UUID regular expression before being joined into a path.
- `create({name,type})` maps `word -> docx`, `spreadsheet -> xlsx`, copies the selected template buffer, and delegates to one private `#persistNew` method.
- `upload({name,buffer})` derives the extension from the original name, validates the buffer, normalizes the name, and delegates to `#persistNew`.
- `#persistNew` creates a UUID directory with `{ recursive: false }`, writes content and metadata to temporary names, then renames them to final names; any failure removes only the newly generated UUID directory.
- `get(id)` parses `metadata.json`, checks `metadata.id === id`, verifies the expected content file exists, and returns metadata.
- `list()` ignores non-UUID entries, loads valid metadata, and sorts descending by `updatedAt`.
- `replaceContent` validates before writing, compares SHA-256, writes and fsyncs a temporary file in the same directory, renames over the content, then atomically replaces metadata; unchanged content does not change `updatedAt` or `revision`.
- `remove(id)` removes only the already validated UUID directory recursively.
- Missing files throw `AppError("FILE_NOT_FOUND", "文件不存在", 404)`; inconsistent storage throws `AppError("STORAGE_CORRUPT", "文件存储不完整", 500)`.

- [ ] **Step 4: Verify repository behavior and coverage**

Run: `npm.cmd test -- tests/file-repository.test.js`  
Expected: all repository tests pass and no files remain under the real `storage/` directory.

- [ ] **Step 5: Commit**

```bash
git add src/repositories/file-repository.js tests/file-repository.test.js
git commit -m "feat: add atomic file repository"
```

---

### Task 4: Editor config, active registry and keyed mutex

**Files:**
- Create: `src/services/editor-config-service.js`
- Create: `src/services/active-file-registry.js`
- Create: `src/services/keyed-mutex.js`
- Test: `tests/editor-config-service.test.js`

**Interfaces:**
- Consumes: file metadata, `APP_INTERNAL_URL`, `JWT_SECRET`.
- Produces: signed Docs API config; `markActive`, `markInactive`, `isActive`; `run(key, fn)`.

- [ ] **Step 1: Write failing editor config tests**

Create `tests/editor-config-service.test.js` using `jwt.verify` and assert the complete important shape:

```js
const metadata = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "季度报告.docx",
  extension: "docx",
  revision: 3
};
const service = new EditorConfigService({
  appInternalUrl: "http://app:3000",
  jwtSecret: "12345678901234567890123456789012"
});
const config = service.build(metadata);
assert.equal(config.documentType, "word");
assert.equal(config.document.key, `${metadata.id}-3`);
assert.equal(config.document.url, `http://app:3000/api/files/${metadata.id}/content`);
assert.equal(config.editorConfig.callbackUrl, `http://app:3000/api/onlyoffice/callback/${metadata.id}`);
assert.equal(jwt.verify(config.token, secret).document.key, config.document.key);
```

Add an `.xlsx` assertion for `documentType === "cell"`, plus registry and mutex tests proving two functions for the same key run sequentially while different keys can overlap.

- [ ] **Step 2: Verify failure**

Run: `npm.cmd test -- tests/editor-config-service.test.js`  
Expected: FAIL because all three modules are absent.

- [ ] **Step 3: Implement the three small services**

`EditorConfigService.build` must produce `type: "desktop"`, `width: "100%"`, `height: "100%"`, document permissions `{ edit: true, download: true, print: true }`, `editorConfig.lang: "zh-CN"`, `mode: "edit"`, user `{ id: "demo-user", name: "演示用户" }`, and `customization.forcesave: true`. Sign the entire unsigned config with `jwt.sign(unsignedConfig, jwtSecret, { algorithm: "HS256" })` and append `token`.

`ActiveFileRegistry` wraps a private `Set`; `markActive(id)`, `markInactive(id)`, and `isActive(id)` are synchronous. `KeyedMutex.run(key, fn)` chains promises per key and deletes the chain in `finally` only if it is still the latest chain.

- [ ] **Step 4: Verify and commit**

Run: `npm.cmd test -- tests/editor-config-service.test.js`  
Expected: Word, Excel, registry and serialization tests pass.

```bash
git add src/services/editor-config-service.js src/services/active-file-registry.js src/services/keyed-mutex.js tests/editor-config-service.test.js
git commit -m "feat: build signed onlyoffice editor configs"
```

---

### Task 5: Secure callback download and atomic save

**Files:**
- Create: `src/services/callback-service.js`
- Test: `tests/callback-service.test.js`

**Interfaces:**
- Consumes: repository, registry, mutex, JWT secret, Document Server internal origin and injectable `fetchImpl`.
- Produces: `CallbackService.handle({fileId, body, authorization}) -> Promise<{error:number}>`.

- [ ] **Step 1: Write callback state tests**

Build repository/registry spies and sign test tokens with HS256. Cover exactly:

- status `1`: calls `markActive(fileId)`, returns `{error:0}`, never fetches;
- status `4`: calls `markInactive(fileId)`, returns `{error:0}`;
- status `2`: fetches a trusted `http://document-server/...` URL, calls `replaceContent`, then `markInactive`;
- status `6`: saves content but remains active;
- missing/invalid token: returns `{error:1}` and performs no write;
- a valid token whose signed `payload.status`, `payload.key` or `payload.url` differs from the JSON body: returns `{error:1}`;
- `https://attacker.example/file.docx`: returns `{error:1}` and performs no fetch;
- body larger than `maxFileBytes`: returns `{error:1}` and preserves the repository;
- two status `6` callbacks for one ID are serialized by the mutex.

Use a `Response` object for fetch stubs so the production code exercises headers and streamed bodies.

- [ ] **Step 2: Verify failure**

Run: `npm.cmd test -- tests/callback-service.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement callback verification and limited download**

Implementation rules:

```js
const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? body.token;
const claims = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
const signed = claims.payload ?? claims;
if (signed.status !== body.status || signed.key !== body.key ||
    (body.url !== undefined && signed.url !== body.url) ||
    !body.key.startsWith(`${fileId}-`)) {
  throw new Error("callback 签名内容与请求不一致");
}
```

Compare `new URL(body.url).origin` exactly with `new URL(documentServerInternalUrl).origin`. Fetch using `AbortSignal.timeout(30_000)`. Reject non-2xx responses. Read `response.body` with `for await (const chunk of response.body)`, increment a byte counter before pushing each chunk, and abort once the counter exceeds `maxFileBytes`; do not rely only on `Content-Length`. Pass the final buffer to `repository.replaceContent` inside `mutex.run(fileId, fn)`.

Catch all callback processing errors, log a JSON object containing `level`, `event`, `fileId`, `status`, and safe error message, and return `{error:1}` without leaking a token or download URL query string.

- [ ] **Step 4: Verify and commit**

Run: `npm.cmd test -- tests/callback-service.test.js`  
Expected: all state, JWT, SSRF, size and serialization tests pass.

```bash
git add src/services/callback-service.js tests/callback-service.test.js
git commit -m "feat: handle onlyoffice save callbacks"
```

---

### Task 6: Express REST API and application composition

**Files:**
- Create: `src/middleware/error-handler.js`
- Create: `src/routes/files.js`
- Create: `src/routes/onlyoffice.js`
- Create: `src/app.js`
- Create: `src/server.js`
- Test: `tests/api.test.js`

**Interfaces:**
- Consumes: all backend services from Tasks 1-5.
- Produces: `createApp(dependencies)` and runnable `src/server.js`.

- [ ] **Step 1: Write API integration tests**

Use a temporary real `FileRepository`, `supertest`, and a stub callback service. Assert exact status and response shapes for:

```js
await request(app).get("/health").expect(200, { data: { status: "ok" } });
await request(app).get("/api/config").expect(200, {
  data: {
    documentServerUrl: "http://localhost:8080",
    maxFileBytes: 20971520,
    supportedExtensions: ["docx", "xlsx"]
  }
});
const created = await request(app)
  .post("/api/files")
  .send({ name: "报告", type: "word" })
  .expect(201);
await request(app).get("/api/files").expect(200);
await request(app).get(`/api/files/${created.body.data.id}/editor-config`).expect(200);
await request(app).get(`/api/files/${created.body.data.id}/content`).expect(200);
await request(app).delete(`/api/files/${created.body.data.id}`).expect(204);
```

Also test multipart field name `file`, extension/MIME mismatch, invalid type, 20 MiB overflow, unknown ID, active-file delete conflict `409`, and callback forwarding of the `Authorization` header.

- [ ] **Step 2: Verify failure**

Run: `npm.cmd test -- tests/api.test.js`  
Expected: FAIL because `src/app.js` is absent.

- [ ] **Step 3: Implement routes and error middleware**

`createFilesRouter({repository, editorConfigService, activeFiles, maxFileBytes})` uses Multer memory storage with `{ fileSize: maxFileBytes, files: 1, fields: 0 }`. Its upload route must require the official DOCX/XLSX MIME value matching the extension; `application/octet-stream` may be accepted only because the subsequent OOXML structure check is authoritative. It exposes the exact endpoints in the design spec. For the content endpoint, call `repository.get(id)` and `repository.readContent(id)`, set the matching OOXML MIME type, and emit `Content-Disposition: attachment; filename="download.<extension>"; filename*=UTF-8''<encoded display name>` so Chinese names are safe without exposing a storage path. Return `204` for delete.

`createOnlyOfficeRouter({callbackService})` forwards `{fileId:req.params.id, body:req.body, authorization:req.get("authorization")}` and always returns the callback service object with HTTP 200.

`errorHandler` maps `AppError` to its status and `{error:{code,message}}`, Multer limit errors to `413 FILE_TOO_LARGE`, malformed JSON to `400 INVALID_JSON`, and unknown errors to `500 INTERNAL_ERROR` while logging only safe fields.

- [ ] **Step 4: Compose the application and server**

`createApp` must apply request JSON logging, `express.json({limit:"1mb"})`, Helmet with `crossOriginEmbedderPolicy:false`, a CSP allowing `'self'` and the configured Document Server origin in `script-src`, `frame-src` and `connect-src`, static `public/`, API routes, an API 404 handler, and final error middleware.

`src/server.js` must call `loadConfig`, instantiate repository/services, await `repository.init()`, listen on `0.0.0.0:${config.port}`, and handle `SIGINT`/`SIGTERM` by closing the HTTP server before exit.

- [ ] **Step 5: Verify and commit**

Run: `npm.cmd test -- tests/api.test.js`  
Expected: health, config, CRUD, upload, content, editor config, conflict and callback tests pass.

Run: `npm.cmd test`  
Expected: every backend test passes.

```bash
git add src/middleware src/routes src/app.js src/server.js tests/api.test.js
git commit -m "feat: expose document library rest api"
```

---

### Task 7: Reusable `OnlyOfficeEditor` JavaScript library

**Files:**
- Create: `public/js/onlyoffice-editor.js`
- Create: `public/js/onlyoffice-editor.d.ts`
- Test: `tests/onlyoffice-editor.test.js`

**Interfaces:**
- Consumes: browser `window`, `document`, and official `window.DocsAPI.DocEditor`.
- Produces: `loadOnlyOfficeApi` and `OnlyOfficeEditor` exact contracts from Shared Interfaces.

- [ ] **Step 1: Write browser-independent failing tests**

Use injected fake `windowObject`, fake loader and fake `DocEditor` constructor. Assert:

```js
const editor = new OnlyOfficeEditor({
  containerId: "editor",
  documentServerUrl: "http://localhost:8080",
  apiLoader: async () => ({ DocEditor: FakeDocEditor }),
  windowObject: fakeWindow
});
const events = [];
editor.addEventListener("ready", event => events.push(event.type));
editor.addEventListener("document-ready", event => events.push(event.type));
await editor.open(config);
assert.equal(editor.isOpen, true);
capturedConfig.events.onAppReady();
capturedConfig.events.onDocumentReady();
assert.deepEqual(events, ["ready", "document-ready"]);
editor.close();
assert.equal(destroyCalls, 1);
assert.equal(editor.isOpen, false);
```

Also assert script URL normalization to `/web-apps/apps/api/documents/api.js`, concurrent loader calls share one Promise, `open` closes a prior instance, state events emit `{dirty:boolean}`, and `onError` emits `{code,description}`.

- [ ] **Step 2: Verify failure**

Run: `npm.cmd test -- tests/onlyoffice-editor.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement library and type declarations**

Use a module-level `Map<string, Promise<object>>` for script loads. Reject script errors with `Error("ONLYOFFICE API 加载失败")`. Preserve any events supplied in the backend config by calling the original event handler before dispatching the wrapper event. `close()` calls `destroyEditor()` once and clears the reference.

The `.d.ts` file must declare constructor options, `open(config: Record<string, unknown>): Promise<void>`, `close(): void`, readonly `isOpen: boolean`, and typed overloads for `ready`, `document-ready`, `state-change`, and `error` custom events. It must not claim this project bundles the official ONLYOFFICE `api.js`; the runtime loads it from Document Server.

- [ ] **Step 4: Verify and commit**

Run: `npm.cmd test -- tests/onlyoffice-editor.test.js`  
Expected: loader caching, lifecycle and event tests pass.

```bash
git add public/js/onlyoffice-editor.js public/js/onlyoffice-editor.d.ts tests/onlyoffice-editor.test.js
git commit -m "feat: add reusable onlyoffice editor library"
```

---

### Task 8: File management page and editor workflow

**Files:**
- Create: `public/index.html`
- Create: `public/css/app.css`
- Create: `public/js/app.js`
- Modify: `tests/api.test.js`

**Interfaces:**
- Consumes: REST API and `OnlyOfficeEditor`.
- Produces: single-page demo for complete Word/Excel lifecycle.

- [ ] **Step 1: Extend the static delivery test**

Add assertions that `GET /` contains `id="file-list"`, `id="editor-shell"`, a module script `/js/app.js`, and that `GET /js/onlyoffice-editor.js` returns JavaScript. Run the test and confirm it fails with 404 before creating the files.

- [ ] **Step 2: Create accessible page markup**

`index.html` must contain:

- header with title `ONLYOFFICE 文档库演示` and health/status element;
- buttons `新建 Word` and `新建 Excel`;
- upload form with `accept=".docx,.xlsx"` and field name `file`;
- live-region error/status banner;
- file table/list with name, type, updated time, open, download and delete actions;
- hidden full-viewport editor shell containing status text, `关闭编辑器` button and `id="onlyoffice-editor"` container;
- `<script type="module" src="/js/app.js"></script>`.

- [ ] **Step 3: Implement page controller**

`public/js/app.js` imports `OnlyOfficeEditor`, defines one `api(path, options)` helper that parses the stable error envelope, loads `/api/config` and `/api/files`, and uses event delegation on the file list. New-file buttons prompt for a base name and POST `{name,type}`; upload sends one FormData file; open records the selected file revision, fetches editor config, shows the editor shell and calls `editor.open`; close destroys the editor and polls `/api/files` once per second for at most 15 seconds until the revision increases, then reloads the list. If no revision change is observed, show `未检测到新版本；若未修改文档这是正常现象` rather than claiming a save. Delete requires `window.confirm`; download navigates to the content endpoint.

Map wrapper events to Chinese statuses exactly: `正在加载编辑器`, `文档已打开`, `存在尚未同步的修改`, `修改已同步到编辑服务`, and `编辑器错误：<code> <description>`.

- [ ] **Step 4: Add responsive styles and verify**

Create `public/css/app.css` with CSS custom properties, a max-width content container, keyboard-visible focus styles, table-to-card behavior below 720 px, fixed editor shell, and a minimum editor height of `calc(100vh - 64px)`. Do not load external fonts or CSS.

Run: `npm.cmd test -- tests/api.test.js`  
Expected: static page assertions and all API tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/css/app.css public/js/app.js tests/api.test.js
git commit -m "feat: add document library demo ui"
```

---

### Task 9: Reproducible Docker Compose deployment

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `compose.yaml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: runnable Node app and `onlyoffice/documentserver:9.4.0.1`.
- Produces: two healthy containers, persistent storage and correct internal/external URLs.

- [ ] **Step 1: Write Docker assets**

`Dockerfile` must use `node:24-alpine`, set `NODE_ENV=production`, copy `package*.json`, run `npm ci --omit=dev`, copy `src`, `public`, and `templates`, create `/app/storage` owned by user `node`, switch to `USER node`, expose 3000, and use `CMD ["node","src/server.js"]`.

`.dockerignore` must exclude `.git`, `node_modules`, `storage`, `.env`, `docs/superpowers`, tests, screenshots and logs.

`compose.yaml` must define:

```yaml
services:
  document-server:
    image: onlyoffice/documentserver:9.4.0.1
    restart: unless-stopped
    environment:
      JWT_ENABLED: "true"
      JWT_SECRET: ${JWT_SECRET}
      JWT_HEADER: Authorization
      ALLOW_PRIVATE_IP_ADDRESS: "true"
    ports:
      - "8080:80"
    volumes:
      - document_data:/var/www/onlyoffice/Data
      - document_logs:/var/log/onlyoffice
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost/healthcheck"]
      interval: 10s
      timeout: 5s
      retries: 30

  app:
    build: .
    restart: unless-stopped
    environment:
      PORT: "3000"
      STORAGE_DIR: /app/storage
      TEMPLATE_DIR: /app/templates
      DOCUMENT_SERVER_PUBLIC_URL: ${DOCUMENT_SERVER_PUBLIC_URL:-http://localhost:8080}
      DOCUMENT_SERVER_INTERNAL_URL: http://document-server
      APP_INTERNAL_URL: http://app:3000
      JWT_SECRET: ${JWT_SECRET}
      MAX_FILE_BYTES: ${MAX_FILE_BYTES:-20971520}
      MAX_UNCOMPRESSED_BYTES: ${MAX_UNCOMPRESSED_BYTES:-104857600}
    ports:
      - "3000:3000"
    volumes:
      - ./storage:/app/storage
    depends_on:
      document-server:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  document_data:
  document_logs:
```

- [ ] **Step 2: Validate Compose and build the app image**

Copy `.env.example` to `.env` and replace only `JWT_SECRET` with a generated 32-byte-or-longer value.

Run: `docker compose config --quiet`  
Expected: exit code 0 and no interpolation warning.

Run: `docker compose build app`  
Expected: app image builds from Node 24 Alpine and the final layer runs as user `node`.

- [ ] **Step 3: Start and verify health**

Run: `docker compose up -d`  
Run: `docker compose ps`  
Expected: both services are `running (healthy)`; first Document Server initialization may take several minutes.

Run: `curl.exe -fsS http://localhost:3000/health`  
Expected: `{"data":{"status":"ok"}}`.

Run: `curl.exe -fsS http://localhost:8080/healthcheck`  
Expected: `true`.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore compose.yaml .env.example
git commit -m "build: add onlyoffice docker compose stack"
```

---

### Task 10: Research report, installation guides and JS library documentation

**Files:**
- Create: `README.md`
- Create: `docs/research-report.md`
- Create: `docs/backend-installation.md`
- Create: `docs/frontend-library.md`
- Create: `docs/linux-deployment.md`
- Create: `docs/troubleshooting.md`
- Create: `docs/demo-guide.md`

**Interfaces:**
- Consumes: final commands, environment variables, REST API and frontend library behavior.
- Produces: complete Chinese handoff documentation with official citations.

- [ ] **Step 1: Write the source-backed research report**

`docs/research-report.md` must include the research date `2026-07-14`, distinguish ONLYOFFICE Docs from DocSpace/Workspace, compare Docker Compose, native DEB and official integration examples, explain why this project chose self-hosted Docs + custom Express integrator, list Community Edition limitations relevant to production sizing, and link directly to the official Docs API, callback handler, Docker install, Linux requirements, Docker tags and official example repository pages from the design specification.

Every statement about current version, resource requirement or API state must have an adjacent official link. Do not cite third-party tutorials.

- [ ] **Step 2: Write backend installation and API documentation**

`docs/backend-installation.md` must cover prerequisites, native Node startup, every environment variable with default/required status, directory layout, the nine REST endpoints and example request/response bodies, JWT flow, `document.key` revision rule, callback statuses `1/2/4/6`, atomic save algorithm, structured logs, backup boundary, and the explicit no-auth security limitation.

Include executable examples for `npm ci`, `npm run templates`, `npm test`, `npm start`, create Word, upload Excel, list, download, delete, health and callback diagnostics. Use PowerShell-compatible `curl.exe` examples for Windows and POSIX `curl` examples for Linux.

- [ ] **Step 3: Write the frontend library manual**

`docs/frontend-library.md` must state that `onlyoffice-editor.js` is this project's wrapper and that the official `api.js` is loaded at runtime from Document Server. Document constructor options, `open`, `close`, `isOpen`, the four wrapper events and error behavior. Include a complete HTML/ES module example and separate Word/Excel config excerpts showing `documentType: "word"` and `documentType: "cell"`. Explain lifecycle cleanup and CSP requirements.

- [ ] **Step 4: Write Ubuntu Docker Compose deployment**

`docs/linux-deployment.md` must target Ubuntu 22.04/24.04 x86_64 and include:

1. official baseline: dual-core 2 GHz, 4 GB RAM, 40 GB disk, 4 GB Swap;
2. Docker Engine repository installation commands and `docker compose version` verification;
3. project placement under `/opt/onlyoffice-demo` and `storage` ownership;
4. `openssl rand -hex 32` secret generation and server-IP/domain `DOCUMENT_SERVER_PUBLIC_URL` examples;
5. `docker compose config`, pull, build, start, health, logs, stop and restart commands;
6. UFW rules for LAN ports 3000/8080;
7. Nginx HTTPS reverse proxy examples for separate `files.example.com` and `docs.example.com` hostnames, including WebSocket upgrade headers and large-body timeout settings;
8. a warning that both public URLs must use HTTPS to avoid browser mixed-content blocking;
9. Docker boot enablement, tar-based `storage` backup, named-volume backup, restore and version-pinned upgrade sequence;
10. rollback commands that restore the previous Compose file and data backup.

Explain that `ALLOW_PRIVATE_IP_ADDRESS=true` is required because Document Server downloads files from the private Compose address `http://app:3000`; keep `ALLOW_META_IP_ADDRESS` disabled, place both services on the isolated Compose network, and never treat this setting as a substitute for callback URL allowlisting in the Express app.

The deployment guide must warn that the app has no authentication and require an authenticated reverse proxy before Internet exposure.

- [ ] **Step 5: Write troubleshooting, demo guide and README**

`docs/troubleshooting.md` must use a symptom/cause/check/fix table for container health, Document Server unable to fetch content, callback unreachable, JWT mismatch, editor blank page, mixed content, upload rejection, storage permission, fonts and stale `document.key`. Each check must name an exact command or browser console/network observation.

`docs/demo-guide.md` must list the Word and Excel acceptance sequence from the design, record commands for capturing `docker compose ps`, test output and container versions, and reserve concrete result fields as unchecked Markdown checkboxes rather than invented successes.

`README.md` must provide a five-minute Windows Docker Desktop quick start, architecture summary, supported features, links to all six docs, security warning, test command and clean shutdown command. It must not claim the local demonstration passed until Task 11 records evidence.

- [ ] **Step 6: Check links, commands and consistency**

Run:

```powershell
rg -n "localhost:3000|localhost:8080|APP_INTERNAL_URL|DOCUMENT_SERVER_PUBLIC_URL|JWT_SECRET|20971520" README.md docs .env.example compose.yaml src public
rg -n "TB[D]|TO[D]O|待[补]充|稍后[补]充" README.md docs
```

Expected: all address/config references match code and Compose; the second command returns no matches. Unchecked acceptance checkboxes in `docs/demo-guide.md` are permitted because they represent evidence to be collected in Task 11, not missing instructions.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/research-report.md docs/backend-installation.md docs/frontend-library.md docs/linux-deployment.md docs/troubleshooting.md docs/demo-guide.md
git commit -m "docs: add onlyoffice deployment and integration guides"
```

---

### Task 11: Full verification and local Word/Excel demonstration

**Files:**
- Modify: `docs/demo-guide.md`
- Create: `docs/evidence/compose-ps.txt`
- Create: `docs/evidence/test-output.txt`
- Create: `docs/evidence/versions.txt`
- Create: `docs/evidence/word-editor.png`
- Create: `docs/evidence/excel-editor.png`

**Interfaces:**
- Consumes: complete application, Compose stack and demo guide.
- Produces: reproducible evidence for every milestone.

- [x] **Step 1: Run all automated checks from a clean install**

Run:

```powershell
npm.cmd ci
npm.cmd run templates
npm.cmd test
npm.cmd run test:coverage
docker compose config --quiet
docker compose build --no-cache app
docker compose up -d
docker compose ps
```

Expected: every test passes, coverage command exits 0, Compose validates, app image builds, and both services become healthy. Redirect the final successful test output and `docker compose ps` output to the two evidence text files without editing the command results.

- [x] **Step 2: Exercise Word lifecycle in the browser**

Open `http://localhost:3000`, create `Word验收.docx`, enter a dated Chinese sentence, wait for `修改已同步到编辑服务`, close the editor, wait for callback completion, reopen and confirm the sentence remains. Download the file and open it in a local Office-compatible application. Capture `docs/evidence/word-editor.png` while the persisted sentence is visible.

- [x] **Step 3: Exercise Excel lifecycle in the browser**

Create `Excel验收.xlsx`, set `A1=10`, `A2=20`, `A3=SUM(A1:A2)`, verify `A3=30`, wait for synchronization, close, reopen and confirm all values/formula remain. Download and open locally. Capture `docs/evidence/excel-editor.png` while the persisted sheet is visible.

- [x] **Step 4: Exercise upload and delete**

Upload the downloaded Word and Excel files, open both successfully, then close and delete the uploaded copies. Verify the API list no longer contains them and no corresponding UUID directories remain under `storage/`.

- [x] **Step 5: Record versions and update the checklist truthfully**

Record exact output from `node --version`, `npm.cmd --version`, `docker --version`, `docker compose version`, and `docker inspect --format '{{.Config.Image}}'` for both containers in `docs/evidence/versions.txt`. Change each `docs/demo-guide.md` checkbox to checked only when its evidence exists; if any check fails, leave it unchecked and add the exact command, timestamp and observed error below it.

- [x] **Step 6: Final regression and repository audit**

Run:

```powershell
npm.cmd test
docker compose ps
git status --short
rg -n "TB[D]|TO[D]O|待[补]充|稍后[补]充" README.md docs src public
```

Expected: tests pass, both containers are healthy, only intended evidence/demo-guide changes are uncommitted, and the placeholder scan returns no matches.

- [x] **Step 7: Commit verified evidence**

```bash
git add docs/demo-guide.md docs/evidence
git commit -m "test: record onlyoffice word and excel demo"
```

---

## Final Acceptance Checklist

- [x] `npm test` passes from a clean `npm ci` install.
- [x] `docker compose config --quiet` passes.
- [x] `app` and `document-server` report healthy.
- [x] Word create/edit/save/reopen/download/delete succeeds.
- [x] Excel create/edit/formula/save/reopen/download/delete succeeds.
- [x] Uploaded `.docx` and `.xlsx` can be edited and saved.
- [x] Invalid type, oversized upload, invalid JWT and untrusted callback URL are rejected.
- [x] Linux deployment guide contains executable Ubuntu 22.04/24.04 commands, HTTPS proxy, backup and rollback.
- [x] Backend installation guide matches the actual environment variables and nine REST endpoints.
- [x] Frontend library guide documents every exported member and event.
- [x] Research report uses official sources and states the 2026-07-14 research date.
- [x] Evidence files contain actual outputs/screenshots and no invented success claims.
