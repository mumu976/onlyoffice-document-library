# ONLYOFFICE 文档库集成演示设计规格

**日期：** 2026-07-14  
**状态：** 已确认  
**目标：** 在本地启动一套可编辑 Word 和 Excel 的 ONLYOFFICE 前后端应用，并交付可用于 Ubuntu/Linux 的 Docker Compose 部署文档、后端安装文档、可复用前端 JavaScript 库及其使用文档。

## 1. 已确认范围

本项目采用自建集成样例，而不是部署 ONLYOFFICE DocSpace 或 Workspace。ONLYOFFICE Docs 只承担文档编辑服务；Node.js 应用承担文件管理、存储、编辑配置和保存回调。

首期包含以下能力：

- 新建 `.docx` 和 `.xlsx` 文件；
- 上传、列出、打开编辑、保存回存、下载和删除文件；
- 基于官方 `DocsAPI.DocEditor` 的项目内可复用 JavaScript 封装；
- Windows 本地 Docker Desktop 演示；
- Ubuntu 22.04/24.04 x86_64 的 Docker Compose 部署说明；
- 后端安装、前端库使用、演示验收和故障排查文档。

首期不包含登录、用户权限、分享、版本历史、多人协作、数据库和对象存储。部署文档必须明确：当前应用没有登录鉴权，不得未经安全网关保护直接暴露到公网。

## 2. 选型结论

采用单体 Node.js 集成应用：Express 同时提供 REST API、静态前端和文件存储访问；ONLYOFFICE Docs 作为独立容器运行；Docker Compose 统一编排两个服务。

不采用前后端分离方案，因为其跨域、独立构建和反向代理成本对当前单用户演示没有必要。不直接改造官方集成示例，因为官方示例定位为测试用途，范围和复杂度均高于本项目需要。

## 3. 技术基线

- Node.js 24；
- Express；
- 原生 HTML、CSS 和 JavaScript；
- ONLYOFFICE Docs Community Edition Docker 镜像 `onlyoffice/documentserver:9.4.0.1`；
- Docker Compose；
- JWT 用于编辑器配置和 Document Server 回调验证；
- 文件系统用于持久化，不引入数据库。

镜像版本依据 2026-07-14 调研时可用的 Community Edition 9.4 系列固定，避免使用会随时间变化的 `latest` 标签。

## 4. 系统架构

系统由四部分组成：

1. 浏览器：显示文件列表，调用文件管理 API，加载编辑器；
2. Express 应用：提供页面、API、文件内容、编辑配置和保存回调；
3. ONLYOFFICE Docs：向浏览器提供 Word/Excel 编辑界面，从 Express 读取文件并回调保存结果；
4. 本地文件存储：保存 Office 文件及其元数据。

本地默认外部地址如下：

- 应用：`http://localhost:3000`；
- ONLYOFFICE Docs：`http://localhost:8080`。

容器内部通过 Compose 服务名通信：Document Server 使用 `http://app:3000` 读取源文件和调用保存回调。浏览器使用可从用户机器访问的 Document Server 外部地址加载 `/web-apps/apps/api/documents/api.js` 和编辑器界面。所有地址均由环境变量提供，不把 `localhost` 写死在业务代码中。

## 5. 组件职责

### 5.1 Express 应用

Express 应用负责：

- 提供静态文件管理页面；
- 实现新建、上传、列表、下载和删除 API；
- 提供 Document Server 可访问的文件内容 URL；
- 根据文件类型和修订号生成编辑配置；
- 使用共享密钥签发 JWT；
- 验证 Document Server 回调并保存更新后的文件；
- 提供 `/health` 健康检查。

Express 不解析或修改文档正文，Office 内容编辑完全由 ONLYOFFICE Docs 完成。

### 5.2 浏览器前端

前端分为文件管理页面和 `OnlyOfficeEditor` 库：

