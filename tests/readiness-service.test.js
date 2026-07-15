import test from "node:test";
import assert from "node:assert/strict";
import { ReadinessService } from "../src/services/readiness-service.js";

test("checks repository access and the internal Document Server health endpoint", async () => {
  let repositoryChecks = 0;
  const fetchCalls = [];
  const service = new ReadinessService({
    repository: {
      async list() {
        repositoryChecks += 1;
        return [];
      },
    },
    documentServerInternalUrl: "http://document-server/base",
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      return new Response("true", { status: 200 });
    },
  });

  await service.check();

  assert.equal(repositoryChecks, 1);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "http://document-server/healthcheck");
  assert.equal(fetchCalls[0].init.signal instanceof AbortSignal, true);
  assert.equal(fetchCalls[0].init.redirect, "error");
});

test("rejects a non-success Document Server health response without exposing its body", async () => {
  const service = new ReadinessService({
    repository: { async list() { return []; } },
    documentServerInternalUrl: "http://document-server",
    fetchImpl: async () => new Response("internal upstream secret", { status: 503 }),
  });

  await assert.rejects(
    service.check(),
    (error) =>
      error.message === "Document Server 尚未就绪" &&
      !error.message.includes("internal upstream secret"),
  );
});
