import jwt from "jsonwebtoken";

const successfulStatuses = new Set([1, 2, 4, 6]);
const saveStatuses = new Set([2, 6]);

export class CallbackService {
  constructor({
    repository,
    registry,
    mutex,
    jwtSecret,
    documentServerInternalUrl,
    maxFileBytes,
    fetchImpl = globalThis.fetch,
    logger = console,
  }) {
    this.repository = repository;
    this.registry = registry;
    this.mutex = mutex;
    this.jwtSecret = jwtSecret;
    this.documentServerOrigin = new URL(documentServerInternalUrl).origin;
    this.maxFileBytes = maxFileBytes;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  async handle({ fileId, body, authorization }) {
    try {
      this.#verifyCallback(fileId, body, authorization);

      if (body.status === 1) {
        this.registry.markActive(fileId);
      } else if (body.status === 4) {
        this.registry.markInactive(fileId);
      } else if (saveStatuses.has(body.status)) {
        await this.mutex.run(fileId, async () => {
          const buffer = await this.#download(body.url);
          await this.repository.replaceContent(fileId, buffer);
          if (body.status === 2) this.registry.markInactive(fileId);
        });
      }

      return { error: 0 };
    } catch {
      this.#logFailure(fileId, body?.status);
      return { error: 1 };
    }
  }

  #verifyCallback(fileId, body, authorization) {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? body.token;
    const claims = jwt.verify(token, this.jwtSecret, { algorithms: ["HS256"] });
    const signed = claims.payload ?? claims;
    if (
      signed.status !== body.status ||
      signed.key !== body.key ||
      (body.url !== undefined && signed.url !== body.url) ||
      !body.key.startsWith(`${fileId}-`) ||
      !successfulStatuses.has(body.status)
    ) {
      throw new Error("callback 签名内容与请求不一致");
    }
  }

  async #download(downloadUrl) {
    const parsedUrl = new URL(downloadUrl);
    if (parsedUrl.origin !== this.documentServerOrigin) {
      throw new Error("callback 下载地址不受信任");
    }

    const response = await this.fetchImpl(downloadUrl, {
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("callback 下载失败");

    const contentLength = response.headers.get("content-length");
    if (contentLength !== null) {
      const declaredBytes = Number(contentLength);
      if (
        !Number.isSafeInteger(declaredBytes) ||
        declaredBytes < 0 ||
        declaredBytes > this.maxFileBytes
      ) {
        throw new Error("callback 文件大小无效");
      }
    }
    if (response.body === null) throw new Error("callback 下载内容为空");

    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of response.body) {
      totalBytes += chunk.byteLength;
      if (totalBytes > this.maxFileBytes) {
        throw new Error("callback 文件超过大小限制");
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks, totalBytes);
  }

  #logFailure(fileId, status) {
    try {
      this.logger.error({
        level: "error",
        event: "onlyoffice_callback_failed",
        fileId,
        status,
        message: "ONLYOFFICE callback processing failed",
      });
    } catch {
      // Callback failures must always produce ONLYOFFICE's error response.
    }
  }
}
