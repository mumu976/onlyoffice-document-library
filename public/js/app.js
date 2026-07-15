import { OnlyOfficeEditor } from "./onlyoffice-editor.js";
import {
  deriveLibraryView,
  normalizeViewPreference,
  recentFiles,
} from "./library-view.js";

const elements = {
  appStatus: document.querySelector("#app-status"),
  closeEditor: document.querySelector("#close-editor"),
  dropZone: document.querySelector("#drop-zone"),
  editorShell: document.querySelector("#editor-shell"),
  editorStatus: document.querySelector("#editor-status"),
  fileCount: document.querySelector("#file-count"),
  fileList: document.querySelector("#file-list"),
  healthStatus: document.querySelector("#health-status"),
  newExcel: document.querySelector("#new-excel"),
  newWord: document.querySelector("#new-word"),
  recentFiles: document.querySelector("#recent-files"),
  recentSection: document.querySelector("#recent-section"),
  searchFiles: document.querySelector("#search-files"),
  sortFiles: document.querySelector("#sort-files"),
  typeFilter: document.querySelector("#type-filter"),
  uploadFile: document.querySelector("#upload-file"),
  uploadForm: document.querySelector("#upload-form"),
  uploadHelp: document.querySelector("#upload-help"),
  uploadTrigger: document.querySelector("#upload-trigger"),
  viewGrid: document.querySelector("#view-grid"),
  viewList: document.querySelector("#view-list"),
};

let editor = null;
let files = [];
let selectedFile = null;
let viewPreference = normalizeViewPreference(
  window.localStorage.getItem("onlyoffice-library-view"),
);

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const payload = response.status === 204
    ? null
    : await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `请求失败 (${response.status})`);
    error.code = payload?.error?.code ?? "REQUEST_FAILED";
    throw error;
  }

  return payload?.data ?? null;
}

function setHealth(message, state) {
  elements.healthStatus.textContent = message;
  elements.healthStatus.dataset.state = state;
}

function showStatus(message, state = "info") {
  elements.appStatus.textContent = message;
  elements.appStatus.dataset.state = state;
  elements.appStatus.setAttribute("aria-live", state === "error" ? "assertive" : "polite");
  elements.appStatus.hidden = false;
}

function showError(error) {
  showStatus(`操作失败：${error.message}`, "error");
}

function setEditorStatus(message) {
  elements.editorStatus.textContent = message;
}

function formatUpdatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function typeLabel(extension) {
  return extension === "xlsx" ? "Excel 工作簿" : "Word 文档";
}

function icon(path, alt = "") {
  const image = document.createElement("img");
  image.src = `/assets/icons/${path}`;
  image.alt = alt;
  return image;
}

function fileIcon(file) {
  const wrapper = document.createElement("span");
  wrapper.className = "file-icon";
  wrapper.dataset.type = file.extension;
  wrapper.append(icon("file-text.svg"));
  return wrapper;
}

function actionButton(label, action, iconName) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "file-action";
  button.dataset.action = action;
  button.setAttribute("aria-label", `${label}文档`);
  const text = document.createElement("span");
  text.textContent = label;
  button.append(icon(iconName), text);
  return button;
}

function renderRecent() {
  elements.recentFiles.replaceChildren();
  const recent = recentFiles(files, 4);
  elements.recentSection.hidden = recent.length === 0;
  for (const file of recent) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "recent-card";
    card.dataset.fileId = file.id;
    card.dataset.action = "open";
    card.setAttribute("role", "listitem");

    const text = document.createElement("span");
    text.className = "recent-card__text";
    const name = document.createElement("strong");
    name.textContent = file.name;
    const updated = document.createElement("span");
    updated.textContent = formatUpdatedAt(file.updatedAt);
    text.append(name, updated);
    card.append(fileIcon(file), text);
    elements.recentFiles.append(card);
  }
}

function emptyState(message) {
  const state = document.createElement("div");
  state.className = "empty-state";
  const title = document.createElement("strong");
  title.textContent = message;
  const help = document.createElement("a");
  help.href = "/guides/quick-start";
  help.textContent = "查看快速开始指南";
  state.append(title, help);
  return state;
}

