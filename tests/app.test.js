import test from "node:test";
import assert from "node:assert/strict";
import { OnlyOfficeEditor } from "../public/js/onlyoffice-editor.js";

const file = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "报告.docx",
  extension: "docx",
  updatedAt: "2026-07-14T08:00:00.000Z",
  revision: 1,
};

class FakeClassList {
  #values = new Set();

  add(value) {
    this.#values.add(value);
  }

  remove(value) {
    this.#values.delete(value);
  }

  contains(value) {
    return this.#values.has(value);
  }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.classList = new FakeClassList();
    this.dataset = {};
    this.disabled = false;
    this.files = [];
    this.hidden = false;
    this.isConnected = true;
    this.listeners = new Map();
    this.textContent = "";
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  append(...children) {
    this.children.push(...children);
  }

  contains() {
    return true;
  }

  querySelector() {
    return null;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  reset() {}

  setAttribute(name, value) {
    this[name] = value;
  }

  async emit(type, event = { target: this }) {
    for (const listener of this.listeners.get(type) ?? []) {
      await listener(event);
    }
  }
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

async function createHarness(t, { editorConfigFails = false, editorOpenFails = false }) {
  const originalGlobals = {
    document: globalThis.document,
    fetch: globalThis.fetch,
    window: globalThis.window,
  };
  t.after(() => {
    globalThis.document = originalGlobals.document;
    globalThis.fetch = originalGlobals.fetch;
    globalThis.window = originalGlobals.window;
  });

  const order = [];
  const fetchCalls = [];
  let closeCalls = 0;
  const elements = new Map();
  for (const selector of [
    "#app-status",
    "#close-editor",
    "#drop-zone",
    "#editor-shell",
    "#editor-status",
    "#file-count",
    "#file-list",
    "#health-status",
    "#new-excel",
    "#new-word",
    "#recent-files",
    "#search-files",
    "#sort-files",
    "#type-filter",
    "#upload-file",
    "#upload-form",
    "#upload-help",
    "#upload-trigger",
    "#view-grid",
    "#view-list",
  ]) {
    elements.set(selector, new FakeElement());
  }

  const editorShell = elements.get("#editor-shell");
  let shellHidden = true;
  Object.defineProperty(editorShell, "hidden", {
    get() {
      return shellHidden;
    },
    set(value) {
      shellHidden = value;
      order.push(value ? "hide-shell" : "show-shell");
    },
  });
  const submitButton = new FakeElement("button");
  elements.get("#upload-form").querySelector = () => submitButton;

  const documentObject = {
    body: new FakeElement("body"),
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    head: new FakeElement("head"),
    querySelector(selector) {
      return elements.get(selector);
    },
  };
  const storedValues = new Map();
  const windowObject = {
    CustomEvent,
    document: documentObject,
    location: { assign() {} },
    localStorage: {
      getItem(key) {
        return storedValues.get(key) ?? null;
      },
      setItem(key, value) {
        storedValues.set(key, String(value));
      },
    },
    confirm: () => true,
    prompt: () => null,
    setTimeout(callback) {
      callback();
      return 1;
    },
  };

  globalThis.document = documentObject;
  globalThis.window = windowObject;
  globalThis.fetch = async (path) => {
    fetchCalls.push(path);
    if (path === "/api/config") {
      return jsonResponse(200, {
        data: {
          documentServerUrl: "http://localhost:8080",
          maxFileBytes: 20 * 1024 * 1024,
          supportedExtensions: ["docx", "xlsx"],
        },
      });
    }
    if (path === "/api/files") {
      return jsonResponse(200, { data: [file] });
    }
    if (path.endsWith("/editor-config")) {
      order.push("editor-config");
      if (editorConfigFails) {
        return jsonResponse(500, {
          error: { code: "EDITOR_CONFIG_FAILED", message: "配置加载失败" },
        });
      }
      return jsonResponse(200, { data: { document: { key: "revision-1" } } });
    }
    throw new Error(`Unexpected request: ${path}`);
  };

  t.mock.method(OnlyOfficeEditor.prototype, "open", async () => {
    order.push("editor-open");
    if (editorOpenFails) throw new Error("编辑器启动失败");
  });
  t.mock.method(OnlyOfficeEditor.prototype, "close", () => {
    closeCalls += 1;
    order.push("editor-close");
  });

  await import(`../public/js/app.js?test=${Date.now()}-${Math.random()}`);
  await new Promise((resolve) => setImmediate(resolve));

  const row = new FakeElement("tr");
  row.dataset.fileId = file.id;
  const openButton = new FakeElement("button");
  openButton.dataset.action = "open";
  openButton.closest = (selector) =>
    selector === "button[data-action]" ? openButton : row;

  return {
    body: documentObject.body,
    closeButton: elements.get("#close-editor"),
    editorShell,
    fetchCalls,
    fileList: elements.get("#file-list"),
    searchFiles: elements.get("#search-files"),
    storedValues,
    get closeCalls() {
      return closeCalls;
    },
    openEvent: { target: openButton },
    order,
    viewGrid: elements.get("#view-grid"),
  };
}

test("search and view controls update the visible library state", async (t) => {
  const harness = await createHarness(t, {});

  harness.searchFiles.value = "不存在";
  await harness.searchFiles.emit("input");
  assert.equal(harness.fileList.children.length, 1);
  assert.match(harness.fileList.children[0].children[0].textContent, /没有找到/);

  await harness.viewGrid.emit("click");
  assert.equal(harness.fileList.dataset.view, "grid");
  assert.equal(harness.storedValues.get("onlyoffice-library-view"), "grid");
});

test("editor config failure rolls back the open attempt without revision polling", async (t) => {
  const harness = await createHarness(t, { editorConfigFails: true });

  await harness.fileList.emit("click", harness.openEvent);

  assert.equal(harness.editorShell.hidden, true);
  assert.equal(harness.body.classList.contains("editor-open"), false);
  assert.equal(harness.closeCalls, 1);
  const fileRequestsBeforeClose = harness.fetchCalls.filter(
    (path) => path === "/api/files",
  ).length;

  await harness.closeButton.emit("click");

  assert.equal(
    harness.fetchCalls.filter((path) => path === "/api/files").length,
    fileRequestsBeforeClose,
  );
  assert.equal(harness.closeCalls, 1);
  assert.equal(harness.order.includes("show-shell"), false);
});

test("editor open failure shows the shell only after config and fully rolls back", async (t) => {
  const harness = await createHarness(t, { editorOpenFails: true });

  await harness.fileList.emit("click", harness.openEvent);

  assert.deepEqual(harness.order, [
    "editor-config",
    "show-shell",
    "editor-open",
    "editor-close",
    "hide-shell",
  ]);
  assert.equal(harness.editorShell.hidden, true);
  assert.equal(harness.body.classList.contains("editor-open"), false);
  assert.equal(harness.closeCalls, 1);
  const fileRequestsBeforeClose = harness.fetchCalls.filter(
    (path) => path === "/api/files",
  ).length;

  await harness.closeButton.emit("click");

  assert.equal(
    harness.fetchCalls.filter((path) => path === "/api/files").length,
    fileRequestsBeforeClose,
  );
  assert.equal(harness.closeCalls, 1);
});
