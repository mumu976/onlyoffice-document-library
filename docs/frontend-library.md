# `OnlyOfficeEditor` 前端库

`public/js/onlyoffice-editor.js` 是本项目的 wrapper，不是官方 `api.js` 替代品。官方 `api.js` 不打包，而是在运行时从 Document Server 的 `/web-apps/apps/api/documents/api.js` 加载；`DocsAPI.DocEditor` 以[官方文档](https://api.onlyoffice.com/docs/docs-api/usage-api/doceditor/)为准。

## 构造、方法与属性

```js
const editor = new OnlyOfficeEditor({
  containerId: "onlyoffice-editor",
  documentServerUrl: "http://localhost:8080"
});
```

- `containerId`：编辑器 DOM id。
- `documentServerUrl`：浏览器可访问的 Docs origin；wrapper 自动追加 API 路径。
- `apiLoader`、`windowObject`：测试/多窗口注入项。
- `await open(config)`：加载 API、销毁旧实例并创建 `DocsAPI.DocEditor`。
- `close()`：销毁当前实例，可重复调用。
- `isOpen`：只读布尔值。

`open` 接受后端 `/api/files/:id/editor-config` 的完整配置，并保留调用方 `events` handler；调用方 handler 先执行，wrapper 事件随后派发。

类型声明 `public/js/onlyoffice-editor.d.ts` 的全部导出为 `loadOnlyOfficeApi`、`OnlyOfficeEditor`、`OnlyOfficeEditorInstance`、`OnlyOfficeApi`、`OnlyOfficeApiLoader`、`OnlyOfficeEditorOptions`、`OnlyOfficeStateChangeDetail` 和 `OnlyOfficeErrorDetail`。

## 四个事件与错误

| 事件 | `event.detail` | 官方来源 |
| --- | --- | --- |
| `ready` | `undefined` | `onAppReady` |
| `document-ready` | `undefined` | `onDocumentReady` |
| `state-change` | `{ dirty: boolean }` | `onDocumentStateChange` |
| `error` | `{ code: number, description: string }` | `onError` |

事件字段见[官方事件配置](https://api.onlyoffice.com/docs/docs-api/usage-api/config/events/)。脚本失败、`DocsAPI.DocEditor` 缺失或旧 `open` 被取消时不会泄漏实例；当前打开失败会 reject `Error("ONLYOFFICE API 加载失败")`。`onError` 只转发官方错误码和描述。

## 完整 HTML/ES module 示例

```html
<div id="onlyoffice-editor" style="height:720px"></div>
<button id="close-editor" type="button">关闭</button>
<script type="module">
  import { OnlyOfficeEditor } from "/js/onlyoffice-editor.js";
  const response = await fetch("/api/files/<FILE_ID>/editor-config");
  const payload = await response.json();
  const editor = new OnlyOfficeEditor({
    containerId: "onlyoffice-editor",
    documentServerUrl: "http://localhost:8080"
  });
  editor.addEventListener("ready", () => console.log("编辑器应用就绪"));
  editor.addEventListener("document-ready", () => console.log("文档就绪"));
  editor.addEventListener("state-change", (event) => console.log(event.detail.dirty));
  editor.addEventListener("error", (event) => console.error(event.detail));
  await editor.open(payload.data);
  document.querySelector("#close-editor").addEventListener("click", () => editor.close());
</script>
```

## Word 与 Excel 配置

Word：

```js
{
  documentType: "word",
  document: { fileType: "docx", key: "<FILE_ID>-<REVISION>", url: "http://app:3000/api/files/<FILE_ID>/content" },
  editorConfig: { mode: "edit", callbackUrl: "http://app:3000/api/onlyoffice/callback/<FILE_ID>" }
}
```

Excel：

```js
{
  documentType: "cell",
  document: { fileType: "xlsx", key: "<FILE_ID>-<REVISION>", url: "http://app:3000/api/files/<FILE_ID>/content" },
  editorConfig: { mode: "edit", callbackUrl: "http://app:3000/api/onlyoffice/callback/<FILE_ID>" }
}
```

`http://app:3000` 仅供 Compose 内部服务使用；浏览器应直接使用 API 返回的配置。

## 生命周期与 CSP

组件卸载、切换文件或页面关闭时调用 `close()`，避免 iframe 和事件残留；wrapper 在重新 `open` 前会销毁旧实例。Helmet CSP 必须允许 Document Server origin 出现在 `script-src`、`frame-src`、`connect-src`。生产域名改为 HTTPS 后三处同步，且应用与 Docs 两个浏览器可见地址都必须 HTTPS，否则 mixed content 会阻止 `api.js` 或 iframe。JWT 密钥永远不进入浏览器。