function renderLibrary() {
  const visibleFiles = deriveLibraryView(files, {
    query: elements.searchFiles.value ?? "",
    type: elements.typeFilter.value || "all",
    sort: elements.sortFiles.value || "newest",
  });

  elements.fileList.dataset.view = viewPreference;
  elements.viewList.setAttribute("aria-pressed", String(viewPreference === "list"));
  elements.viewGrid.setAttribute("aria-pressed", String(viewPreference === "grid"));
  elements.fileList.replaceChildren();
  elements.fileCount.textContent = visibleFiles.length === files.length
    ? `${files.length} 个文档`
    : `${visibleFiles.length} / ${files.length} 个文档`;

  if (files.length === 0) {
    elements.fileList.append(emptyState("还没有文档，可以新建或上传一个文件。"));
    return;
  }

  if (visibleFiles.length === 0) {
    elements.fileList.append(emptyState("没有找到匹配的文档，请调整搜索或筛选条件。"));
    return;
  }

  for (const file of visibleFiles) {
    const row = document.createElement("article");
    row.className = "file-row";
    row.dataset.fileId = file.id;
    row.setAttribute("role", "listitem");

    const primary = document.createElement("div");
    primary.className = "file-primary";
    const name = document.createElement("strong");
    name.textContent = file.name;
    primary.append(fileIcon(file), name);

    const type = document.createElement("span");
    type.className = "file-meta";
    type.textContent = typeLabel(file.extension);
    const updated = document.createElement("span");
    updated.className = "file-meta";
    updated.textContent = formatUpdatedAt(file.updatedAt);

    const actions = document.createElement("div");
    actions.className = "file-actions";
    actions.append(
      actionButton("打开", "open", "external-link.svg"),
      actionButton("下载", "download", "download.svg"),
      actionButton("删除", "delete", "trash-2.svg"),
    );
    row.append(primary, type, updated, actions);
    elements.fileList.append(row);
  }
}

function renderFiles(nextFiles) {
  files = nextFiles;
  renderRecent();
  renderLibrary();
}

async function loadFiles() {
  const nextFiles = await api("/api/files");
  renderFiles(nextFiles);
  return nextFiles;
}

function configureEditor(documentServerUrl) {
  editor = new OnlyOfficeEditor({
    containerId: "onlyoffice-editor",
    documentServerUrl,
  });
  editor.addEventListener("ready", () => setEditorStatus("正在加载编辑器"));
  editor.addEventListener("document-ready", () => setEditorStatus("文档已打开"));
  editor.addEventListener("state-change", (event) => {
    setEditorStatus(event.detail.dirty ? "存在尚未同步的修改" : "修改已同步到编辑服务");
  });
  editor.addEventListener("error", (event) => {
    const { code, description } = event.detail;
    setEditorStatus(`编辑器错误：${code} ${description}`);
  });
}

async function createFile(type, kindLabel) {
  const proposedName = window.prompt(`请输入${kindLabel}文件名（无需扩展名）`);
  if (proposedName === null) return;
  const name = proposedName.trim();
  if (name === "") {
    showStatus("文件名不能为空", "error");
    return;
  }

  try {
    await api("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type }),
    });
    await loadFiles();
    showStatus(`已新建${kindLabel}文档`, "success");
  } catch (error) {
    showError(error);
  }
}

