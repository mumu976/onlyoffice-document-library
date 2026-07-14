import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { connect, createServer as createNetServer } from "node:net";
import request from "supertest";
import { createApp } from "../src/app.js";
import { startServer } from "../src/server.js";
import { FileRepository } from "../src/repositories/file-repository.js";
import { ActiveFileRegistry } from "../src/services/active-file-registry.js";
import { EditorConfigService } from "../src/services/editor-config-service.js";
import { sha256 } from "../src/services/ooxml.js";

const fileId = "11111111-1111-4111-8111-111111111111";
const unknownId = "99999999-9999-4999-8999-999999999999";
const jwtSecret = "12345678901234567890123456789012";
const maxFileBytes = 20 * 1024 * 1024;
const maxUncompressedBytes = 100 * 1024 * 1024;
const docxMime =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const xlsxMime =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const templateUrls = {
  docx: new URL("../templates/blank.docx", import.meta.url),
  xlsx: new URL("../templates/blank.xlsx", import.meta.url),
};

function parseBinary(response, callback) {
  const chunks = [];
  response.on("data", (chunk) => chunks.push(chunk));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
}

async function reservePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function prepareServerFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "onlyoffice-server-"));
  const templateDir = path.join(root, "templates");
  await mkdir(templateDir);
  await Promise.all([
    copyFile(templateUrls.docx, path.join(templateDir, "blank.docx")),
    copyFile(templateUrls.xlsx, path.join(templateDir, "blank.xlsx")),
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));
  const port = await reservePort();
  const processObject = new EventEmitter();
  const env = {
    PORT: String(port),
    STORAGE_DIR: "./storage",
    TEMPLATE_DIR: "./templates",
    DOCUMENT_SERVER_PUBLIC_URL: "http://localhost:8080",
    DOCUMENT_SERVER_INTERNAL_URL: "http://document-server",
    APP_INTERNAL_URL: `http://app:${port}`,
    JWT_SECRET: jwtSecret,
    MAX_FILE_BYTES: String(maxFileBytes),
    MAX_UNCOMPRESSED_BYTES: String(maxUncompressedBytes),
  };
  const logger = { info() {}, error() {} };
  return { env, cwd: root, logger, processObject, port };
}

async function createServerFixture(t) {
  const options = await prepareServerFixture(t);
  const started = await startServer(options);
  t.after(() => started.close());
  return { ...started, port: options.port, processObject: options.processObject };
}

async function canConnect(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function expectedMetadata(name, extension, buffer) {
  return {
    id: fileId,
    name: `${name}.${extension}`,
    extension,
    createdAt: "2026-07-14T08:00:00.000Z",
    updatedAt: "2026-07-14T08:00:00.000Z",
    revision: 1,
    sha256: sha256(buffer),
  };
}

async function createFixture(t, overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "onlyoffice-api-"));
  const storageDir = path.join(root, "storage");
  const templateDir = path.join(root, "templates");
  await mkdir(templateDir);
  await Promise.all([
    copyFile(templateUrls.docx, path.join(templateDir, "blank.docx")),
    copyFile(templateUrls.xlsx, path.join(templateDir, "blank.xlsx")),
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));

  const repository = new FileRepository({
    storageDir,
    templateDir,
    now: () => new Date("2026-07-14T08:00:00.000Z"),
    idFactory: () => fileId,
    maxUncompressedBytes,
  });
  await repository.init();

  const activeFiles = new ActiveFileRegistry();
  const editorConfigService = new EditorConfigService({
    appInternalUrl: "http://app:3000",
    jwtSecret,
  });
  const callbackCalls = [];
  const callbackService = {
    async handle(callbackRequest) {
      callbackCalls.push(callbackRequest);
      return { error: 0 };
    },
  };
  const logs = { info: [], error: [] };
  const logger = {
    info(entry) {
      logs.info.push(entry);
    },
    error(entry) {
      logs.error.push(entry);
    },
  };
  const config = {
    documentServerPublicUrl: "http://localhost:8080",
    maxFileBytes,
  };
  const dependencies = {
    config,
    repository,
    editorConfigService,
    activeFiles,
    callbackService,
    logger,
    ...overrides,
  };

  return {
    app: createApp(dependencies),
    repository,
    activeFiles,
    callbackCalls,
    logs,
  };
}

