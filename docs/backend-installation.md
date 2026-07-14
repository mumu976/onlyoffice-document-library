# 后端安装与 REST API

## 先决条件与启动

Node.js 24（`package.json` engines）、`templates/blank.docx`、`templates/blank.xlsx` 和至少 32 字符的 `JWT_SECRET`。原生启动：

```powershell
npm ci
npm run templates
Copy-Item .env.example .env
# 编辑 .env，替换 JWT_SECRET
npm test
npm start
```

Linux 可执行 `npm ci && npm run templates && npm test && npm start`。默认监听 `0.0.0.0:3000`。

## 环境变量

| 变量 | 必需 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `PORT` | 否 | `3000` | 监听端口 |
| `STORAGE_DIR` | 否 | `./storage` | UUID 文件目录 |
| `TEMPLATE_DIR` | 否 | `./templates` | 空白 OOXML 模板 |
| `DOCUMENT_SERVER_PUBLIC_URL` | 是 | `http://localhost:8080`（Compose 回退） | 浏览器可访问的 Docs 地址 |
| `DOCUMENT_SERVER_INTERNAL_URL` | 是 | 无 | callback 下载白名单；Compose 为 `http://document-server` |
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

## 九个 REST 端点

正常 JSON 为 `{ "data": ... }`，错误为 `{ "error": { "code": "稳定错误码", "message": "中文说明" } }`。

| 方法与路径 | 用途与示例 |
| --- | --- |
| `GET /health` | `{"data":{"status":"ok"}}` |
| `GET /api/config` | 返回 `documentServerUrl`、`maxFileBytes`、`supportedExtensions` |
| `GET /api/files` | 按更新时间倒序返回元数据数组 |
| `POST /api/files` | body `{"name":"季度报告","type":"word"}`；`type` 为 `word`/`excel`，返回 201 |
| `POST /api/files/upload` | multipart 字段名必须为 `file`，扩展名只能 `.docx`/`.xlsx`，返回 201 |
| `GET /api/files/:id/content` | 返回当前 OOXML 二进制和安全 `Content-Disposition` |
| `GET /api/files/:id/editor-config` | 返回带 JWT 的 Docs 配置 |
| `DELETE /api/files/:id` | 成功 204；编辑中返回 `409 FILE_ACTIVE` |
| `POST /api/onlyoffice/callback/:id` | 接收保存回调，始终 HTTP 200，成功 `{"error":0}`、失败 `{"error":1}` |

编辑配置中 Word 的 `documentType` 为 `word`，Excel 为 `cell`；`fileType` 为 `docx`/`xlsx`；`key` 为 `${id}-${revision}`；`url` 与 `callbackUrl` 使用 `APP_INTERNAL_URL`；模式为 `edit`。

## JWT、callback 与 revision

后端用 HS256 和 `JWT_SECRET` 对完整编辑配置签名；callback 优先验证 `Authorization: Bearer`，也接受 body token。签名的 `status`、`key`、`url` 必须与请求一致，key 必须以当前文件 ID 开头。

状态 `1` 标记活动编辑，`4` 清理活动状态，`2`/`6` 下载并保存文件；状态语义见 [官方 callback handler](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/)。成功且内容改变时 revision 加一，下一次 key 随之变化，避免旧缓存。

状态 `2`/`6` 的保存按文件互斥锁串行：验证 callback URL origin → 30 秒超时、禁止重定向地下载到临时文件 → 大小和 OOXML 结构校验 → SHA-256 去重 → 写事务标记并同步临时内容/metadata → 原子替换 → 清理标记。失败始终保留旧文件。

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
