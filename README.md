<div align="center">

# ONLYOFFICE 文档库

一套可以在本机或 Linux 服务器部署的 Word / Excel 文档库演示。<br>
它把文件管理、ONLYOFFICE 在线编辑、保存回调和从入门到部署的中文文档放在同一个项目里。

[快速开始](docs/quick-start.md) · [Windows 新手指南](docs/windows-beginner-guide.md) · [Linux 部署指南](docs/linux-beginner-guide.md) · [文档目录](docs/README.md)

</div>

> [!IMPORTANT]
> 本项目是可运行的集成示例，不含登录、租户、权限和审计。它适合本机、可信局域网与二次开发；正式公网部署必须增加 HTTPS、认证网关、访问控制和备份。

## 你可以用它做什么

| 文档工作台 | 集成与部署 |
| --- | --- |
| 新建 Word（`.docx`）和 Excel（`.xlsx`） | Docker Compose 一次启动应用与 Document Server |
| 上传、搜索、筛选、排序和切换列表/卡片视图 | JWT 编辑配置与保存回调验证 |
| 在浏览器中编辑、保存、下载和删除文件 | OOXML 结构、扩展名、MIME 与大小校验 |
| 最近文档与本地中文文档中心 | Windows、Ubuntu、Nginx HTTPS、备份与回滚指南 |

## 实际运行效果

下面是本项目本地运行并完成保存验收时的截图，不是静态界面稿。

| Word 在线编辑 | Excel 在线编辑 |
| --- | --- |
| ![ONLYOFFICE Word 在线编辑验收](docs/evidence/word-editor.png) | ![ONLYOFFICE Excel 在线编辑验收](docs/evidence/excel-editor.png) |

完整操作记录、服务状态和文件保存证据见[本地演示与验收记录](docs/demo-guide.md)。

## 10 分钟启动

开始前需要 Docker Desktop（Windows）或 Docker Engine + Compose 插件（Linux），建议至少准备 4 GB 可用内存和 10 GB 空闲磁盘。

### Windows PowerShell

```powershell
Copy-Item .env.example .env
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
(Get-Content .env) -replace '^JWT_SECRET=.*$', "JWT_SECRET=$secret" | Set-Content .env
Remove-Variable bytes, rng, secret
docker compose up -d --build
docker compose ps
curl.exe -fsS http://localhost:3000/health/ready
```

### Ubuntu / Linux 本机验证

```bash
cp .env.example .env
SECRET="$(openssl rand -hex 32)"
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" .env
unset SECRET
mkdir -p storage
sudo chown -R 1000:1000 storage
sudo docker compose up -d --build
sudo docker compose ps
curl -fsS http://127.0.0.1:3000/health/ready
```

健康检查返回 `{"data":{"status":"ready"}}` 后，打开 <http://localhost:3000>。第一次启动需要下载 ONLYOFFICE 镜像，等待时间取决于网络速度。

想通过服务器 IP 访问或正式上线，不要直接改端口后暴露到公网，请继续阅读 [Linux 新手部署指南](docs/linux-beginner-guide.md) 和 [Linux 高级部署指南](docs/linux-deployment.md)。

## 第一次验收

1. 点击“新建 Word”，输入内容，等待同步后关闭并重新打开。
2. 点击“新建 Excel”，填写数字和求和公式，等待同步后重新打开。
3. 下载两个文件，确认本地 Office 兼容软件能够打开。
4. 打开 <http://localhost:3000/guides>，确认部署和开发文档可以在本地阅读。

## 文档导航

