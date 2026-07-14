import { createHash } from "node:crypto";
import path from "node:path";
import yauzl from "yauzl";
import { AppError } from "../errors.js";

const supportedExtensions = new Set(["docx", "xlsx"]);
const requiredParts = {
  docx: ["[Content_Types].xml", "word/document.xml"],
  xlsx: ["[Content_Types].xml", "xl/workbook.xml"],
};

function unsupportedFileType() {
  return new AppError("UNSUPPORTED_FILE_TYPE", "仅支持 .docx 和 .xlsx 文件", 400);
}

function invalidOoxml() {
  return new AppError("INVALID_OOXML", "文件不是有效的 OOXML 文档", 400);
}

function expectedExtension(extension) {
  if (typeof extension !== "string") {
    throw unsupportedFileType();
  }

  const normalized = extension.toLowerCase();
  if (!supportedExtensions.has(normalized)) {
    throw unsupportedFileType();
  }
  return normalized;
}

function truncateUtf16(value, maxLength) {
  let result = "";
  for (const character of value) {
    if (result.length + character.length > maxLength) break;
    result += character;
  }
  return result;
}

export function extensionFromName(fileName) {
  if (typeof fileName !== "string") {
    throw unsupportedFileType();
  }

  const extension = path.extname(fileName).slice(1).toLowerCase();
  return expectedExtension(extension);
}

export function normalizeDisplayName(displayName, extension) {
  const normalizedExtension = expectedExtension(extension);
  const suffix = `.${normalizedExtension}`;
  let baseName = path.basename(String(displayName ?? ""))
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim();

  while (baseName.toLowerCase().endsWith(suffix)) {
    baseName = baseName.slice(0, -suffix.length).trim();
  }

  if (baseName.length === 0) {
    throw new AppError("INVALID_FILE_NAME", "文件名不能为空", 400);
  }

  const stem = truncateUtf16(baseName, 128 - suffix.length);
  return `${stem}${suffix}`;
}

export async function validateOoxmlBuffer(buffer, extension, maxUncompressedBytes) {
  try {
    const normalizedExtension = expectedExtension(extension);
    const zip = await yauzl.fromBufferPromise(buffer, {
      lazyEntries: true,
      validateEntrySizes: true,
    });
    const entries = new Set();
    let totalUncompressedBytes = 0;

    for await (const entry of zip.eachEntry()) {
      if (entry.uncompressedSize > maxUncompressedBytes - totalUncompressedBytes) {
        throw invalidOoxml();
      }
      totalUncompressedBytes += entry.uncompressedSize;
      entries.add(path.posix.normalize(entry.fileName));
    }

    if (!requiredParts[normalizedExtension].every((part) => entries.has(part))) {
      throw invalidOoxml();
    }
  } catch {
    throw invalidOoxml();
  }
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
