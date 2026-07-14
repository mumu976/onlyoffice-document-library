import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  extensionFromName,
  normalizeDisplayName,
  validateOoxmlBuffer,
  sha256,
} from "../src/services/ooxml.js";

test("recognizes supported extensions case-insensitively", () => {
  assert.equal(extensionFromName("报告.DOCX"), "docx");
  assert.equal(extensionFromName("数据.xlsx"), "xlsx");
  assert.throws(
    () => extensionFromName("payload.zip"),
    (error) => error.code === "UNSUPPORTED_FILE_TYPE",
  );
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
    (error) => error.code === "INVALID_OOXML",
  );
});
