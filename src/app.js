import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "./errors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createFilesRouter } from "./routes/files.js";
import { createGuidesRouter } from "./routes/guides.js";
import { createOnlyOfficeRouter } from "./routes/onlyoffice.js";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
const uuidPattern =
  /(?:^|\/)([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|$)/i;

function requestLogger(logger) {
  return (request, response, next) => {
    response.on("finish", () => {
      try {
        logger.info({
          level: "info",
          event: "request_completed",
          timestamp: new Date().toISOString(),
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          fileId: request.path.match(uuidPattern)?.[1] ?? null,
        });
      } catch {
        // A logger failure must not affect an already completed response.
      }
    });
    next();
  };
}

export function createApp({
  config,
  repository,
  editorConfigService,
  activeFiles,
  callbackService,
  guideService,
  readinessService = { async check() {} },
  logger = console,
}) {
  const app = express();
  const documentServerOrigin = new URL(config.documentServerPublicUrl).origin;
  app.locals.logger = logger;

  app.use(requestLogger(logger));
  app.use(express.json({ limit: "1mb" }));
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          scriptSrc: ["'self'", documentServerOrigin],
          frameSrc: ["'self'", documentServerOrigin],
          connectSrc: ["'self'", documentServerOrigin],
        },
      },
    }),
  );
  app.use(express.static(path.resolve(publicDirectory)));
  app.get(/^\/guides(?:\/[^/]+)?\/?$/, (_request, response) => {
    response.sendFile(path.join(publicDirectory, "guides.html"));
  });

  const livenessHandler = (_request, response) => {
    response.json({ data: { status: "ok" } });
  };
  app.get("/health", livenessHandler);
  app.get("/health/live", livenessHandler);
  app.get("/health/ready", async (_request, response) => {
    try {
      await readinessService.check();
      response.json({ data: { status: "ready" } });
    } catch {
      response.status(503).json({
        error: { code: "SERVICE_NOT_READY", message: "服务尚未就绪" },
      });
    }
  });
  app.get("/api/config", (_request, response) => {
    response.json({
      data: {
        documentServerUrl: config.documentServerPublicUrl,
        maxFileBytes: config.maxFileBytes,
        supportedExtensions: ["docx", "xlsx"],
      },
    });
  });
  app.use(
    "/api/files",
    createFilesRouter({
      repository,
      editorConfigService,
      activeFiles,
      maxFileBytes: config.maxFileBytes,
    }),
  );
  app.use(
    "/api/onlyoffice",
    createOnlyOfficeRouter({ callbackService }),
  );
  app.use("/api/guides", createGuidesRouter({ guideService }));
  app.use("/api", (_request, _response, next) => {
    next(new AppError("API_NOT_FOUND", "接口不存在", 404));
  });
  app.use(errorHandler);

  return app;
}
