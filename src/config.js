import path from "node:path";
import { AppError } from "./errors.js";

function invalidConfig(message) {
  throw new AppError("INVALID_CONFIG", message, 500);
}

function positiveInteger(name, value, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    invalidConfig(`${name} must be a positive integer`);
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
    invalidConfig(`${name} must be a valid HTTP or HTTPS URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    invalidConfig(`${name} must use the http: or https: protocol`);
  }

  return withoutTrailingSlash(url.toString());
}

export function loadConfig(env = process.env, cwd = process.cwd()) {
  const jwtSecret = env.JWT_SECRET;
  if (typeof jwtSecret !== "string" || jwtSecret.length < 32) {
    invalidConfig("JWT_SECRET must contain at least 32 characters");
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
