import { OnlyOfficeEditor } from "./onlyoffice-editor.js";

const elements = {
  appStatus: document.querySelector("#app-status"),
  closeEditor: document.querySelector("#close-editor"),
  editorShell: document.querySelector("#editor-shell"),
  editorStatus: document.querySelector("#editor-status"),
  fileCount: document.querySelector("#file-count"),
  fileList: document.querySelector("#file-list"),
  healthStatus: document.querySelector("#health-status"),
  newExcel: document.querySelector("#new-excel"),
  newWord: document.querySelector("#new-word"),
  uploadFile: document.querySelector("#upload-file"),
  uploadForm: document.querySelector("#upload-form"),
  uploadHelp: document.querySelector("#upload-help"),
};

let editor = null;
let files = [];
let selectedFile = null;

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

function actionButton(label, action, variant = "secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button button--${variant} button--compact`;
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

function tableCell(label, className, text) {
  const cell = document.createElement("td");
  cell.dataset.label = label;
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function renderFiles(nextFiles) {
  files = nextFiles;
  elements.fileList.replaceChildren();
  elements.fileCount.textContent = `${files.length} 个文档`;

  if (files.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "empty-state";
    cell.textContent = "还没有文档，可以新建或上传一个文件。";
    row.append(cell);
    elements.fileList.append(row);
    return;
  }

  for (const file of files) {
    const row = document.createElement("tr");
    row.dataset.fileId = file.id;
    row.append(
      tableCell("名称", "file-name", file.name),
      tableCell("类型", "file-type", typeLabel(file.extension)),
      tableCell("更新时间", "file-updated", formatUpdatedAt(file.updatedAt)),
    );

    const actions = document.createElement("td");
    actions.dataset.label = "操作";
    const actionGroup = document.createElement("div");
    actionGroup.className = "file-actions";
    actionGroup.append(
      actionButton("打开", "open", "primary"),
      actionButton("下载", "download"),
      actionButton("删除", "delete", "danger"),
    );
    actions.append(actionGroup);
    row.append(actions);
    elements.fileList.append(row);
  }
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
    setEditorStatus(
      event.detail.dirty
        ? "存在尚未同步的修改"
        : "修改已同步到编辑服务",
    );
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

async function uploadFile(event) {
  event.preventDefault();
  const file = elements.uploadFile.files[0];
  if (!file) {
    showStatus("请选择要上传的文件", "error");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  const submitButton = elements.uploadForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  try {
    await api("/api/files/upload", { method: "POST", body: formData });
    elements.uploadForm.reset();
    await loadFiles();
    showStatus("文件上传成功", "success");
  } catch (error) {
    showError(error);
  } finally {
    submitButton.disabled = false;
  }
}

async function openFile(file) {
  selectedFile = { id: file.id, revision: file.revision };
  setEditorStatus("正在加载编辑器");

  try {
    const editorConfig = await api(
      `/api/files/${encodeURIComponent(file.id)}/editor-config`,
    );
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
    if (current?.revision > file.revision) {
      return { changed: true, latestFiles };
    }
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
    if (changed) {
      showStatus("已检测到新版本", "success");
    } else {
      showStatus("未检测到新版本；若未修改文档这是正常现象");
    }
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
  if (!button || !elements.fileList.contains(button)) return;

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

async function initialize() {
  try {
    const [config, initialFiles] = await Promise.all([
      api("/api/config"),
      api("/api/files"),
    ]);
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
elements.uploadForm.addEventListener("submit", uploadFile);
elements.fileList.addEventListener("click", handleFileAction);
elements.closeEditor.addEventListener("click", closeEditor);

initialize();
