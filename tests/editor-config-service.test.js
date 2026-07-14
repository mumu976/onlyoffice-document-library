import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { EditorConfigService } from "../src/services/editor-config-service.js";
import { ActiveFileRegistry } from "../src/services/active-file-registry.js";
import { KeyedMutex } from "../src/services/keyed-mutex.js";

const id = "11111111-1111-4111-8111-111111111111";
const secret = "12345678901234567890123456789012";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("builds a complete signed Word editor config", () => {
  const metadata = {
    id,
    name: "季度报告.docx",
    extension: "docx",
    revision: 3,
  };
  const service = new EditorConfigService({
    appInternalUrl: "http://app:3000",
    jwtSecret: secret,
  });

  const config = service.build(metadata);

  const unsignedConfig = {
    type: "desktop",
    width: "100%",
    height: "100%",
    documentType: "word",
    document: {
      fileType: "docx",
      key: `${id}-3`,
      title: "季度报告.docx",
      url: `http://app:3000/api/files/${id}/content`,
      permissions: { edit: true, download: true, print: true },
    },
    editorConfig: {
      callbackUrl: `http://app:3000/api/onlyoffice/callback/${id}`,
      lang: "zh-CN",
      mode: "edit",
      user: { id: "demo-user", name: "演示用户" },
      customization: { forcesave: true },
    },
  };
  assert.deepEqual({ ...config, token: undefined }, {
    ...unsignedConfig,
    token: undefined,
  });
  const decoded = jwt.verify(config.token, secret, { algorithms: ["HS256"] });
  const { iat, ...signedConfig } = decoded;
  assert.equal(typeof iat, "number");
  assert.deepEqual(signedConfig, unsignedConfig);
  assert.equal(jwt.decode(config.token, { complete: true }).header.alg, "HS256");
});

test("uses the spreadsheet document type for Excel files", () => {
  const service = new EditorConfigService({
    appInternalUrl: "http://app:3000",
    jwtSecret: secret,
  });

  const config = service.build({
    id,
    name: "年度预算.xlsx",
    extension: "xlsx",
    revision: 7,
  });

  assert.equal(config.documentType, "cell");
  assert.equal(config.document.fileType, "xlsx");
  assert.equal(config.document.key, `${id}-7`);
});

test("tracks active file IDs synchronously", () => {
  const registry = new ActiveFileRegistry();

  assert.equal(registry.isActive(id), false);
  assert.equal(registry.markActive(id), undefined);
  assert.equal(registry.isActive(id), true);
  assert.equal(registry.markInactive(id), undefined);
  assert.equal(registry.isActive(id), false);
});

test("serializes functions that use the same mutex key", async () => {
  const mutex = new KeyedMutex();
  const firstEntered = deferred();
  const releaseFirst = deferred();
  const events = [];

  const first = mutex.run("shared", async () => {
    events.push("first:start");
    firstEntered.resolve();
    await releaseFirst.promise;
    events.push("first:end");
  });
  await firstEntered.promise;
  const second = mutex.run("shared", async () => {
    events.push("second:start");
    events.push("second:end");
  });

  await Promise.resolve();
  assert.deepEqual(events, ["first:start"]);
  releaseFirst.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, [
    "first:start",
    "first:end",
    "second:start",
    "second:end",
  ]);
});

test("allows functions with different mutex keys to overlap", async () => {
  const mutex = new KeyedMutex();
  const bothEntered = deferred();
  const release = deferred();
  const entered = new Set();

  const operation = (key) => mutex.run(key, async () => {
    entered.add(key);
    if (entered.size === 2) bothEntered.resolve();
    await release.promise;
  });
  const first = operation("one");
  const second = operation("two");

  await bothEntered.promise;
  assert.deepEqual(entered, new Set(["one", "two"]));
  release.resolve();
  await Promise.all([first, second]);
});

test("continues a mutex key after a function rejects", async () => {
  const mutex = new KeyedMutex();
  const failure = new Error("operation failed");

  await assert.rejects(mutex.run("shared", async () => {
    throw failure;
  }), (error) => error === failure);

  assert.equal(await mutex.run("shared", async () => "continued"), "continued");
});
