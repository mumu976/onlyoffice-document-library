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
    error =>
      error.code === "INVALID_CONFIG" &&
      error.status === 500 &&
      /JWT_SECRET/.test(error.message) &&
      /至少 32 个字符/.test(error.message)
  );
});

test("loadConfig rejects invalid positive integers and URL protocols", () => {
  assert.throws(
    () => loadConfig({ ...valid, PORT: "0" }),
    error =>
      error.code === "INVALID_CONFIG" &&
      error.status === 500 &&
      /PORT/.test(error.message) &&
      /必须为正整数/.test(error.message)
  );
  assert.throws(
    () => loadConfig({ ...valid, DOCUMENT_SERVER_PUBLIC_URL: "ftp://docs" }),
    error =>
      error.code === "INVALID_CONFIG" &&
      error.status === 500 &&
      /DOCUMENT_SERVER_PUBLIC_URL/.test(error.message) &&
      /仅支持 http: 或 https: 协议/.test(error.message)
  );
});

test("loadConfig rejects URL query strings and fragments with Chinese errors", () => {
  for (const [name, value] of [
    ["DOCUMENT_SERVER_PUBLIC_URL", "http://localhost:8080/?base=/"],
    ["DOCUMENT_SERVER_PUBLIC_URL", "http://localhost:8080/?"],
    ["DOCUMENT_SERVER_INTERNAL_URL", "http://document-server/#section/"],
    ["DOCUMENT_SERVER_INTERNAL_URL", "http://document-server/#"],
    ["APP_INTERNAL_URL", "http://app:3000/?mode=edit"]
  ]) {
    assert.throws(
      () => loadConfig({ ...valid, [name]: value }),
      error =>
        error.code === "INVALID_CONFIG" &&
        error.status === 500 &&
        error.message.includes(name) &&
        /不能包含查询参数或片段/.test(error.message)
    );
  }
});

test("loadConfig removes trailing slashes only from URL pathnames", () => {
  const config = loadConfig({
    ...valid,
    DOCUMENT_SERVER_PUBLIC_URL: "http://localhost:8080/base///"
  });

  assert.equal(config.documentServerPublicUrl, "http://localhost:8080/base");
});

test("loadConfig reports malformed URLs in Chinese", () => {
  assert.throws(
    () => loadConfig({ ...valid, APP_INTERNAL_URL: "not-a-url" }),
    error =>
      error.code === "INVALID_CONFIG" &&
      error.status === 500 &&
      /APP_INTERNAL_URL/.test(error.message) &&
      /必须为有效的 HTTP 或 HTTPS URL/.test(error.message)
  );
});
