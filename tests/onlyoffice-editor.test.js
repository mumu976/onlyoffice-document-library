import test from "node:test";
import assert from "node:assert/strict";
import {
  loadOnlyOfficeApi,
  OnlyOfficeEditor
} from "../public/js/onlyoffice-editor.js";

function createScriptWindow() {
  const scripts = [];
  const windowObject = {
    CustomEvent,
    document: {
      createElement(tagName) {
        assert.equal(tagName, "script");
        return {};
      },
      head: {
        appendChild(script) {
          scripts.push(script);
        }
      }
    }
  };

  return { scripts, windowObject };
}

function createEditorHarness() {
  const captured = [];
  let destroyCalls = 0;

  class FakeDocEditor {
    constructor(containerId, config) {
      captured.push({ containerId, config });
    }

    destroyEditor() {
      destroyCalls += 1;
    }
  }

  const windowObject = { CustomEvent };
  const loaderCalls = [];
  const apiLoader = async (documentServerUrl, receivedWindow) => {
    loaderCalls.push({ documentServerUrl, windowObject: receivedWindow });
    return { DocEditor: FakeDocEditor };
  };
  const editor = new OnlyOfficeEditor({
    containerId: "editor",
    documentServerUrl: "http://localhost:8080",
    apiLoader,
    windowObject
  });

  return {
    captured,
    editor,
    get destroyCalls() {
      return destroyCalls;
    },
    loaderCalls,
    windowObject
  };
}

function createDeferred() {
  let reject;
  let resolve;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
}

test("loadOnlyOfficeApi normalizes the Document Server script URL", async () => {
  const { scripts, windowObject } = createScriptWindow();
  const loading = loadOnlyOfficeApi("http://localhost:8180///", windowObject);

  assert.equal(scripts.length, 1);
  assert.equal(
    scripts[0].src,
    "http://localhost:8180/web-apps/apps/api/documents/api.js"
  );
  assert.equal(scripts[0].async, true);

  windowObject.DocsAPI = { DocEditor: class {} };
  scripts[0].onload();
  assert.strictEqual(await loading, windowObject.DocsAPI);
});

test("concurrent loads of the same script URL share one Promise", async () => {
  const { scripts, windowObject } = createScriptWindow();
  const first = loadOnlyOfficeApi("http://localhost:8181", windowObject);
  const second = loadOnlyOfficeApi("http://localhost:8181/", windowObject);

  assert.strictEqual(second, first);
  assert.equal(scripts.length, 1);

  windowObject.DocsAPI = { DocEditor: class {} };
  scripts[0].onload();
  assert.strictEqual(await first, windowObject.DocsAPI);
});

test("a failed script load reports the stable error and can be retried", async () => {
  const { scripts, windowObject } = createScriptWindow();
  const first = loadOnlyOfficeApi("http://localhost:8182", windowObject);

  scripts[0].onerror();
  await assert.rejects(first, {
    name: "Error",
    message: "ONLYOFFICE API 加载失败"
  });

  const retry = loadOnlyOfficeApi("http://localhost:8182/", windowObject);
  assert.notStrictEqual(retry, first);
  assert.equal(scripts.length, 2);

  windowObject.DocsAPI = { DocEditor: class {} };
  scripts[1].onload();
  assert.strictEqual(await retry, windowObject.DocsAPI);
});

test("open creates an editor and ready events expose the wrapper lifecycle", async () => {
  const harness = createEditorHarness();
  const events = [];
  harness.editor.addEventListener("ready", event => events.push(event.type));
  harness.editor.addEventListener("document-ready", event =>
    events.push(event.type)
  );

  await harness.editor.open({ document: { key: "revision-1" } });

  assert.equal(harness.editor.isOpen, true);
  assert.deepEqual(harness.loaderCalls, [
    {
      documentServerUrl: "http://localhost:8080",
      windowObject: harness.windowObject
    }
  ]);
  assert.equal(harness.captured[0].containerId, "editor");

  harness.captured[0].config.events.onAppReady({ data: "app" });
  harness.captured[0].config.events.onDocumentReady({ data: "document" });
  assert.deepEqual(events, ["ready", "document-ready"]);

  harness.editor.close();
  assert.equal(harness.destroyCalls, 1);
  assert.equal(harness.editor.isOpen, false);
});

