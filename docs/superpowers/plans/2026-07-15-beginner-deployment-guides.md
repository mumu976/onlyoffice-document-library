# ONLYOFFICE 新手部署与集成文档 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为非技术用户提供可从零执行的 Windows 与 Ubuntu 部署路径，同时保证后端安装文档、前端 JavaScript 库和使用文档与当前项目实现一致。

**Architecture:** 不修改应用代码或部署结构，只调整文档导航、新增两份新手指南，并校正现有技术文档。新手文档负责完成第一次部署和第一次 Word/Excel 操作，高级文档继续负责 API、HTTPS、认证、备份、恢复和回滚。

**Tech Stack:** Markdown、PowerShell、Ubuntu 22.04/24.04、Docker Desktop、Docker Engine、Docker Compose、ONLYOFFICE Docs Community Edition 9.4.0.1、Node.js 24、原生 JavaScript ES Modules。

## Global Constraints

- 所有改动仅限文档，不修改应用代码、`compose.yaml`、端口、API 或存储格式。
- 工作分支固定为 `codex/onlyoffice-beginner-guides`。
- Windows 路径面向未使用过 Docker 的用户，Linux 路径面向首次使用 Ubuntu 服务器的用户。
- 所有关键步骤必须写清“在哪里操作”“具体操作”“成功标志”“失败先检查什么”。
- Linux 主流程固定支持 Ubuntu 22.04/24.04 x86_64，使用 Docker 官方 apt 仓库。
- 项目镜像保持 `onlyoffice/documentserver:9.4.0.1`，不得写成 `latest`。
- 本地默认应用端口为 3000，Document Server 端口为 8080。
- `.env` 不提交到 Git；`JWT_SECRET` 至少 32 个随机字节或足够长度的随机字符。
- 必须明确应用没有登录和文件权限，IP 试运行不可作为公网正式上线方案。
- 所有当前版本、系统要求和安装步骤优先引用 Docker、ONLYOFFICE、GitHub 官方资料。

---

### Task 1: README 新手导航

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: 新手指南文件路径和现有高级文档路径。
- Produces: Windows、Linux、开发/运维三个入口。

- [ ] **Step 1: 重写首屏说明**

用普通语言说明这是可自建的 Word/Excel 文档库演示，并在首屏明确它没有登录和权限控制。

- [ ] **Step 2: 添加三个入口**

链接到 `docs/windows-beginner-guide.md`、`docs/linux-beginner-guide.md`，以及保留的调研、后端、前端与高级部署资料。

- [ ] **Step 3: 删除过时声明并检查链接**

移除“Task 11 记录前不宣称成功”等已与验收事实冲突的句子。

---

### Task 2: Windows 从零使用指南

**Files:**
- Create: `docs/windows-beginner-guide.md`

**Interfaces:**
- Consumes: `compose.yaml`、`.env.example`、Docker Desktop 官方安装要求和项目验收流程。
- Produces: 从安装 Docker Desktop到第一次 Word/Excel 保存、日常启停和安全更新的完整路径。

- [ ] **Step 1: 写准备与安装说明**

说明支持的 Windows、WSL 2、内存/磁盘、Docker Desktop 下载与启动成功标志，并链接官方页面。

- [ ] **Step 2: 写项目下载与配置说明**

提供 GitHub Download ZIP 路径、固定解压目录、PowerShell 打开方法、`.env` 复制和随机密钥生成命令。

- [ ] **Step 3: 写启动与首次使用说明**

提供 `docker compose config`、`up -d --build`、`ps`、健康检查和浏览器访问步骤；指导新建 Word 与 Excel并确认保存。

- [ ] **Step 4: 写日常维护和故障入口**

区分停止、重新启动、关闭并保留数据、更新前备份，以及 Docker 未运行、端口冲突、网页或编辑器打不开的排查顺序。

---

### Task 3: Ubuntu 从零部署指南

**Files:**
- Create: `docs/linux-beginner-guide.md`

