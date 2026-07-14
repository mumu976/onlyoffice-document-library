import multer from "multer";
import { AppError } from "../errors.js";

const uuidPattern =
  /(?:^|\/)([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|$)/i;

function fileIdFromPath(requestPath) {
  return requestPath.match(uuidPattern)?.[1] ?? null;
}

function sendError(response, status, code, message) {
  response.status(status).json({ error: { code, message } });
}

function logUnknownError(request) {
  const logger = request.app?.locals?.logger ?? console;
  try {
    logger.error({
      level: "error",
      event: "request_failed",
      method: request.method,
      path: request.path,
      fileId: fileIdFromPath(request.path),
      message: "Request processing failed",
    });
  } catch {
    // Logging must not replace the stable HTTP error response.
  }
}

export function errorHandler(error, request, response, _next) {
  if (error instanceof AppError) {
    sendError(response, error.status, error.code, error.message);
    return;
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      sendError(response, 413, "FILE_TOO_LARGE", "文件超过大小限制");
      return;
    }
    sendError(response, 400, "INVALID_MULTIPART", "上传表单格式无效");
    return;
  }

  if (
    error instanceof SyntaxError &&
    error.status === 400 &&
    error.type === "entity.parse.failed"
  ) {
    sendError(response, 400, "INVALID_JSON", "JSON 请求体格式无效");
    return;
  }

  logUnknownError(request);
  sendError(response, 500, "INTERNAL_ERROR", "服务器内部错误");
}
