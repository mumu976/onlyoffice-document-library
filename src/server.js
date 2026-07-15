import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { FileRepository } from "./repositories/file-repository.js";
import { ActiveFileRegistry } from "./services/active-file-registry.js";
import { CallbackService } from "./services/callback-service.js";
import { EditorConfigService } from "./services/editor-config-service.js";
import { createGuideService } from "./services/guide-service.js";
import { KeyedMutex } from "./services/keyed-mutex.js";
import { ReadinessService } from "./services/readiness-service.js";

function listen(app, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, "0.0.0.0");
    const onListening = () => {
      server.off("error", onError);
      resolve(server);
    };
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    server.once("listening", onListening);
    server.once("error", onError);
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function startServer({
  env = process.env,
  cwd = process.cwd(),
  logger = console,
  processObject = process,
} = {}) {
  const config = loadConfig(env, cwd);
  const repository = new FileRepository({
    storageDir: config.storageDir,
    templateDir: config.templateDir,
    now: Date.now,
    idFactory: randomUUID,
    maxUncompressedBytes: config.maxUncompressedBytes,
  });
  const activeFiles = new ActiveFileRegistry();
  const mutex = new KeyedMutex();
  const editorConfigService = new EditorConfigService({
    appInternalUrl: config.appInternalUrl,
    jwtSecret: config.jwtSecret,
  });
  const callbackService = new CallbackService({
    repository,
    registry: activeFiles,
    mutex,
    jwtSecret: config.jwtSecret,
    documentServerInternalUrl: config.documentServerInternalUrl,
    documentServerPublicUrl: config.documentServerPublicUrl,
    maxFileBytes: config.maxFileBytes,
    logger,
  });
  const guideService = createGuideService({
    docsDir: path.resolve(cwd, "docs"),
  });

  await repository.init();
  const readinessService = new ReadinessService({
    repository,
    documentServerInternalUrl: config.documentServerInternalUrl,
  });
  const app = createApp({
    config,
    repository,
    editorConfigService,
    activeFiles,
    callbackService,
    guideService,
    readinessService,
    logger,
  });
  const server = await listen(app, config.port);
  let closing;
  const signalHandlers = new Map();
  const removeSignalHandlers = () => {
    for (const [signal, handler] of signalHandlers) {
      processObject.off(signal, handler);
    }
    signalHandlers.clear();
  };
  const close = () => {
    closing ??= closeServer(server).finally(removeSignalHandlers);
    return closing;
  };

  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => {
      close().catch(() => {
        processObject.exitCode = 1;
      });
    };
    signalHandlers.set(signal, handler);
    processObject.once(signal, handler);
  }

  try {
    logger.info({
      level: "info",
      event: "server_started",
      host: "0.0.0.0",
      port: config.port,
      message: "ONLYOFFICE document library server started",
    });
  } catch {
    // Startup is independent of the configured logger.
  }

  return { app, server, close };
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    await startServer();
  } catch {
    console.error("ONLYOFFICE document library server failed to start");
    process.exitCode = 1;
  }
}
