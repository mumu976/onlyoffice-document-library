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
    documentServerPublicUrl = documentServerInternalUrl,
    maxFileBytes,
    fetchImpl = globalThis.fetch,
    logger = console,
  }) {
    this.repository = repository;
    this.registry = registry;
    this.mutex = mutex;
    this.jwtSecret = jwtSecret;
    this.documentServerInternalUrl = new URL(documentServerInternalUrl);
    this.documentServerInternalOrigin = this.documentServerInternalUrl.origin;
    this.documentServerPublicOrigin = new URL(documentServerPublicUrl).origin;
    this.maxFileBytes = maxFileBytes;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  async handle(request) {
    let fileId;
    let status;
    try {
      const { fileId: requestFileId, body, authorization } = request ?? {};
      fileId = requestFileId;
      status = body?.status;
      this.#verifyCallback(fileId, body, authorization);

      if (status === 1) {
        if (this.registry.markActive(fileId, body.key) === false) {
          throw new Error("callback 文档版本已过期");
        }
      } else if (status === 4) {
        this.registry.markInactive(fileId, body.key);
      } else if (saveStatuses.has(status)) {
        await this.mutex.run(fileId, async () => {
          if (this.registry.activeKey(fileId) !== body.key) {
            throw new Error("callback 文档版本已过期");
          }
          const buffer = await this.#download(body.url);
          await this.repository.replaceContent(fileId, buffer);
          if (status === 2) this.registry.markInactive(fileId, body.key);
        });
      }

      return { error: 0 };
    } catch {
      this.#logFailure(fileId, status);
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
    let fetchUrl = parsedUrl;
    if (parsedUrl.origin === this.documentServerPublicOrigin) {
      fetchUrl = new URL(parsedUrl);
      fetchUrl.protocol = this.documentServerInternalUrl.protocol;
      fetchUrl.hostname = this.documentServerInternalUrl.hostname;
      fetchUrl.port = this.documentServerInternalUrl.port;
      fetchUrl.username = "";
      fetchUrl.password = "";
    } else if (parsedUrl.origin !== this.documentServerInternalOrigin) {
      throw new Error("callback 下载地址不受信任");
    }

    const response = await this.fetchImpl(fetchUrl.href, {
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
        status:
          Number.isInteger(status) && successfulStatuses.has(status)
            ? status
            : "invalid",
        message: "ONLYOFFICE callback processing failed",
      });
    } catch {
      // Callback failures must always produce ONLYOFFICE's error response.
    }
  }
}
