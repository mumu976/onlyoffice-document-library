import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { CallbackService } from "../src/services/callback-service.js";
import { ActiveFileRegistry } from "../src/services/active-file-registry.js";
import { KeyedMutex } from "../src/services/keyed-mutex.js";

const fileId = "11111111-1111-4111-8111-111111111111";
const jwtSecret = "12345678901234567890123456789012";
const documentServerInternalUrl = "http://document-server";
const maxFileBytes = 32;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createRegistrySpy({ active = false } = {}) {
  const registry = new ActiveFileRegistry();
  if (active) registry.markActive(fileId);
  const calls = { markActive: [], markInactive: [] };
  return {
    calls,
    registry: {
      markActive(id) {
        calls.markActive.push(id);
        registry.markActive(id);
      },
      markInactive(id) {
        calls.markInactive.push(id);
        registry.markInactive(id);
      },
      isActive(id) {
        return registry.isActive(id);
      },
    },
  };
}

function createFixture(options = {}) {
  const replacements = [];
  const repository = options.repository ?? {
    async replaceContent(id, buffer) {
      replacements.push({ id, buffer });
    },
  };
  const registrySpy = createRegistrySpy(options.registry);
  const fetchCalls = [];
  const fetchImpl = options.fetchImpl ?? (async (url, init) => {
    fetchCalls.push({ url, init });
    const buffer = Buffer.from("saved document");
    return new Response(buffer, {
      status: 200,
      headers: { "content-length": String(buffer.length) },
    });
  });
  const logEntries = [];
  const service = new CallbackService({
    repository,
    registry: registrySpy.registry,
    mutex: options.mutex ?? new KeyedMutex(),
    jwtSecret,
    documentServerInternalUrl,
    maxFileBytes: options.maxFileBytes ?? maxFileBytes,
    fetchImpl,
    logger: { error: (entry) => logEntries.push(entry) },
  });
  return {
    service,
    registry: registrySpy.registry,
    registryCalls: registrySpy.calls,
    replacements,
    fetchCalls,
    logEntries,
  };
}

function callbackBody(status, overrides = {}) {
  return {
    status,
    key: `${fileId}-7`,
    ...(status === 2 || status === 6
      ? { url: "http://document-server/cache/file.docx?download=secret-query" }
      : {}),
    ...overrides,
  };
}

function authorizationFor(body, signedOverrides = {}) {
  const token = jwt.sign(
    { payload: { ...body, token: undefined, ...signedOverrides } },
    jwtSecret,
    { algorithm: "HS256" },
  );
  return { authorization: `Bearer ${token}`, token };
}

async function handle(service, body, signedOverrides) {
  const { authorization } = authorizationFor(body, signedOverrides);
  return service.handle({ fileId, body, authorization });
}

test("status 1 marks the file active without fetching", async () => {
  const fixture = createFixture();
  const body = callbackBody(1);

  assert.deepEqual(await handle(fixture.service, body), { error: 0 });
  assert.deepEqual(fixture.registryCalls.markActive, [fileId]);
  assert.deepEqual(fixture.registryCalls.markInactive, []);
  assert.equal(fixture.registry.isActive(fileId), true);
  assert.deepEqual(fixture.fetchCalls, []);
  assert.deepEqual(fixture.replacements, []);
});

test("status 4 marks the file inactive", async () => {
  const fixture = createFixture({ registry: { active: true } });
  const body = callbackBody(4);

  assert.deepEqual(await handle(fixture.service, body), { error: 0 });
  assert.deepEqual(fixture.registryCalls.markActive, []);
  assert.deepEqual(fixture.registryCalls.markInactive, [fileId]);
  assert.equal(fixture.registry.isActive(fileId), false);
  assert.deepEqual(fixture.fetchCalls, []);
});

test("status 2 downloads from the trusted origin, replaces content, then marks inactive", async () => {
  const fixture = createFixture({ registry: { active: true } });
  const body = callbackBody(2);

  assert.deepEqual(await handle(fixture.service, body), { error: 0 });
  assert.equal(fixture.fetchCalls.length, 1);
  assert.equal(fixture.fetchCalls[0].url, body.url);
  assert.equal(fixture.fetchCalls[0].init.signal instanceof AbortSignal, true);
  assert.deepEqual(fixture.replacements, [
    { id: fileId, buffer: Buffer.from("saved document") },
  ]);
  assert.deepEqual(fixture.registryCalls.markInactive, [fileId]);
  assert.equal(fixture.registry.isActive(fileId), false);
});

test("status 6 saves content while keeping the file active", async () => {
  const fixture = createFixture({ registry: { active: true } });
  const body = callbackBody(6);

  assert.deepEqual(await handle(fixture.service, body), { error: 0 });
  assert.equal(fixture.fetchCalls.length, 1);
  assert.deepEqual(fixture.replacements, [
    { id: fileId, buffer: Buffer.from("saved document") },
  ]);
  assert.deepEqual(fixture.registryCalls.markActive, []);
  assert.deepEqual(fixture.registryCalls.markInactive, []);
  assert.equal(fixture.registry.isActive(fileId), true);
});