**Interfaces:**
- Consumes: Docker 官方 Ubuntu 安装流程、ONLYOFFICE 官方 Docker 要求、项目 Compose 配置和高级 Linux 手册。
- Produces: Ubuntu 22.04/24.04 x86_64 的 IP 试运行路径与正式上线安全入口。

- [ ] **Step 1: 写服务器准备与连接说明**

说明建议资源、系统/架构检查、公网 IP、SSH、云平台安全组，并解释终端和服务器控制台的区别。

- [ ] **Step 2: 写 Docker 官方仓库安装流程**

按 Docker 官方 apt 仓库步骤安装 Docker Engine、Buildx 和 Compose 插件，逐步给出成功输出和失败检查。

- [ ] **Step 3: 写项目下载、配置和权限**

将项目放入 `/opt/onlyoffice-demo`，生成 `.env`，解释服务器 IP 如何写入 `DOCUMENT_SERVER_PUBLIC_URL`，创建 `storage` 并设置容器用户可写权限。

- [ ] **Step 4: 写启动、健康检查与第一次操作**

验证 Compose、构建并启动、等待两个容器健康，通过服务器 IP 访问应用和 Docs，完成 Word/Excel 操作。

- [ ] **Step 5: 写网络安全与上线边界**

说明云安全组与 Docker/ufw 的差异；IP 试运行只允许可信来源，正式公网使用必须进入 HTTPS、认证反向代理、备份与回滚高级章节。

- [ ] **Step 6: 写日常运维和排错顺序**

提供状态、日志、启动、停止、重启命令，并按“Docker → 容器健康 → 端口 → 浏览器 → callback/JWT”顺序排查。

---

### Task 4: 后端与前端集成文档复核

**Files:**
- Modify: `docs/backend-installation.md`
- Modify: `docs/frontend-library.md`
- Modify: `docs/research-report.md`

**Interfaces:**
- Consumes: `src/config.js`、`src/routes/`、`public/js/onlyoffice-editor.js`、`.d.ts` 和官方 Docs API。
- Produces: 与实际实现一致的安装、API、JavaScript 库和调研资料。

- [ ] **Step 1: 对照后端实现复核安装文档**

核对 Node 版本、环境变量、九个接口、JWT、callback 状态、日志、备份范围和 Windows/Linux 命令；只修正实际不一致或新手难以执行之处。

- [ ] **Step 2: 对照库实现复核前端文档**

核对导出成员、构造参数、`open`、`close`、`isOpen`、四类事件、Word/Excel 示例、CSP 和生命周期说明。

- [ ] **Step 3: 更新调研日期与官方基线表述**

保留 2026-07-14 原始调研日期，同时增加本次复核日期；区分 ONLYOFFICE 系统要求页的最低值与 Docker 安装页对生产/完整环境的更保守建议。

---

### Task 5: 文档质量与项目回归验证

**Files:**
- Verify: `README.md`
- Verify: `docs/*.md`
- Verify: application tests

**Interfaces:**
- Consumes: 全部修改后的 Markdown 文档。
- Produces: 可审阅的分支提交和验证结果。

- [ ] **Step 1: 检查文件和相对链接**

运行脚本解析 Markdown 相对链接，确认目标文件存在；人工检查三个 README 入口。

- [ ] **Step 2: 检查配置一致性和占位符**

运行：

```powershell
rg -n "localhost:3000|localhost:8080|DOCUMENT_SERVER_PUBLIC_URL|DOCUMENT_SERVER_INTERNAL_URL|APP_INTERNAL_URL|JWT_SECRET|onlyoffice/documentserver:9.4.0.1" README.md docs .env.example compose.yaml
rg -n "TBD|TODO|待补充|稍后补充" README.md docs
```

预期：配置与项目一致，第二条没有未完成占位符。

- [ ] **Step 3: 验证命令与应用回归**

运行：

```powershell
docker compose config --quiet
npm.cmd test
```

预期：Compose 配置退出码为 0；102 项测试通过、0 失败。

- [ ] **Step 4: 检查改动范围并提交**

确认 `git diff --name-only` 只有 README、文档和本计划，提交到 `codex/onlyoffice-beginner-guides`，不推送、不合并。