- 文件管理页面实现创建、上传、打开、下载、删除和状态提示；
- `OnlyOfficeEditor` 动态加载 Document Server 的 `api.js`；
- 封装 `DocsAPI.DocEditor` 的创建和销毁；
- 统一处理 `onAppReady`、`onDocumentReady`、`onDocumentStateChange` 和 `onError`；
- 通过自定义事件或回调向宿主页面报告状态。

前端永远不接触 JWT 密钥，也不承担保存回调。

### 5.3 ONLYOFFICE Docs

ONLYOFFICE Docs 负责：

- 提供文档编辑器和表格编辑器；
- 从 Express 应用下载源文件；
- 在结束编辑或强制保存时调用 Express callback URL；
- 使用与 Express 相同的 JWT 密钥校验编辑配置和回调。

### 5.4 文件存储

每个文件使用独立 UUID 目录：

```text
storage/
└── <file-id>/
    ├── content.docx
    └── metadata.json
```

Excel 文件对应 `content.xlsx`。`metadata.json` 包含：

- `id`：UUID；
- `name`：展示文件名；
- `extension`：`docx` 或 `xlsx`；
- `createdAt`：ISO 8601 时间；
- `updatedAt`：ISO 8601 时间；
- `revision`：正整数，初始为 1；
- `sha256`：当前内容哈希。

`storage/` 通过 Docker volume 或主机绑定目录持久化。

## 6. REST 接口

