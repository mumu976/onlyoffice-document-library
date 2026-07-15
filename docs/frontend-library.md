# `OnlyOfficeEditor` 前端库

`public/js/onlyoffice-editor.js` 是本项目的 wrapper，不是官方 `api.js` 替代品。官方 `api.js` 不打包，而是在运行时从 Document Server 的 `/web-apps/apps/api/documents/api.js` 加载；`DocsAPI.DocEditor` 以[官方文档](https://api.onlyoffice.com/docs/docs-api/usage-api/doceditor/)为准。

如果你只是使用本项目页面，不需要手动调用这个库；`public/js/app.js` 已经完成接入。本页面向需要把编辑器嵌入其他页面的前端开发者。完整调用链是：先从后端获取公开的 Document Server 地址和某个文件的签名编辑配置，再把配置交给 `OnlyOfficeEditor.open()`。浏览器端绝不能生成 JWT，也不能持有 `JWT_SECRET`。

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

## 可直接理解和改造的 HTML/ES module 示例

下面示例假设页面与本项目后端同源，并且文档库中已经至少有一个文件。它先读取后端公开配置和文件列表，再打开列表中的第一个文件，因此不需要猜测或手工填写文件 ID。

```html
<div id="onlyoffice-editor" style="height:720px"></div>
<button id="close-editor" type="button">关闭</button>
<script type="module">
  import { OnlyOfficeEditor } from "/js/onlyoffice-editor.js";

  const [publicResponse, filesResponse] = await Promise.all([
    fetch("/api/config"),
    fetch("/api/files")
  ]);
  if (!publicResponse.ok || !filesResponse.ok) {
    throw new Error("读取 ONLYOFFICE 配置或文件列表失败");
  }

  const publicConfig = (await publicResponse.json()).data;
  const files = (await filesResponse.json()).data;
  if (files.length === 0) {
    throw new Error("请先在文档库中新建或上传一个 Word/Excel 文件");
  }

  const configResponse = await fetch(`/api/files/${files[0].id}/editor-config`);
  if (!configResponse.ok) {
    throw new Error("读取签名编辑配置失败");
  }
  const editorConfig = (await configResponse.json()).data;

  const editor = new OnlyOfficeEditor({
    containerId: "onlyoffice-editor",
    documentServerUrl: publicConfig.documentServerUrl
  });
  editor.addEventListener("ready", () => console.log("编辑器应用就绪"));
  editor.addEventListener("document-ready", () => console.log("文档就绪"));
  editor.addEventListener("state-change", (event) => console.log(event.detail.dirty));
  editor.addEventListener("error", (event) => console.error(event.detail));
  await editor.open(editorConfig);
  document.querySelector("#close-editor").addEventListener("click", () => editor.close());
</script>
```

实际产品通常由用户点击某个文件后再请求该文件的 editor config，而不是固定选择第一项。上例的重点是展示正确的数据来源：`documentServerUrl` 来自 `/api/config`，带 token 的编辑配置来自后端，前端只负责创建和销毁编辑器。

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

## 接下来读什么

- 编辑配置、文件接口与保存回调：[后端安装与 REST API](backend-installation.md)
- 方案边界和官方依据：[集成调研报告](research-report.md)
- CSP、mixed content 或 callback 故障：[故障排查](troubleshooting.md)

[返回文档中心](README.md)
