# 后端安装与 REST API

这份文档面向需要单独运行、接入或维护 Express 后端的开发和运维人员。如果你只是想把完整系统跑起来，不需要先执行本页的原生 Node 命令，请使用 [Windows 新手指南](windows-beginner-guide.md) 或 [Linux 新手部署指南](linux-beginner-guide.md)，由 Docker Compose 同时启动后端和 ONLYOFFICE Docs。

后端本身不编辑 Office 正文。它负责文件列表和存储、编辑配置、JWT、ONLYOFFICE 保存回调以及下载；浏览器编辑器由独立的 Document Server 提供。因此“后端健康”只证明 3000 端口可用，不代表 Word/Excel 编辑器已经可用。

## 先决条件与启动

原生启动适合开发和调试，需要 Node.js 24、可访问的 ONLYOFFICE Document Server、`templates/blank.docx`、`templates/blank.xlsx` 和至少 32 字符的 `JWT_SECRET`。

在 Windows PowerShell 中进入项目目录，安装依赖、生成模板并创建本机配置：

```powershell
npm ci
npm run templates
Copy-Item .env.example .env
npm test
```

打开 `.env`，至少确认三个 URL 与你的实际网络一致，并将 `JWT_SECRET` 换成随机值。然后让 Node 24 明确读取该文件：

```powershell
node --env-file=.env src/server.js
```

成功时看到监听日志；另开一个 PowerShell 执行 `curl.exe -fsS http://localhost:3000/health`，应返回 `{"data":{"status":"ok"}}`。

Linux 原生调试使用同样的读取方式：

```bash
npm ci
npm run templates
npm test
node --env-file=.env src/server.js
```

`npm start` 只执行 `node src/server.js`，不会自动读取 `.env`。只有环境变量已经由当前 shell、systemd、容器或其他进程管理器注入时才直接使用 `npm start`。默认监听 `0.0.0.0:3000`。

## 环境变量

| 变量 | 必需 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `PORT` | 否 | `3000` | 监听端口 |
| `STORAGE_DIR` | 否 | `./storage` | UUID 文件目录 |
| `TEMPLATE_DIR` | 否 | `./templates` | 空白 OOXML 模板 |
| `DOCUMENT_SERVER_PUBLIC_URL` | 是 | `http://localhost:8080`（Compose 回退） | 浏览器可访问的 Docs 地址 |
| `DOCUMENT_SERVER_INTERNAL_URL` | 是 | 无 | callback 文件的容器内下载目标；Compose 为 `http://document-server` |
| `APP_INTERNAL_URL` | 是 | 无 | Docs 读取文件和 callback 地址；Compose 为 `http://app:3000` |
| `JWT_SECRET` | 是 | 无 | 至少 32 字符，与 Docs 相同 |
| `MAX_FILE_BYTES` | 否 | `20971520` | 上传/callback 上限（20 MiB） |
| `MAX_UNCOMPRESSED_BYTES` | 否 | `104857600` | OOXML 解压上限（100 MiB） |

URL 只接受 `http`/`https`，不能带查询或片段；`.env` 不提交 Git。

## 目录与元数据

```text
storage/<uuid>/content.docx|content.xlsx
storage/<uuid>/metadata.json
templates/blank.docx
templates/blank.xlsx
```

metadata 保存 `id`、展示名、扩展名、创建/更新时间、正整数 `revision` 和 SHA-256。展示名不参与磁盘路径，路径只使用服务端 UUID。

## REST 接口

除二进制下载、204 删除响应和 ONLYOFFICE callback 协议外，成功 JSON 使用 `{ "data": ... }`；普通 API 错误使用 `{ "error": { "code": "稳定错误码", "message": "中文说明" } }`。以下 UUID、时间、SHA-256 和 JWT 是便于阅读的示例值。

### 1. `GET /health`、`GET /health/live`、`GET /health/ready`

`/health` 和 `/health/live` 是进程存活检查，成功返回 `{"data":{"status":"ok"}}`。`/health/ready` 还会读取仓储并检查内部 Document Server；成功返回 `{"data":{"status":"ready"}}`，依赖不可用时返回 HTTP 503：

```json
{"error":{"code":"SERVICE_NOT_READY","message":"服务尚未就绪"}}
```

无请求体。成功为 HTTP 200：

```json
{"data":{"status":"ok"}}
```

### 2. `GET /api/config`

无请求体。成功为 HTTP 200，响应给浏览器提供公开配置：