test("missing or invalid tokens fail closed without writing", async (t) => {
  await t.test("missing token", async () => {
    const fixture = createFixture();
    const body = callbackBody(2);

    assert.deepEqual(
      await fixture.service.handle({ fileId, body, authorization: undefined }),
      { error: 1 },
    );
    assert.deepEqual(fixture.fetchCalls, []);
    assert.deepEqual(fixture.replacements, []);
  });

  await t.test("invalid token", async () => {
    const fixture = createFixture();
    const body = callbackBody(2, { token: "invalid-body-token" });

    assert.deepEqual(
      await fixture.service.handle({
        fileId,
        body,
        authorization: "Bearer invalid-authorization-token",
      }),
      { error: 1 },
    );
    assert.deepEqual(fixture.fetchCalls, []);
    assert.deepEqual(fixture.replacements, []);
    const serializedLogs = JSON.stringify(fixture.logEntries);
    assert.equal(serializedLogs.includes("invalid-authorization-token"), false);
    assert.equal(serializedLogs.includes("invalid-body-token"), false);
    assert.equal(serializedLogs.includes("secret-query"), false);
  });
});

test("signed status, key, and URL must exactly match the callback body", async (t) => {
  const mismatches = [
    ["status", { status: 6 }],
    ["key", { key: `${fileId}-8` }],
    ["url", { url: "http://document-server/cache/other.docx" }],
  ];

  for (const [name, signedOverrides] of mismatches) {
    await t.test(name, async () => {
      const fixture = createFixture();
      const body = callbackBody(2);

      assert.deepEqual(
        await handle(fixture.service, body, signedOverrides),
        { error: 1 },
      );
      assert.deepEqual(fixture.fetchCalls, []);
      assert.deepEqual(fixture.replacements, []);
      assert.deepEqual(fixture.registryCalls.markInactive, []);
    });
  }
});

test("rejects a key that does not belong to the callback file", async () => {
  const fixture = createFixture();
  const body = callbackBody(2, { key: "22222222-2222-4222-8222-222222222222-7" });

  assert.deepEqual(await handle(fixture.service, body), { error: 1 });
  assert.deepEqual(fixture.fetchCalls, []);
  assert.deepEqual(fixture.replacements, []);
});

test("rejects an untrusted download origin without fetching or leaking its query", async () => {
  const fixture = createFixture();
  const body = callbackBody(2, {
    url: "https://attacker.example/file.docx?credential=secret-query",
  });
  const { authorization, token } = authorizationFor(body);

  assert.deepEqual(
    await fixture.service.handle({ fileId, body, authorization }),
    { error: 1 },
  );
  assert.deepEqual(fixture.fetchCalls, []);
  assert.deepEqual(fixture.replacements, []);
  const serializedLogs = JSON.stringify(fixture.logEntries);
  assert.equal(serializedLogs.includes(token), false);
  assert.equal(serializedLogs.includes("secret-query"), false);
});

test("rejects a streamed body over maxFileBytes without replacing content", async () => {
  const oversized = Buffer.alloc(maxFileBytes + 1, 7);
  const fixture = createFixture({
    fetchImpl: async () => new Response(oversized, {
      status: 200,
      headers: { "content-length": "1" },
    }),
  });
  const body = callbackBody(2);

  assert.deepEqual(await handle(fixture.service, body), { error: 1 });
  assert.deepEqual(fixture.replacements, []);
  assert.deepEqual(fixture.registryCalls.markInactive, []);
});

test("serializes two status 6 saves for the same file through the keyed mutex", async () => {
  const firstEntered = deferred();
  const releaseFirst = deferred();
  let inFlight = 0;
  let maximumInFlight = 0;
  let replacements = 0;
  const repository = {
    async replaceContent() {
      replacements += 1;
      inFlight += 1;
      maximumInFlight = Math.max(maximumInFlight, inFlight);
      if (replacements === 1) {
        firstEntered.resolve();
        await releaseFirst.promise;
      }
      inFlight -= 1;
    },
  };
  const fixture = createFixture({ repository, registry: { active: true } });
  const body = callbackBody(6);

  const first = handle(fixture.service, body);
  await firstEntered.promise;
  const second = handle(fixture.service, body);
  await Promise.resolve();

  assert.equal(replacements, 1);
  assert.equal(maximumInFlight, 1);
  releaseFirst.resolve();
  assert.deepEqual(await Promise.all([first, second]), [
    { error: 0 },
    { error: 0 },
  ]);
  assert.equal(replacements, 2);
  assert.equal(maximumInFlight, 1);
  assert.equal(fixture.registry.isActive(fileId), true);
});
