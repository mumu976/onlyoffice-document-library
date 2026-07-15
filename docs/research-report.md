# ONLYOFFICE 集成调研报告

**调研日期：2026-07-14**

## 结论

本项目采用自托管 ONLYOFFICE Docs Community Edition 作为编辑服务，由 Express 应用负责文件管理、配置生成、JWT 和 callback 保存。Docs 的集成模型是宿主应用提供文件 URL、编辑配置和 callback URL，Document Server 在浏览器中提供编辑器并回调宿主应用（[Docs API 基础概念](https://api.onlyoffice.com/docs/docs-api/get-started/basic-concepts/)，[工作原理](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/)）。

Docs 不是 DocSpace 或 Workspace：DocSpace 是带房间、权限和协作能力的文档空间（[ONLYOFFICE DocSpace](https://www.onlyoffice.com/docspace)）；Workspace 是包含文档、项目、邮件、CRM 和日历模块的协作平台（[ONLYOFFICE Workspace](https://www.onlyoffice.com/workspace)）。本项目不部署这两个产品，只调用 Docs 编辑器 API。

## 方案比较

| 方案 | 适用范围 | 本项目判断 |
| --- | --- | --- |
| Docker Compose + Docs | 固定镜像、服务隔离、可重复启动；官方步骤见 [Docs Community Docker 安装](https://helpcenter.onlyoffice.com/docs/installation/docs-community-install-docker.aspx) | 选用，与两个服务和本地演示匹配 |
| 原生 DEB + systemd | 直接安装到 Linux 主机；入口见 [Linux 系统要求](https://helpcenter.onlyoffice.com/docs/installation/docs-community-sys-reqs-linux.aspx) | 不选，主机依赖与升级边界更宽 |
| 官方集成示例 | 展示不同语言/框架接入 Docs；见 [document-server-integration](https://github.com/ONLYOFFICE/document-server-integration) | 不直接改造，仅作为 API 参考 |

## 版本与资源

Compose 固定 `onlyoffice/documentserver:9.4.0.1`，避免 `latest` 漂移；可用标签以 [Docker Hub 官方标签页](https://hub.docker.com/r/onlyoffice/documentserver/tags) 为准。该标签是 2026-07-14 的项目锁定值，不代表未来仍为最新。

官方 Linux Docker 基线为双核 2 GHz、4 GB RAM、40 GB 可用磁盘和 4 GB Swap；见 [Linux 系统要求](https://helpcenter.onlyoffice.com/docs/installation/docs-community-sys-reqs-linux.aspx)。这是启动基线，不是并发容量承诺；并发编辑数、文档大小和转换任务需要额外压测。

Community Edition 的官方定位是本地服务器部署、适合小团队/个人使用；许可、支持和版本限制以 [官方 Docker/Community 说明](https://helpcenter.onlyoffice.com/docs/installation/docs-community-install-docker.aspx) 和 [官方 DocumentServer 版本比较](https://github.com/ONLYOFFICE/DocumentServer#onlyoffice-document-server-editions) 为准。因此生产 sizing 不能把本演示基线当作企业并发或支持承诺。本项目自身没有登录鉴权、用户权限、分享、版本历史、数据库或对象存储，公网必须先接入已认证反向代理。

## API 与选型依据

- `DocsAPI.DocEditor` 构造和销毁见 [DocEditor](https://api.onlyoffice.com/docs/docs-api/usage-api/doceditor/)。
- `documentType`、`fileType`、`key` 和 `url` 见 [document 配置](https://api.onlyoffice.com/docs/docs-api/usage-api/config/document/)。
- `mode`、`callbackUrl` 和定制项见 [editor 配置](https://api.onlyoffice.com/docs/docs-api/usage-api/config/editor/)。
- `onAppReady`、`onDocumentReady`、`onDocumentStateChange` 和 `onError` 见 [编辑器事件](https://api.onlyoffice.com/docs/docs-api/usage-api/config/events/)。
- callback 状态和响应协议见 [callback handler](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/)。

项目的 `public/js/onlyoffice-editor.js` 只封装上述浏览器 API，不复制 `api.js`；页面运行时从 `DOCUMENT_SERVER_PUBLIC_URL` 加载 `/web-apps/apps/api/documents/api.js`。自建 Express 集成器把 REST、文件目录、OOXML 校验、JWT、callback 原子保存和结构化日志放在同一边界，Compose 则提供服务隔离、健康检查和可回滚版本。

## 官方来源

[基础概念](https://api.onlyoffice.com/docs/docs-api/get-started/basic-concepts/) · [工作原理](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/) · [DocEditor](https://api.onlyoffice.com/docs/docs-api/usage-api/doceditor/) · [document 配置](https://api.onlyoffice.com/docs/docs-api/usage-api/config/document/) · [editor 配置](https://api.onlyoffice.com/docs/docs-api/usage-api/config/editor/) · [事件](https://api.onlyoffice.com/docs/docs-api/usage-api/config/events/) · [callback](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/) · [Docker 安装](https://helpcenter.onlyoffice.com/docs/installation/docs-community-install-docker.aspx) · [Linux 要求](https://helpcenter.onlyoffice.com/docs/installation/docs-community-sys-reqs-linux.aspx) · [Docker 标签](https://hub.docker.com/r/onlyoffice/documentserver/tags) · [官方示例仓库](https://github.com/ONLYOFFICE/document-server-integration)
