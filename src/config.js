import path from "node:path";
import { AppError } from "./errors.js";

function invalidConfig(message) {
  throw new AppError("INVALID_CONFIG", message, 500);
}

function positiveInteger(name, value, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    invalidConfig(`${name} 必须为正整数`);
  }
  return parsed;
}

function withoutTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function httpUrl(name, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    invalidConfig(`${name} 必须为有效的 HTTP 或 HTTPS URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    invalidConfig(`${name} 仅支持 http: 或 https: 协议`);
  }

  if (url.href.includes("?") || url.href.includes("#")) {
    invalidConfig(`${name} 不能包含查询参数或片段`);
  }

  const pathname = withoutTrailingSlash(url.pathname);
  url.pathname = pathname || "/";
  const normalized = url.toString();
  return pathname ? normalized : normalized.slice(0, -1);
}

export function loadConfig(env = process.env, cwd = process.cwd()) {
  const jwtSecret = env.JWT_SECRET;
  if (typeof jwtSecret !== "string" || jwtSecret.length < 32) {
    invalidConfig("JWT_SECRET 长度至少 32 个字符");
  }

  return {
    port: positiveInteger("PORT", env.PORT, 3000),
    storageDir: path.resolve(cwd, env.STORAGE_DIR ?? "./storage"),
    templateDir: path.resolve(cwd, env.TEMPLATE_DIR ?? "./templates"),
    documentServerPublicUrl: httpUrl(
      "DOCUMENT_SERVER_PUBLIC_URL",
      env.DOCUMENT_SERVER_PUBLIC_URL
    ),
    documentServerInternalUrl: httpUrl(
      "DOCUMENT_SERVER_INTERNAL_URL",
      env.DOCUMENT_SERVER_INTERNAL_URL
    ),
    appInternalUrl: httpUrl("APP_INTERNAL_URL", env.APP_INTERNAL_URL),
    jwtSecret,
    maxFileBytes: positiveInteger("MAX_FILE_BYTES", env.MAX_FILE_BYTES, 20 * 1024 * 1024),
    maxUncompressedBytes: positiveInteger(
      "MAX_UNCOMPRESSED_BYTES",
      env.MAX_UNCOMPRESSED_BYTES,
      100 * 1024 * 1024
    )
  };
}