test("exposes health, public config, and the complete file CRUD API", async (t) => {
  const { app } = await createFixture(t);
  const blankDocx = await readFile(templateUrls.docx);

  await request(app).get("/health").expect(200, { data: { status: "ok" } });
  await request(app).get("/api/config").expect(200, {
    data: {
      documentServerUrl: "http://localhost:8080",
      maxFileBytes,
      supportedExtensions: ["docx", "xlsx"],
    },
  });

  const created = await request(app)
    .post("/api/files")
    .send({ name: "报告", type: "word" })
    .expect(201);
  assert.deepEqual(created.body.data, {
    ...expectedMetadata("报告", "docx", blankDocx),
  });
  assert.match(created.body.data.sha256, /^[a-f0-9]{64}$/);

  await request(app).get("/api/files").expect(200, {
    data: [created.body.data],
  });

  const editorConfig = await request(app)
    .get(`/api/files/${fileId}/editor-config`)
    .expect(200);
  assert.equal(editorConfig.body.data.document.key, `${fileId}-1`);
  assert.equal(
    editorConfig.body.data.document.url,
    `http://app:3000/api/files/${fileId}/content`,
  );
  assert.equal(typeof editorConfig.body.data.token, "string");

  const content = await request(app)
    .get(`/api/files/${fileId}/content`)
    .buffer(true)
    .parse(parseBinary)
    .expect(200)
    .expect("Content-Type", docxMime)
    .expect(
      "Content-Disposition",
      "attachment; filename=\"download.docx\"; filename*=UTF-8''%E6%8A%A5%E5%91%8A.docx",
    );
  assert.deepEqual(content.body, blankDocx);

  await request(app).delete(`/api/files/${fileId}`).expect(204).expect("");
  await request(app).get("/api/files").expect(200, { data: [] });
});

test("serves the document library page and editor wrapper", async (t) => {
  const { app } = await createFixture(t);

  const page = await request(app)
    .get("/")
    .expect("Content-Type", /html/)
    .expect(200);
  assert.match(page.text, /id="file-list"/);
  assert.match(page.text, /id="editor-shell"/);
  assert.match(page.text, /<link\s+rel="stylesheet"\s+href="\/css\/app\.css">/);
  assert.match(
    page.text,
    /<script\s+type="module"\s+src="\/js\/app\.js"><\/script>/,
  );

  await request(app)
    .get("/css/app.css")
    .expect("Content-Type", /css/)
    .expect(200);
  await request(app)
    .get("/js/app.js")
    .expect("Content-Type", /javascript/)
    .expect(200);
  await request(app)
    .get("/js/onlyoffice-editor.js")
    .expect("Content-Type", /javascript/)
    .expect(200);
});

test("uploads only the multipart field named file", async (t) => {
  const { app } = await createFixture(t);
  const docx = await readFile(templateUrls.docx);

  const uploaded = await request(app)
    .post("/api/files/upload")
    .attach("file", docx, { filename: "上传报告.docx", contentType: docxMime })
    .expect(201);
  assert.equal(uploaded.body.data.name, "上传报告.docx");
  assert.equal(uploaded.body.data.extension, "docx");
});

test("rejects a multipart file under any field other than file", async (t) => {
  const { app } = await createFixture(t);
  const docx = await readFile(templateUrls.docx);

  await request(app)
    .post("/api/files/upload")
    .attach("document", docx, { filename: "报告.docx", contentType: docxMime })
    .expect(400, {
      error: { code: "INVALID_MULTIPART", message: "上传表单格式无效" },
    });
});

