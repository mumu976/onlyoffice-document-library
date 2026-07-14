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
