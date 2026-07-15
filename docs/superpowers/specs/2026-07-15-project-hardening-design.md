# ONLYOFFICE 演示项目针对性加固设计

## 目标

在不改变“可供新手学习和演示的 ONLYOFFICE 文档库”定位、不引入数据库或用户系统的前提下，修复当前审查发现的安全、并发、性能和交付问题，并直接合入仓库默认 `master` 分支。

## 范围

本次包含以下改动：

1. Compose 默认只把应用和 Document Server 端口绑定到 `127.0.0.1`，另提供明确的 LAN/IP 试运行覆盖文件。
2. ONLYOFFICE callback 保存文件前必须确认 callback 的 document key 等于当前文件的 `<id>-<revision>`，旧编辑会话不得覆盖较新版本。
3. 文件列表只读取 metadata；文件下载在一次仓储调用中返回 metadata 和内容，避免当前的重复正文读取和哈希。
4. 保留 `/health` 兼容入口，新增存活与就绪检查；就绪检查验证模板、存储目录和 Document Server 健康状态。
5. 新增一页从空环境到 Word/Excel 首次编辑的快速启动文档，并让 README、新手指南和高级指南互相正确导航。
6. 增加 GitHub Actions、Dependabot、CHANGELOG，并统一文本换行规则。
7. 所有行为变更先写会失败的测试，再写最小实现；最终运行完整测试、覆盖率、Compose 解析和文档链接检查。

本次不加入登录、用户权限、数据库、审计、版本历史或多实例状态同步。现有“不得未经认证直接暴露公网”的限制继续保留并强化。

## 设计

### 网络暴露

`compose.yaml` 作为安全的本机默认配置，端口仅监听回环地址。新增 `compose.lan.yaml`，通过完整端口覆盖把 3000/8080 发布到所有网卡；Linux 新手指南只在可信来源受云安全组和防火墙限制时使用该覆盖文件。正式 HTTPS 部署仍按高级指南绑定回环地址并经反向代理访问。

### callback 并发控制

`CallbackService` 在同一文件互斥锁内读取当前 metadata，再比较 callback key。只有 key 严格等于当前 `<id>-<revision>` 才下载并替换内容。状态 1/4 仍按 ONLYOFFICE 生命周期维护演示用活动状态。这样可以拒绝迟到或重放的旧保存，同时保留现有 JWT、下载 origin 白名单、大小限制和 OOXML 校验。

### 仓储读取

仓储增加只校验 metadata 形状的内部读取路径，`list()` 不再为每个文件读取全文并计算 SHA-256。内容下载使用一个返回 `{ metadata, content }` 的方法完成一次一致性校验，路由不再先 `get()` 后再次 `readContent()`。创建、上传和 callback 保存仍进行完整 OOXML 与 SHA-256 校验。

### 健康检查

`/health/live` 只证明 Node.js HTTP 进程可响应；`/health/ready` 调用注入的 readiness 检查器，确认仓储可用、模板有效，并请求 Document Server 的 `/healthcheck`。原 `/health` 保持存活检查语义以兼容现有 Compose 和文档。依赖故障时 readiness 返回 503，但不泄漏密钥、内部路径或底层异常。

### 文档与仓库维护

快速启动页只保留安装、配置、启动、Word/Excel 验收和停止服务的主线。现有长指南继续承担解释、排错和生产部署内容。CI 在 Ubuntu 上安装固定 Node 主版本、执行 `npm ci`、测试和覆盖率；Dependabot分别跟踪 npm、GitHub Actions 和 Docker。仓库不自动选择开源许可证，因为许可证属于所有者的法律授权决定。

## 错误处理

- 旧 callback 按 ONLYOFFICE 协议返回 HTTP 200 和 `{"error":1}`，并只记录安全字段。
- readiness 的任一检查失败返回 HTTP 503 和稳定错误结构。
- LAN 覆盖文件不得改变容器内部 URL、JWT 或存储挂载。
- 文档命令不得打印真实 JWT，也不得建议把未认证应用直接暴露公网。

## 验收标准

1. 旧 revision callback 的回归测试先失败，修复后通过，且不下载、不写入文件。
2. 文件列表不读取正文，单次下载不重复完整校验。
3. `/health`、`/health/live` 正常返回；readiness 成功返回 200、失败返回 503。
4. 默认 Compose 只监听 `127.0.0.1`；LAN 覆盖文件能生成 0.0.0.0 发布端口。
5. README 能在快速启动、新手教程、开发文档之间清晰导航。
6. GitHub Actions 和 Dependabot 配置语法完整，文本换行规则覆盖 Markdown、JavaScript、JSON 和 YAML。
7. `npm test`、覆盖率、生产依赖审计、Compose 配置解析和相对文档链接检查全部通过。