后端提供以下接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/health` | 应用健康检查 |
| `GET` | `/api/config` | 返回浏览器可访问的 Document Server URL 等公开配置 |
| `GET` | `/api/files` | 按更新时间倒序返回文件列表 |
| `POST` | `/api/files` | 根据 `name` 和 `type` 新建 Word 或 Excel |
| `POST` | `/api/files/upload` | 上传一个 `.docx` 或 `.xlsx` 文件 |
| `GET` | `/api/files/:id/content` | 向用户或 Document Server 返回当前文件内容 |
| `GET` | `/api/files/:id/editor-config` | 返回带 JWT 的 ONLYOFFICE 编辑配置 |
| `DELETE` | `/api/files/:id` | 删除未处于编辑状态的文件 |
| `POST` | `/api/onlyoffice/callback/:id` | 接收 Document Server 保存回调 |

正常 JSON 响应采用 `{ "data": ... }`，错误响应采用 `{ "error": { "code": "稳定错误码", "message": "中文说明" } }`。callback 接口遵循 ONLYOFFICE 协议返回 `{ "error": 0 }` 或非零错误值。

## 7. 文件生命周期

### 7.1 新建

后端校验名称和类型，生成 UUID，从仓库内的空白 OOXML 模板复制 `content.docx` 或 `content.xlsx`，计算 SHA-256，写入初始修订号为 1 的元数据。文件与元数据必须全部写入成功后才出现在列表中。

### 7.2 上传

上传采用 `multipart/form-data`，默认限制 20 MB。后端校验：

- 扩展名只能是 `.docx` 或 `.xlsx`；
- MIME 类型必须与预期兼容；
- ZIP 容器必须包含 `[Content_Types].xml`；
- Word 必须包含 `word/document.xml`；
- Excel 必须包含 `xl/workbook.xml`。

展示名称不会参与磁盘路径计算；磁盘路径只使用服务端生成的 UUID，从而阻止路径穿越。

### 7.3 打开编辑器

`GET /api/files/:id/editor-config` 返回：

- Word 的 `documentType` 为 `word`，Excel 为 `cell`；
- `document.fileType` 为 `docx` 或 `xlsx`；
- `document.key` 为文件 ID 与当前修订号的稳定组合；
- `document.url` 为 Document Server 可访问的内容地址；
- `editorConfig.callbackUrl` 为 Document Server 可访问的保存回调地址；
- `editorConfig.mode` 为 `edit`；
- `token` 为后端使用共享密钥签发的 JWT。

每次成功保存后修订号递增，使下一次打开时使用新的 `document.key`，避免读取旧缓存。

### 7.4 保存回存

callback 处理流程如下：

1. 验证回调 JWT 和文件 ID；
2. 状态 `1` 表示正在编辑，只更新内存中的活动状态；
3. 状态 `4` 表示关闭且无修改，只清理活动状态；
4. 状态 `2` 或 `6` 时，校验回调下载 URL 的协议、主机和端口属于受信任的 Document Server；
5. 将新内容下载到同一文件目录下的临时文件，并执行大小与 OOXML 结构校验；
6. 计算 SHA-256；如果内容未变化，删除临时文件并返回成功，不递增修订号；
7. 对同一文件串行执行原子替换，更新哈希、更新时间和修订号；
8. 任一步骤失败时保留原文件，记录结构化日志并向 Document Server 返回错误。

### 7.5 下载和删除

下载返回当前已保存版本，使用安全的 `Content-Disposition` 文件名。删除前前端显示二次确认；后端根据活动编辑状态再次校验。处于编辑状态的文件返回冲突错误，关闭编辑器后方可删除。

## 8. 安全设计

- Compose 中默认设置 `JWT_ENABLED=true`；
- Express 与 ONLYOFFICE Docs 从同一环境变量读取高强度 `JWT_SECRET`；
- `.env` 不提交 Git，只提供 `.env.example`；
- 上传和回存都执行大小、扩展名和 OOXML 结构校验；
- callback 下载 URL 使用严格的 Document Server 地址白名单，防止 SSRF；
- 文件写入使用临时文件和原子替换，失败时保留旧版本；
- 同一文件的 callback 使用进程内互斥锁串行处理；
- API 不接受客户端磁盘路径；
- 静态资源和下载响应设置必要的安全响应头；
- Linux 公网部署必须置于带认证的网关之后，并使用 HTTPS；本项目本身不宣称提供生产级用户鉴权。

## 9. 错误处理和可观测性

- API 对无效输入、未找到、文件冲突、类型错误、过大文件、JWT 失败和内部错误使用不同稳定错误码；
- Express 输出包含时间、请求方法、路径、状态码和文件 ID 的结构化日志，不记录 JWT 和文件正文；
- 前端以加载中、已就绪、存在未同步修改、已同步和错误状态提示用户；
- ONLYOFFICE 的 `onError` 事件显示错误码和用户可执行的排查建议；
- Compose 为两个服务配置健康检查；
- `docker compose ps`、`docker compose logs app` 和 `docker compose logs document-server` 是部署文档中的标准诊断入口。

## 10. 测试策略

自动化测试包括：

- 文件名、文件类型、大小和 OOXML 结构校验单元测试；
- 文件仓储的新建、保存、修订号、哈希去重和删除测试；
- Word/Excel 编辑配置映射和 JWT 测试；
- callback 状态 `1`、`2`、`4`、`6` 测试；
- 无效 JWT、不受信任 URL、下载失败、无效 OOXML 和重复 callback 测试；
- REST API 集成测试，使用临时存储目录；
- `OnlyOfficeEditor` 的脚本加载、创建、销毁和错误事件测试；
- Docker Compose 健康检查；
- Word 和 Excel 编辑后重新打开的人工冒烟测试。

## 11. 本地演示验收

本地演示必须完成：

1. `docker compose up` 启动应用和 ONLYOFFICE Docs；
2. 新建 Word，输入内容，保存并关闭，重新打开后内容仍存在；
3. 新建 Excel，填写单元格和公式，保存并关闭，重新打开后内容仍存在；
4. 上传已有 `.docx` 和 `.xlsx`，能够打开和修改；
5. 下载保存后的文件，本地 Office 软件能够打开；
6. 删除文件后列表和对应存储目录均不存在；
7. Word 和 Excel 各保留一份截图或带时间的验收记录；
8. 自动化测试和两个容器的健康检查通过。

## 12. Linux 部署设计

Linux 主线环境为 Ubuntu 22.04 或 24.04 x86_64，使用 Docker Engine 和 Docker Compose 插件。部署文档覆盖：

- 官方建议的 CPU、内存、磁盘和 Swap 要求；
- Docker Engine 与 Compose 安装和版本确认；
- 项目复制或 Git 拉取；
- `.env` 中的外部 URL、内部 URL、JWT 密钥和上传限制；
- 镜像构建、启动、停止、健康检查和日志查看；
- `storage/` 的权限、持久化、备份与恢复；
- LAN 演示所需端口；
- 公网场景的域名、Nginx、HTTPS 和 WebSocket 反向代理示例；
- Docker 服务开机启动；
- 先备份数据再升级镜像的流程；
- Document Server 读不到文件、callback 不通、JWT 错误、跨域、混合内容和字体问题的排查步骤。

官方 Docker 安装页面在调研时给出的基线为双核 2 GHz、4 GB RAM、40 GB 可用空间和 4 GB Swap；部署文档必须注明这些是官方基线，实际容量需依据并发打开文档数和文档大小评估。

## 13. 交付文件

最终交付至少包含：

- `README.md`：项目说明和本地快速启动；
- `compose.yaml`：应用与 ONLYOFFICE Docs 编排；
- `.env.example`：无敏感信息的完整配置示例；
- `src/`：后端应用；
- `public/`：文件管理页面；
- `public/js/onlyoffice-editor.js`：可复用前端库；
- `public/js/onlyoffice-editor.d.ts`：前端库类型声明；
- `templates/blank.docx` 和 `templates/blank.xlsx`：新建文件模板；
- `tests/`：自动化测试；
- `docs/research-report.md`：产品、API、部署方式和选型调研；
- `docs/linux-deployment.md`：Ubuntu Docker Compose 部署手册；
- `docs/backend-installation.md`：后端安装、配置、API 和 callback 说明；
- `docs/frontend-library.md`：前端 JavaScript 库 API、事件和 Word/Excel 示例；
- `docs/demo-guide.md`：本地演示步骤和验收结果；
- `docs/troubleshooting.md`：排错手册。

## 14. 官方依据

- Docs API 基础概念：<https://api.onlyoffice.com/docs/docs-api/get-started/basic-concepts/>
- Docs 工作原理：<https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/>
- `DocsAPI.DocEditor`：<https://api.onlyoffice.com/docs/docs-api/usage-api/doceditor/>
- document 配置：<https://api.onlyoffice.com/docs/docs-api/usage-api/config/document/>
- editor 配置：<https://api.onlyoffice.com/docs/docs-api/usage-api/config/editor/>
- 编辑器事件：<https://api.onlyoffice.com/docs/docs-api/usage-api/config/events/>
- callback handler：<https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/>
- Docker 安装：<https://helpcenter.onlyoffice.com/docs/installation/docs-community-install-docker.aspx>
- Linux 系统要求：<https://helpcenter.onlyoffice.com/docs/installation/docs-community-sys-reqs-linux.aspx>
- 官方集成示例：<https://github.com/ONLYOFFICE/document-server-integration>
- Community Edition Docker 标签：<https://hub.docker.com/r/onlyoffice/documentserver/tags>

## 15. 完成标准

只有在以下条件全部满足时项目才算完成：

- Windows 本地 Docker Compose 可启动；
- Word 和 Excel 的完整文件闭环通过实际演示；
- 自动化测试与健康检查通过；
- Ubuntu Docker Compose 部署说明经过命令级自查；
- 后端安装文档能够从空白环境指导到服务健康；
- `OnlyOfficeEditor` 可由示例页面独立调用，并有完整中文 API 文档；
- 调研报告明确 ONLYOFFICE Docs 与 DocSpace/Workspace 的边界及本项目选型理由；
- 文档中的地址、端口、环境变量、命令和实际代码保持一致。