```json
{
  "data": {
    "documentServerUrl": "http://localhost:8080",
    "maxFileBytes": 20971520,
    "supportedExtensions": ["docx", "xlsx"]
  }
}
```

### 3. `GET /api/files`

无请求体。成功为 HTTP 200；`data` 是按 `updatedAt` 倒序排列的元数据数组：

```json
{
  "data": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "季度报告.docx",
      "extension": "docx",
      "createdAt": "2026-07-14T08:00:00.000Z",
      "updatedAt": "2026-07-14T08:00:00.000Z",
      "revision": 1,
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  ]
}
```

空库响应是 `{"data":[]}`。

### 4. `POST /api/files`

请求头为 `Content-Type: application/json`。`type` 只能是 `word` 或 `spreadsheet`：

```json
{"name":"季度报告","type":"word"}
```

成功为 HTTP 201，`data` 是新文件的完整元数据：

```json
{
  "data": {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "季度报告.docx",
    "extension": "docx",
    "createdAt": "2026-07-14T08:00:00.000Z",
    "updatedAt": "2026-07-14T08:00:00.000Z",
    "revision": 1,
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

创建 Excel 时使用 `{"name":"预算","type":"spreadsheet"}`，响应的 `name`/`extension` 分别为 `预算.xlsx`/`xlsx`。不支持的类型返回 HTTP 400：

```json
{"error":{"code":"UNSUPPORTED_FILE_TYPE","message":"仅支持 .docx 和 .xlsx 文件"}}
```

### 5. `POST /api/files/upload`

请求是 `multipart/form-data`，且唯一文件字段必须名为 `file`；支持 `.docx`/`.xlsx`，MIME 必须匹配扩展名或为 `application/octet-stream`，随后仍会校验 OOXML 结构。等价 Linux 请求：

```bash
curl -X POST http://localhost:3000/api/files/upload -F 'file=@./samples/预算.xlsx'
```

成功为 HTTP 201，envelope 与创建端点相同，例如：

```json
{
  "data": {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "预算.xlsx",
    "extension": "xlsx",
    "createdAt": "2026-07-14T08:05:00.000Z",
    "updatedAt": "2026-07-14T08:05:00.000Z",
    "revision": 1,
    "sha256": "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
  }
}
```

缺少 `file` 时返回 HTTP 400：

```json
{"error":{"code":"FILE_REQUIRED","message":"请选择要上传的文件"}}
```

### 6. `GET /api/files/:id/content`

无请求体。成功为 HTTP 200，响应不是 JSON envelope，而是当前 `.docx`/`.xlsx` 二进制；`Content-Type` 使用对应 OOXML MIME，`Content-Disposition` 同时包含安全回退文件名与 UTF-8 展示名，例如：

```http
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
Content-Disposition: attachment; filename="download.docx"; filename*=UTF-8''%E5%AD%A3%E5%BA%A6%E6%8A%A5%E5%91%8A.docx
```

文件不存在时返回 HTTP 404 JSON：

```json
{"error":{"code":"FILE_NOT_FOUND","message":"文件不存在"}}
```

### 7. `GET /api/files/:id/editor-config`

无请求体。成功为 HTTP 200；Word 的 `documentType` 为 `word`，Excel 为 `cell`，`key` 为 `${id}-${revision}`，内部文件 URL 和 callback URL 使用 `APP_INTERNAL_URL`：

```json
{
  "data": {
    "type": "desktop",
    "width": "100%",
    "height": "100%",
    "documentType": "word",
    "document": {
      "fileType": "docx",
      "key": "11111111-1111-4111-8111-111111111111-1",
      "title": "季度报告.docx",
      "url": "http://app:3000/api/files/11111111-1111-4111-8111-111111111111/content",
      "permissions": {"edit":true,"download":true,"print":true}
    },
    "editorConfig": {
      "callbackUrl": "http://app:3000/api/onlyoffice/callback/11111111-1111-4111-8111-111111111111",
      "lang": "zh-CN",
      "mode": "edit",
      "user": {"id":"demo-user","name":"演示用户"},
      "customization": {"forcesave":true}
    },
    "token": "eyJhbGciOiJIUzI1NiJ9.example-signature"
  }
}
```

### 8. `DELETE /api/files/:id`

无请求体。成功为 HTTP 204 且响应体为空，不使用 JSON envelope。编辑中的文件返回 HTTP 409：

```json
{"error":{"code":"FILE_ACTIVE","message":"文件正在编辑，无法删除"}}
```

### 9. `POST /api/onlyoffice/callback/:id`

请求头优先使用 `Authorization: Bearer <CALLBACK_JWT>`，也兼容 body `token`。状态 1 示例：

```json
{
  "status": 1,
  "key": "11111111-1111-4111-8111-111111111111-1",
  "token": "eyJhbGciOiJIUzI1NiJ9.example-signature"
}
```

状态 2/6 还必须包含签名覆盖的 `url`。其 origin 只能等于 `DOCUMENT_SERVER_PUBLIC_URL` 或 `DOCUMENT_SERVER_INTERNAL_URL`；公共地址通过白名单后会保留路径和查询参数，并安全改写到 `DOCUMENT_SERVER_INTERNAL_URL` 下载，其他 origin 一律拒绝。此端点遵循 ONLYOFFICE 协议，处理成功或失败都返回 HTTP 200，而不是普通 API 错误状态：

```json
{"error":0}
```

验证、下载、校验或保存失败仍为 HTTP 200：

```json
{"error":1}
```

## JWT、callback 与 revision

后端用 HS256 和 `JWT_SECRET` 对完整编辑配置签名；callback 优先验证 `Authorization: Bearer`，也接受 body token。签名的 `status`、`key`、`url` 必须与请求一致，key 必须以当前文件 ID 开头并等于当前活动编辑会话 key。状态 1 建立活动 key 并拒绝退回更旧 key，状态 4 只关闭相同 key，状态 2/6 的旧会话保存会被拒绝。

状态 `1` 标记活动编辑，`4` 清理活动状态，`2`/`6` 下载并保存文件；状态语义见 [官方 callback handler](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/)。成功且内容改变时 revision 加一，下一次 key 随之变化，避免旧缓存。

状态 `2`/`6` 的保存按文件互斥锁串行：验证 callback URL 属于公共/内部 Docs origin，必要时改写到容器内地址 → 在 30 秒超时和禁止重定向条件下把受 `MAX_FILE_BYTES` 限制的响应聚合到内存 → repository 校验 OOXML 结构并做 SHA-256 去重 → 同步写入临时内容、临时 metadata 和事务标记 → 原子替换 → 清理标记。失败始终保留旧文件。

## 日志、备份和安全

结构化请求日志包含时间、方法、路径、状态码和 file ID；失败日志不记录 JWT、正文或本地路径。备份边界是 `storage/` 与 Compose named volumes `document_data`、`document_logs`；`.env` 和密钥另行受控备份。

当前应用**没有登录鉴权**，不得直接暴露公网；必须置于已认证反向代理、HTTPS、限流和审计之后。

## Windows PowerShell 示例

使用 `curl.exe` 而非 PowerShell `curl` 别名：

```powershell
curl.exe http://localhost:3000/health
curl.exe -X POST http://localhost:3000/api/files -H "Content-Type: application/json" -d "{\"name\":\"演示报告\",\"type\":\"word\"}"
curl.exe -X POST http://localhost:3000/api/files/upload -F "file=@.\samples\预算.xlsx"
curl.exe http://localhost:3000/api/files
curl.exe http://localhost:3000/api/files/<FILE_ID>/editor-config
curl.exe -L http://localhost:3000/api/files/<FILE_ID>/content -o .\downloaded.docx
curl.exe -i -X DELETE http://localhost:3000/api/files/<FILE_ID>
curl.exe -i -X POST http://localhost:3000/api/onlyoffice/callback/<FILE_ID> -H "Authorization: Bearer <CALLBACK_JWT>" -H "Content-Type: application/json" -d "{\"status\":1,\"key\":\"<FILE_ID>-1\"}"
```

## Linux curl 示例

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/api/files -H 'Content-Type: application/json' -d '{"name":"演示报告","type":"word"}'
curl -X POST http://localhost:3000/api/files/upload -F 'file=@./samples/预算.xlsx'
curl http://localhost:3000/api/files
curl http://localhost:3000/api/files/<FILE_ID>/editor-config
curl -L http://localhost:3000/api/files/<FILE_ID>/content -o ./downloaded.docx
curl -i -X DELETE http://localhost:3000/api/files/<FILE_ID>
curl -i -X POST http://localhost:3000/api/onlyoffice/callback/<FILE_ID> -H 'Authorization: Bearer <CALLBACK_JWT>' -H 'Content-Type: application/json' -d '{"status":1,"key":"<FILE_ID>-1"}'
```