test("requires one uploaded file", async (t) => {
  const { app } = await createFixture(t);

  await request(app).post("/api/files/upload").expect(400, {
    error: { code: "FILE_REQUIRED", message: "请选择要上传的文件" },
  });
});

test("rejects unsupported upload extensions before OOXML parsing", async (t) => {
  const { app } = await createFixture(t);
  const docx = await readFile(templateUrls.docx);

  await request(app)
    .post("/api/files/upload")
    .attach("file", docx, {
      filename: "报告.pdf",
      contentType: "application/octet-stream",
    })
    .expect(400, {
      error: {
        code: "UNSUPPORTED_FILE_TYPE",
        message: "仅支持 .docx 和 .xlsx 文件",
      },
    });
});

test("requires MIME to match the uploaded extension", async (t) => {
  const { app } = await createFixture(t);
  const docx = await readFile(templateUrls.docx);

  await request(app)
    .post("/api/files/upload")
    .attach("file", docx, { filename: "报告.docx", contentType: xlsxMime })
    .expect(400, {
      error: {
        code: "INVALID_MIME_TYPE",
        message: "文件 MIME 类型与扩展名不匹配",
      },
    });
});

test("uses OOXML structure as the authoritative check after MIME validation", async (t) => {
  const { app } = await createFixture(t);
  const xlsx = await readFile(templateUrls.xlsx);

  await request(app)
    .post("/api/files/upload")
    .attach("file", xlsx, { filename: "伪装.docx", contentType: docxMime })
    .expect(400, {
      error: { code: "INVALID_OOXML", message: "文件不是有效的 OOXML 文档" },
    });
});

test("accepts octet-stream only when OOXML validation succeeds", async (t) => {
  const { app } = await createFixture(t);
  const xlsx = await readFile(templateUrls.xlsx);

  const uploaded = await request(app)
    .post("/api/files/upload")
    .attach("file", xlsx, {
      filename: "预算.xlsx",
      contentType: "application/octet-stream",
    })
    .expect(201);
  assert.equal(uploaded.body.data.extension, "xlsx");
});

test("rejects invalid create types with the repository AppError envelope", async (t) => {
  const { app } = await createFixture(t);

  await request(app)
    .post("/api/files")
    .send({ name: "报告", type: "presentation" })
    .expect(400, {
      error: {
        code: "UNSUPPORTED_FILE_TYPE",
        message: "仅支持 .docx 和 .xlsx 文件",
      },
    });
});

test("rejects uploads larger than 20 MiB before OOXML parsing", async (t) => {
  const { app } = await createFixture(t);

  await request(app)
    .post("/api/files/upload")
    .attach("file", Buffer.alloc(maxFileBytes + 1), {
      filename: "过大.docx",
      contentType: docxMime,
    })
    .expect(413, {
      error: { code: "FILE_TOO_LARGE", message: "文件超过大小限制" },
    });
});

test("returns a stable not-found envelope for unknown file IDs", async (t) => {
  const { app } = await createFixture(t);

  await request(app).get(`/api/files/${unknownId}/content`).expect(404, {
    error: { code: "FILE_NOT_FOUND", message: "文件不存在" },
  });
});

test("does not delete a file while it is active", async (t) => {
  const { app, repository, activeFiles } = await createFixture(t);
  await repository.create({ name: "正在编辑", type: "word" });
  activeFiles.markActive(fileId);

  await request(app).delete(`/api/files/${fileId}`).expect(409, {
    error: { code: "FILE_ACTIVE", message: "文件正在编辑，无法删除" },
  });
  assert.equal((await repository.get(fileId)).id, fileId);
});