async function uploadSelectedFile(file) {
  if (!file) {
    showStatus("请选择要上传的文件", "error");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  elements.uploadTrigger.disabled = true;
  try {
    await api("/api/files/upload", { method: "POST", body: formData });
    elements.uploadForm.reset();
    await loadFiles();
    showStatus("文件上传成功", "success");
  } catch (error) {
    showError(error);
  } finally {
    elements.uploadTrigger.disabled = false;
  }
}

async function openFile(file) {
  selectedFile = { id: file.id, revision: file.revision };
  setEditorStatus("正在加载编辑器");

  try {
    const editorConfig = await api(`/api/files/${encodeURIComponent(file.id)}/editor-config`);
    elements.editorShell.hidden = false;
    document.body.classList.add("editor-open");
    await editor.open(editorConfig);
  } catch (error) {
    editor.close();
    elements.editorShell.hidden = true;
    document.body.classList.remove("editor-open");
    selectedFile = null;
    setEditorStatus(`编辑器加载失败：${error.message}`);
    showError(error);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function pollForRevision(file) {
  let latestFiles = files;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await delay(1000);
    latestFiles = await api("/api/files");
    const current = latestFiles.find((candidate) => candidate.id === file.id);
    if (current?.revision > file.revision) return { changed: true, latestFiles };
  }
  return { changed: false, latestFiles };
}

async function closeEditor() {
  if (!editor || !selectedFile) return;
  const closedFile = selectedFile;
  selectedFile = null;
  editor.close();
  elements.editorShell.hidden = true;
  document.body.classList.remove("editor-open");
  showStatus("正在检查文档版本");

  try {
    const { changed, latestFiles } = await pollForRevision(closedFile);
    renderFiles(latestFiles);
    showStatus(changed ? "已检测到新版本" : "未检测到新版本；若未修改文档这是正常现象", changed ? "success" : "info");
  } catch (error) {
    showError(error);
  }
}

async function deleteFile(file) {
  if (!window.confirm(`确定删除“${file.name}”吗？`)) return;
  await api(`/api/files/${encodeURIComponent(file.id)}`, { method: "DELETE" });
  await loadFiles();
  showStatus("文档已删除", "success");
}

async function handleFileAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const allowedContainer = elements.fileList.contains(button) || elements.recentFiles.contains(button);
  if (!allowedContainer) return;
  const row = button.closest("[data-file-id]");
  const file = files.find((candidate) => candidate.id === row?.dataset.fileId);
  if (!file) return;

  if (button.dataset.action === "download") {
    window.location.assign(`/api/files/${encodeURIComponent(file.id)}/content`);
    return;
  }

  button.disabled = true;
  try {
    if (button.dataset.action === "open") await openFile(file);
    if (button.dataset.action === "delete") await deleteFile(file);
  } catch (error) {
    showError(error);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

function setView(nextView) {
  viewPreference = normalizeViewPreference(nextView);
  window.localStorage.setItem("onlyoffice-library-view", viewPreference);
  renderLibrary();
}

function openFilePicker() {
  elements.uploadFile.click();
}

async function initialize() {
  try {
    const [config, initialFiles] = await Promise.all([api("/api/config"), api("/api/files")]);
    configureEditor(config.documentServerUrl);
    renderFiles(initialFiles);
    elements.uploadHelp.textContent =
      `支持 ${config.supportedExtensions.map((extension) => `.${extension}`).join("、")}，` +
      `单个文件不超过 ${Math.round(config.maxFileBytes / 1024 / 1024)} MiB`;
    setHealth("服务运行正常", "ready");
    showStatus(`已加载 ${initialFiles.length} 个文档`);
  } catch (error) {
    setHealth("服务连接失败", "error");
    showError(error);
  }
}

elements.newWord.addEventListener("click", () => createFile("word", "Word"));
elements.newExcel.addEventListener("click", () => createFile("spreadsheet", "Excel"));
elements.uploadForm.addEventListener("submit", (event) => {
  event.preventDefault();
  uploadSelectedFile(elements.uploadFile.files[0]);
});
elements.uploadTrigger.addEventListener("click", openFilePicker);
elements.uploadFile.addEventListener("change", () => uploadSelectedFile(elements.uploadFile.files[0]));
elements.searchFiles.addEventListener("input", renderLibrary);
elements.typeFilter.addEventListener("change", renderLibrary);
elements.sortFiles.addEventListener("change", renderLibrary);
elements.viewList.addEventListener("click", () => setView("list"));
elements.viewGrid.addEventListener("click", () => setView("grid"));
elements.fileList.addEventListener("click", handleFileAction);
elements.recentFiles.addEventListener("click", handleFileAction);
elements.closeEditor.addEventListener("click", closeEditor);
elements.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropZone.dataset.active = "true";
});
elements.dropZone.addEventListener("dragleave", () => {
  elements.dropZone.dataset.active = "false";
});
elements.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.dropZone.dataset.active = "false";
  uploadSelectedFile(event.dataTransfer?.files?.[0]);
});
elements.dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openFilePicker();
  }
});

initialize();