test("state and error wrapper events have exact normalized details", async () => {
  const harness = createEditorHarness();
  const details = [];
  harness.editor.addEventListener("state-change", event => {
    details.push({ type: event.type, detail: event.detail });
  });
  harness.editor.addEventListener("error", event => {
    details.push({ type: event.type, detail: event.detail });
  });

  await harness.editor.open({});
  const events = harness.captured[0].config.events;
  events.onDocumentStateChange({ data: true });
  events.onDocumentStateChange({ data: false });
  events.onError({
    data: { errorCode: -4, errorDescription: "下载失败" }
  });

  assert.deepEqual(details, [
    { type: "state-change", detail: { dirty: true } },
    { type: "state-change", detail: { dirty: false } },
    { type: "error", detail: { code: -4, description: "下载失败" } }
  ]);
});

test("backend event handlers run before their corresponding wrapper events", async () => {
  const harness = createEditorHarness();
  const calls = [];
  const backendEvent = { data: true };
  const backendEvents = {
    onAppReady(event) {
      assert.strictEqual(event, backendEvent);
      calls.push("backend-ready");
    },
    onDocumentReady(event) {
      assert.strictEqual(event, backendEvent);
      calls.push("backend-document-ready");
    },
    onDocumentStateChange(event) {
      assert.strictEqual(event, backendEvent);
      calls.push("backend-state-change");
    },
    onError(event) {
      assert.strictEqual(event, backendEvent);
      calls.push("backend-error");
    },
    onInfo() {
      calls.push("backend-info");
    }
  };
  const config = { events: backendEvents };

  harness.editor.addEventListener("ready", () => calls.push("wrapper-ready"));
  harness.editor.addEventListener("document-ready", () =>
    calls.push("wrapper-document-ready")
  );
  harness.editor.addEventListener("state-change", () =>
    calls.push("wrapper-state-change")
  );
  harness.editor.addEventListener("error", () => calls.push("wrapper-error"));

  await harness.editor.open(config);
  const wrappedEvents = harness.captured[0].config.events;
  wrappedEvents.onAppReady(backendEvent);
  wrappedEvents.onDocumentReady(backendEvent);
  wrappedEvents.onDocumentStateChange(backendEvent);
  wrappedEvents.onError(backendEvent);
  wrappedEvents.onInfo();

  assert.deepEqual(calls, [
    "backend-ready",
    "wrapper-ready",
    "backend-document-ready",
    "wrapper-document-ready",
    "backend-state-change",
    "wrapper-state-change",
    "backend-error",
    "wrapper-error",
    "backend-info"
  ]);
  assert.strictEqual(config.events, backendEvents);
  assert.notStrictEqual(wrappedEvents, backendEvents);
});

test("opening again closes the old instance and close is idempotent", async () => {
  const harness = createEditorHarness();

  await harness.editor.open({ document: { key: "revision-1" } });
  await harness.editor.open({ document: { key: "revision-2" } });

  assert.equal(harness.destroyCalls, 1);
  assert.equal(harness.captured.length, 2);
  assert.equal(harness.editor.isOpen, true);

  harness.editor.close();
  harness.editor.close();
  assert.equal(harness.destroyCalls, 2);
  assert.equal(harness.editor.isOpen, false);
});

