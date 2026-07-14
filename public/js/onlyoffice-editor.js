const apiLoads = new Map();

function apiScriptUrl(documentServerUrl) {
  const baseUrl = documentServerUrl.replace(/\/+$/, "");
  return `${baseUrl}/web-apps/apps/api/documents/api.js`;
}

/**
 * Loads the official ONLYOFFICE browser API from the configured Document Server.
 * This project does not bundle that API script.
 */
export function loadOnlyOfficeApi(documentServerUrl, windowObject = window) {
  const scriptUrl = apiScriptUrl(documentServerUrl);
  const cached = apiLoads.get(scriptUrl);
  if (cached) {
    return cached;
  }

  const loading = new Promise((resolve, reject) => {
    const script = windowObject.document.createElement("script");
    script.async = true;
    script.src = scriptUrl;
    script.onload = () => {
      if (windowObject.DocsAPI?.DocEditor) {
        resolve(windowObject.DocsAPI);
        return;
      }
      reject(new Error("ONLYOFFICE API 加载失败"));
    };
    script.onerror = () => {
      reject(new Error("ONLYOFFICE API 加载失败"));
    };
    windowObject.document.head.appendChild(script);
  }).catch(error => {
    apiLoads.delete(scriptUrl);
    throw error;
  });

  apiLoads.set(scriptUrl, loading);
  return loading;
}

export class OnlyOfficeEditor extends EventTarget {
  #apiLoader;
  #containerId;
  #documentServerUrl;
  #editor = null;
  #generation = 0;
  #windowObject;

  constructor({
    containerId,
    documentServerUrl,
    apiLoader = loadOnlyOfficeApi,
    windowObject = window
  }) {
    super();
    this.#containerId = containerId;
    this.#documentServerUrl = documentServerUrl;
    this.#apiLoader = apiLoader;
    this.#windowObject = windowObject;
  }

  get isOpen() {
    return this.#editor !== null;
  }

  async open(config) {
    const generation = ++this.#generation;
    this.#destroyEditor();
    let DocsAPI;
    try {
      DocsAPI = await this.#apiLoader(
        this.#documentServerUrl,
        this.#windowObject
      );
    } catch (error) {
      if (generation !== this.#generation) {
        return;
      }
      throw error;
    }

    if (generation !== this.#generation) {
      return;
    }

    const backendEvents =
      config.events && typeof config.events === "object" ? config.events : {};
    const wrapper = this;

    const wrap = (handler, type, getDetail = () => undefined) =>
      function wrappedOnlyOfficeEvent(...args) {
        if (typeof handler === "function") {
          handler.apply(this, args);
        }
        wrapper.dispatchEvent(
          new wrapper.#windowObject.CustomEvent(type, {
            detail: getDetail(args[0])
          })
        );
      };

    const editorConfig = {
      ...config,
      events: {
        ...backendEvents,
        onAppReady: wrap(backendEvents.onAppReady, "ready"),
        onDocumentReady: wrap(
          backendEvents.onDocumentReady,
          "document-ready"
        ),
        onDocumentStateChange: wrap(
          backendEvents.onDocumentStateChange,
          "state-change",
          event => ({ dirty: Boolean(event?.data) })
        ),
        onError: wrap(backendEvents.onError, "error", event => ({
          code: event?.data?.errorCode,
          description: event?.data?.errorDescription
        }))
      }
    };

    const editor = new DocsAPI.DocEditor(this.#containerId, editorConfig);
    if (generation !== this.#generation) {
      editor.destroyEditor();
      return;
    }
    this.#editor = editor;
  }

  close() {
    this.#generation += 1;
    this.#destroyEditor();
  }

  #destroyEditor() {
    if (this.#editor === null) {
      return;
    }

    const editor = this.#editor;
    this.#editor = null;
    editor.destroyEditor();
  }
}
