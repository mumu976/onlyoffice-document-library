import express from "express";
import multer from "multer";
import { AppError } from "../errors.js";
import { extensionFromName } from "../services/ooxml.js";

const mimeByExtension = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function encodedFileName(name) {
  return encodeURIComponent(name).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function decodeMultipartFileName(name) {
  if (!/[^\u0000-\u007f]/.test(name)) return name;
  const rawBytes = Buffer.from(name, "latin1");
  const decoded = rawBytes.toString("utf8");
  if (decoded.includes("\ufffd")) return name;
  return Buffer.from(decoded, "utf8").equals(rawBytes) ? decoded : name;
}

export function createFilesRouter({
  repository,
  editorConfigService,
  activeFiles,
  maxFileBytes,
}) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileBytes, files: 1, fields: 0 },
  });

  router.get("/", async (_request, response) => {
    response.json({ data: await repository.list() });
  });

  router.post("/", async (request, response) => {
    const metadata = await repository.create(request.body ?? {});
    response.status(201).json({ data: metadata });
  });

  router.post("/upload", upload.single("file"), async (request, response) => {
    if (!request.file) {
      throw new AppError("FILE_REQUIRED", "请选择要上传的文件", 400);
    }

    const originalName = decodeMultipartFileName(request.file.originalname);
    const extension = extensionFromName(originalName);
    const mime = request.file.mimetype.toLowerCase();
    if (mime !== mimeByExtension[extension] && mime !== "application/octet-stream") {
      throw new AppError(
        "INVALID_MIME_TYPE",
        "文件 MIME 类型与扩展名不匹配",
        400,
      );
    }

    const metadata = await repository.upload({
      name: originalName,
      buffer: request.file.buffer,
    });
    response.status(201).json({ data: metadata });
  });

  router.get("/:id/content", async (request, response) => {
    const metadata = await repository.get(request.params.id);
    const content = await repository.readContent(request.params.id);
    response.set({
      "Content-Type": mimeByExtension[metadata.extension],
      "Content-Disposition":
        `attachment; filename="download.${metadata.extension}"; ` +
        `filename*=UTF-8''${encodedFileName(metadata.name)}`,
    });
    response.send(content);
  });

  router.get("/:id/editor-config", async (request, response) => {
    const metadata = await repository.get(request.params.id);
    response.json({ data: editorConfigService.build(metadata) });
  });

  router.delete("/:id", async (request, response) => {
    await repository.get(request.params.id);
    if (activeFiles.isActive(request.params.id)) {
      throw new AppError("FILE_ACTIVE", "文件正在编辑，无法删除", 409);
    }
    await repository.remove(request.params.id);
    response.status(204).end();
  });

  return router;
}