test("overlapping opens create only the latest editor without leaking an instance", async () => {
  const captured = [];
  let destroyCalls = 0;
  const firstLoad = createDeferred();
  const secondLoad = createDeferred();
  const pendingLoads = [firstLoad, secondLoad];
  class FakeDocEditor {
    constructor(containerId, config) {
      captured.push({ containerId, config });
    }

    destroyEditor() {
      destroyCalls += 1;
    }
  }
  const editor = new OnlyOfficeEditor({
    containerId: "editor",
    documentServerUrl: "http://localhost:8080",
    apiLoader: () => pendingLoads.shift().promise,
    windowObject: { CustomEvent }
  });

  const firstOpen = editor.open({ document: { key: "revision-1" } });
  const secondOpen = editor.open({ document: { key: "revision-2" } });
  firstLoad.resolve({ DocEditor: FakeDocEditor });
  secondLoad.resolve({ DocEditor: FakeDocEditor });

  assert.deepEqual(await Promise.all([firstOpen, secondOpen]), [
    undefined,
    undefined
  ]);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].containerId, "editor");
  assert.equal(captured[0].config.document.key, "revision-2");
  assert.equal(destroyCalls, 0);
  assert.equal(editor.isOpen, true);
});

test("close cancels an open that is still waiting for the API loader", async () => {
  const captured = [];
  const loading = createDeferred();
  class FakeDocEditor {
    constructor(containerId, config) {
      captured.push({ containerId, config });
    }
  }
  const editor = new OnlyOfficeEditor({
    containerId: "editor",
    documentServerUrl: "http://localhost:8080",
    apiLoader: () => loading.promise,
    windowObject: { CustomEvent }
  });

  const opening = editor.open({ document: { key: "revision-1" } });
  editor.close();
  loading.resolve({ DocEditor: FakeDocEditor });

  assert.equal(await opening, undefined);
  assert.equal(captured.length, 0);
  assert.equal(editor.isOpen, false);
});

test("a cancelled open resolves normally if its loader later rejects", async () => {
  const loading = createDeferred();
  const editor = new OnlyOfficeEditor({
    containerId: "editor",
    documentServerUrl: "http://localhost:8080",
    apiLoader: () => loading.promise,
    windowObject: { CustomEvent }
  });

  const opening = editor.open({});
  editor.close();
  loading.reject(new Error("stale loader failure"));

  assert.equal(await opening, undefined);
  assert.equal(editor.isOpen, false);
});

test("close during DocEditor construction destroys the newly stale instance", async () => {
  let destroyCalls = 0;
  class ReentrantDocEditor {
    constructor(containerId, config) {
      config.events.onAppReady();
    }

    destroyEditor() {
      destroyCalls += 1;
    }
  }
  const editor = new OnlyOfficeEditor({
    containerId: "editor",
    documentServerUrl: "http://localhost:8080",
    apiLoader: async () => ({ DocEditor: ReentrantDocEditor }),
    windowObject: { CustomEvent }
  });

  await editor.open({
    events: {
      onAppReady() {
        editor.close();
      }
    }
  });

  assert.equal(destroyCalls, 1);
  assert.equal(editor.isOpen, false);
});

test("a reentrant open during construction destroys only the stale instance", async () => {
  const instances = [];
  let secondOpen;
  class ReentrantDocEditor {
    constructor(containerId, config) {
      this.destroyCalls = 0;
      this.key = config.document.key;
      instances.push(this);
      if (this.key === "revision-1") {
        config.events.onAppReady();
      }
    }

    destroyEditor() {
      this.destroyCalls += 1;
    }
  }
  const editor = new OnlyOfficeEditor({
    containerId: "editor",
    documentServerUrl: "http://localhost:8080",
    apiLoader: async () => ({ DocEditor: ReentrantDocEditor }),
    windowObject: { CustomEvent }
  });

  await editor.open({
    document: { key: "revision-1" },
    events: {
      onAppReady() {
        secondOpen = editor.open({ document: { key: "revision-2" } });
      }
    }
  });
  await secondOpen;

  assert.deepEqual(
    instances.map(instance => ({
      destroyCalls: instance.destroyCalls,
      key: instance.key
    })),
    [
      { destroyCalls: 1, key: "revision-1" },
      { destroyCalls: 0, key: "revision-2" }
    ]
  );
  assert.equal(editor.isOpen, true);
});