test("forwards callback body, file ID, and Authorization and always responds 200", async (t) => {
  const { app, callbackCalls } = await createFixture(t);
  const body = { status: 1, key: `${fileId}-1`, token: "body-token" };

  await request(app)
    .post(`/api/onlyoffice/callback/${fileId}`)
    .set("Authorization", "Bearer header-token")
    .send(body)
    .expect(200, { error: 0 });
  assert.deepEqual(callbackCalls, [
    { fileId, body, authorization: "Bearer header-token" },
  ]);
});

test("classifies malformed JSON separately from application errors", async (t) => {
  const { app } = await createFixture(t);

  await request(app)
    .post("/api/files")
    .set("Content-Type", "application/json")
    .send('{"name":')
    .expect(400, {
      error: { code: "INVALID_JSON", message: "JSON 请求体格式无效" },
    });
});

test("maps unknown API paths to the stable API error envelope", async (t) => {
  const { app } = await createFixture(t);

  await request(app).get("/api/unknown").expect(404, {
    error: { code: "API_NOT_FOUND", message: "接口不存在" },
  });
});

test("hides unknown error details and logs only safe request fields", async (t) => {
  const logs = { info: [], error: [] };
  const logger = {
    info(entry) {
      logs.info.push(entry);
    },
    error(entry) {
      logs.error.push(entry);
    },
  };
  const repository = {
    async list() {
      throw new Error("storage path C:\\secret and token=classified");
    },
  };
  const { app } = await createFixture(t, { repository, logger });

  await request(app).get("/api/files").expect(500, {
    error: { code: "INTERNAL_ERROR", message: "服务器内部错误" },
  });
  assert.equal(logs.error.length, 1);
  assert.deepEqual(Object.keys(logs.error[0]).sort(), [
    "event",
    "fileId",
    "level",
    "message",
    "method",
    "path",
  ]);
  assert.equal(JSON.stringify(logs.error).includes("classified"), false);
  assert.equal(JSON.stringify(logs.error).includes("C:\\secret"), false);
});

test("applies CSP for the Document Server origin and emits safe request logs", async (t) => {
  const { app, logs } = await createFixture(t);

  const response = await request(app).get("/health").expect(200);
  assert.match(response.headers["content-security-policy"], /script-src[^;]*http:\/\/localhost:8080/);
  assert.match(response.headers["content-security-policy"], /frame-src[^;]*http:\/\/localhost:8080/);
  assert.match(response.headers["content-security-policy"], /connect-src[^;]*http:\/\/localhost:8080/);
  assert.equal(response.headers["cross-origin-embedder-policy"], undefined);
  assert.equal(logs.info.length, 1);
  assert.deepEqual(Object.keys(logs.info[0]).sort(), [
    "event",
    "fileId",
    "level",
    "method",
    "path",
    "statusCode",
    "timestamp",
  ]);
  assert.equal(logs.info[0].statusCode, 200);
});

test("closes the HTTP server when the registered process receives SIGTERM", async (t) => {
  const { server, close, processObject } = await createServerFixture(t);

  const closedBySignal = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 500);
    server.once("close", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  processObject.emit("SIGTERM");
  const didClose = await closedBySignal;
  if (!didClose) await close();

  assert.equal(didClose, true);
  assert.equal(server.listening, false);
});

test("waits for repository initialization before listening", async (t) => {
  const options = await prepareServerFixture(t);
  const initEntered = deferred();
  const releaseInit = deferred();
  const originalInit = FileRepository.prototype.init;
  t.mock.method(FileRepository.prototype, "init", async function init() {
    initEntered.resolve();
    await releaseInit.promise;
    return originalInit.call(this);
  });

  const starting = startServer(options);
  await initEntered.promise;
  const connectedBeforeInit = await canConnect(options.port);
  releaseInit.resolve();
  const started = await starting;
  t.after(() => started.close());

  assert.equal(connectedBeforeInit, false);
  assert.equal(started.server.listening, true);
});

test("removes startup-only server error listeners after listening", async (t) => {
  const { server } = await createServerFixture(t);

  assert.equal(server.listenerCount("error"), 0);
});