<table>
  <tr>
    <td width="72"><img src="public/assets/icons/monitor.svg" width="34" alt="Windows"></td>
    <td><strong><a href="docs/windows-beginner-guide.md">Windows 新手指南</a></strong><br>从 Docker Desktop 安装到第一次 Word、Excel 编辑，适合第一次接触 Docker 的用户。</td>
  </tr>
  <tr>
    <td><img src="public/assets/icons/docker.svg" width="34" alt="Docker"></td>
    <td><strong><a href="docs/quick-start.md">10 分钟快速启动</a></strong><br>已有 Docker，希望用最短路线完成启动、健康检查和功能验收。</td>
  </tr>
  <tr>
    <td><img src="public/assets/icons/linux.svg" width="34" alt="Linux"></td>
    <td><strong><a href="docs/linux-beginner-guide.md">Linux 新手部署</a></strong> · <strong><a href="docs/linux-deployment.md">高级部署</a></strong><br>Ubuntu 安装、IP 试运行、Nginx HTTPS、防火墙、备份、恢复与回滚。</td>
  </tr>
  <tr>
    <td><img src="public/assets/icons/javascript.svg" width="34" alt="JavaScript"></td>
    <td><strong><a href="docs/backend-installation.md">后端与 REST API</a></strong> · <strong><a href="docs/frontend-library.md">前端 JavaScript 库</a></strong><br>理解文件接口、JWT、callback、编辑器封装和二次开发入口。</td>
  </tr>
  <tr>
    <td><img src="public/assets/icons/eye.svg" width="34" alt="调研与验收"></td>
    <td><strong><a href="docs/research-report.md">选型调研</a></strong> · <strong><a href="docs/demo-guide.md">演示验收</a></strong> · <strong><a href="docs/troubleshooting.md">故障排查</a></strong><br>查看方案边界、实测证据和常见故障处理顺序。</td>
  </tr>
</table>

所有文档的阅读顺序和适用对象见[文档中心索引](docs/README.md)。

## 系统如何协作

```mermaid
flowchart LR
    U["浏览器"] -->|"文件管理 REST API"| A["Node.js 应用"]
    U -->|"加载编辑器"| D["ONLYOFFICE Document Server"]
    A -->|"生成带 JWT 的编辑配置"| U
    D -->|"读取文档"| A
    D -->|"保存回调 + JWT"| A
    A -->|"元数据与 OOXML 文件"| S["本地 storage"]
```

- 应用服务负责文件生命周期、编辑配置、回调校验和持久化。
- Document Server 负责浏览器中的 Word / Excel 编辑体验。
- 浏览器不会直接读取 `storage`，Document Server 通过应用内部地址获取和保存文件。

更完整的接口与时序说明见[后端安装与 REST API](docs/backend-installation.md)和[前端 JavaScript 库](docs/frontend-library.md)。

## 常用命令

```text
docker compose up -d --build   # 构建并启动
docker compose ps             # 查看服务健康状态
docker compose logs -f app    # 查看应用日志
docker compose down           # 停止但保留数据
npm test                      # 运行自动化测试
npm run check                 # 测试与覆盖率检查
```

停止时不要添加 `-v`，也不要直接删除 `storage`，否则可能丢失文档或 ONLYOFFICE 数据。

## 技术栈与目录

- Node.js 24+、Express 5、原生 ES modules
- ONLYOFFICE Document Server 9.4.0.1
- Docker Compose、JWT、Markdown-it
- 无前端框架：HTML、CSS 与浏览器原生 JavaScript

```text
public/       文档工作台、文档中心和前端库
src/          REST API、回调处理、文件仓库和配置
docs/         新手指南、部署文档、调研与验收证据
tests/        API、存储、编辑器封装和文档链接测试
storage/      运行时文档数据（不要提交或随意删除）
templates/    Word、Excel 空白模板
```

## 安全边界

- 默认 Compose 只把 `3000` 和 `8080` 监听在本机 `127.0.0.1`。
- JWT 密钥必须由你生成，至少 32 个随机字节，不能使用示例值。
- Linux IP 试运行只能对可信来源开放；正式部署应由反向代理统一提供 HTTPS 和认证。
- 备份必须同时覆盖 `storage` 与 ONLYOFFICE named volume，并在恢复后重新验证 Word / Excel 保存。

上线前请按[高级部署指南的 HTTPS、备份与回滚章节](docs/linux-deployment.md)逐项执行。

## 项目状态与贡献

当前目标是提供一套可理解、可验证、可继续开发的 ONLYOFFICE 集成基线。功能变化记录在 [CHANGELOG.md](CHANGELOG.md)，第三方图标许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。提交修改前请先运行 `npm run check`，并确保 Windows 或 Linux 指南中的命令仍与 Compose 配置一致。
