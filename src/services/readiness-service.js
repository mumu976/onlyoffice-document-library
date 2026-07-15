export class ReadinessService {
  constructor({
    repository,
    documentServerInternalUrl,
    fetchImpl = globalThis.fetch,
  }) {
    this.repository = repository;
    this.documentServerHealthUrl = new URL(
      "/healthcheck",
      documentServerInternalUrl,
    ).href;
    this.fetchImpl = fetchImpl;
  }

  async check() {
    await this.repository.list();
    const response = await this.fetchImpl(this.documentServerHealthUrl, {
      signal: AbortSignal.timeout(5_000),
      redirect: "error",
    });
    if (!response.ok) {
      throw new Error("Document Server 尚未就绪");
    }
  }
}
