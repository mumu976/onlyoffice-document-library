# Windows 新手指南：从零启动 ONLYOFFICE 文档库

这份指南假设你没有使用过 Docker，也不需要懂 Node.js。完成后，你会在本机浏览器中打开文档库，并实际新建一个 Word 和一个 Excel 文件。

整个过程通常需要 15～40 分钟。第一次启动要下载和初始化 ONLYOFFICE 镜像，网络较慢时会更久。

## 开始前先确认

你需要：

- 满足 Docker 官方页面所列版本和版本类别的 64 位 Windows 10 或 Windows 11；2026-07-15 复核时，WSL 2 路径要求 WSL 2.1.5 或更高，Windows 10 22H2（build 19045）或 Windows 11 23H2（build 22631）及更高的受支持版本；
- 64 位处理器，BIOS/UEFI 已开启虚拟化；
- 至少 8 GB 内存；
- 建议预留 50 GB 磁盘空间；
- 可以下载数 GB Docker 镜像的网络；
- 浏览器，例如 Edge 或 Chrome。

Docker 当前的精确系统要求可能变化，请以 [Docker Desktop for Windows 官方安装页](https://docs.docker.com/desktop/setup/install/windows-install/)为准。公司电脑还需要确认 Docker Desktop 的许可和管理员策略。

## 第 1 步：安装并启动 Docker Desktop

**要做什么：** 安装负责运行应用和 ONLYOFFICE 的容器环境。

**在哪里操作：** Docker 官方网页和 Windows 安装界面。

1. 打开 [Docker Desktop for Windows 官方安装页](https://docs.docker.com/desktop/setup/install/windows-install/)。
2. 下载适合你处理器的 Windows 安装包；大多数电脑选择 x86_64。
3. 双击安装包。普通个人电脑优先使用推荐的 WSL 2 后端。
4. 安装完成后，从开始菜单打开 **Docker Desktop**，接受适用的许可条款。
5. 等待界面显示 Docker Engine 正常运行。

**成功时看到什么：** Docker Desktop 不再显示“Starting”，状态为正在运行；右下角托盘中能看到 Docker 图标。

**如果不成功：**

- 如果提示 WSL 版本过旧，以管理员身份打开 PowerShell，运行 `wsl --update`，然后重启电脑；
- 如果提示未开启虚拟化，进入 BIOS/UEFI 打开 Intel VT-x、Intel Virtualization Technology 或 AMD-V；
- 公司电脑若禁止虚拟化或安装软件，需要联系管理员。

## 第 2 步：确认 Docker 命令可用

**要做什么：** 确认 Docker Desktop 不只是安装完成，而是真的能接受命令。

**在哪里操作：** Windows PowerShell。

从开始菜单搜索并打开 **PowerShell**，执行：

```powershell
docker version
docker compose version
```

**成功时看到什么：** 第一条同时显示 `Client` 和 `Server` 信息，第二条显示 `Docker Compose version`。

**如果不成功：**

- 出现“找不到 docker”时，关闭并重新打开 PowerShell；
- 出现无法连接 Docker Engine、pipe 或 daemon 的错误时，先打开 Docker Desktop并等它启动完成；
- Docker Desktop 处于 Windows containers 模式时，切回 Linux containers。

## 第 3 步：从 GitHub 下载并解压项目

**要做什么：** 把项目文件放到路径简单、容易找到的位置。

**在哪里操作：** GitHub 网页和 Windows 文件资源管理器。

1. 打开 [项目 GitHub 页面](https://github.com/mumu976/onlyoffice-document-library)。
2. 点击绿色 **Code** 按钮，再点击 **Download ZIP**。这是 GitHub 官方支持的下载方式，说明见 [Downloading files from GitHub](https://docs.github.com/en/get-started/start-your-journey/downloading-files-from-github)。
3. 下载完成后右键 ZIP，选择“全部解压”。
4. 建议把解压后的目录移动并改名为：

```text
C:\onlyoffice-demo
```

**成功时看到什么：** `C:\onlyoffice-demo` 内能看到 `compose.yaml`、`.env.example`、`README.md`、`src` 和 `docs`。

**如果不成功：**

- 如果目录中只有另一个同名文件夹，继续进入内层，直到看到 `compose.yaml`；
- 不要把命令直接粘贴到 GitHub 网页；后续命令都在本机 PowerShell 执行；
- 路径尽量不要放在 OneDrive 同步目录，避免同步锁和权限问题。

## 第 4 步：在项目目录打开 PowerShell

**要做什么：** 确保后续命令作用于正确项目。

**在哪里操作：** Windows 文件资源管理器。

进入 `C:\onlyoffice-demo`，点击资源管理器地址栏，输入 `powershell` 后按 Enter。新窗口打开后执行：

```powershell
Get-Location
Test-Path .\compose.yaml
```

**成功时看到什么：** 路径是 `C:\onlyoffice-demo`，第二条返回 `True`。

**如果不成功：** 使用下面的命令手动进入目录：

```powershell
Set-Location C:\onlyoffice-demo
```

## 第 5 步：创建本机配置和随机密钥

**要做什么：** 创建不会上传到 GitHub 的本机配置，并自动生成用于应用和 ONLYOFFICE 相互验证的随机密钥。

**在哪里操作：** 刚才打开的项目 PowerShell。

整体复制并执行下面这组命令：

```powershell
Copy-Item .env.example .env
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
(Get-Content .env) -replace '^JWT_SECRET=.*$', "JWT_SECRET=$secret" | Set-Content .env -Encoding ascii
Remove-Variable bytes, rng, secret
Select-String -Path .env -Pattern '^JWT_SECRET=','^DOCUMENT_SERVER_PUBLIC_URL='
```

`.env` 只属于这台电脑，不要发送给别人，也不要提交到 GitHub。本机使用时保持：

```text
DOCUMENT_SERVER_PUBLIC_URL=http://localhost:8080
```

**成功时看到什么：** 最后一条命令显示一个较长的 `JWT_SECRET`，以及 `http://localhost:8080`。不要把真实密钥截图发到公开渠道。

**如果不成功：**

- 如果提示 `.env.example` 不存在，说明当前 PowerShell 不在项目目录；
- 如果 `.env` 已存在，先确认它是否是你正在使用的配置，不要直接覆盖；
- 不要把 `JWT_SECRET` 改成中文、空格或短密码。

## 第 6 步：检查配置并启动

**要做什么：** 先让 Docker 检查配置，再启动应用和编辑器两个服务。

**在哪里操作：** 项目 PowerShell；Docker Desktop 必须保持运行。

先执行配置检查：

```powershell
docker compose config --quiet
```

没有输出并返回命令提示符，就是通过。然后执行：

```powershell
docker compose up -d --build
```

第一次会下载 Node.js 和 ONLYOFFICE 镜像。进度在一段时间内不动不一定是失败，不要关闭 Docker Desktop。

**成功时看到什么：** 命令最终返回提示符，并出现 app、document-server 已启动或创建的信息。

**如果不成功：**

- 出现连接 daemon 或 pipe 失败时，先启动 Docker Desktop；
- 出现拉取镜像超时，确认网络、代理和 Docker Desktop 的代理设置；
- 出现 `JWT_SECRET` 错误，重新执行第 5 步生成密钥。

## 第 7 步：等两个服务健康

**要做什么：** 确认文件管理应用和 ONLYOFFICE 编辑器都已准备好。

**在哪里操作：** 项目 PowerShell。

执行：

```powershell
docker compose ps
```

第一次启动 ONLYOFFICE 往往需要几分钟。可以每隔约 20 秒重新执行一次，不要连续快速刷新。

**成功时看到什么：** `app` 和 `document-server` 两行的状态最终都包含 `healthy`，端口分别包含 `3000->3000` 和 `8080->80`。

还可以直接检查：

```powershell
curl.exe -fsS http://localhost:3000/health
curl.exe -fsS http://localhost:8080/healthcheck
```

预期分别看到包含 `ok` 的 JSON 和 `true`。

**如果不成功：**

- 先等待 3～5 分钟，再执行 `docker compose ps`；
- 查看最近日志：`docker compose logs --tail=100 app document-server`；
- 如果提示 3000 或 8080 端口被占用，参考[故障排查手册](troubleshooting.md)。

## 第 8 步：完成第一次 Word 和 Excel 操作

**要做什么：** 验证“打开网页”之外，编辑和保存也真的可用。

**在哪里操作：** Windows 浏览器。

1. 打开 `http://localhost:3000`。
2. 点击“新建 Word”，输入文件名，例如“第一次测试”。
3. 打开文档，输入一句话，等待页面状态提示修改已同步，然后关闭编辑器。
4. 重新打开这个 Word，确认内容仍存在。
5. 点击“新建 Excel”，在 A1 输入 `10`、A2 输入 `20`，在 A3 输入 `=SUM(A1:A2)`。
6. 确认 A3 显示 `30`，等待同步后关闭，再重新打开检查。
7. 尝试下载文件，并用本机 Office 软件打开。

**成功时看到什么：** Word 内容和 Excel 公式在重新打开后仍保留；下载得到 `.docx` 和 `.xlsx` 文件。

**如果不成功：**

- 文件列表能打开但编辑器空白：确认 `http://localhost:8080/healthcheck` 返回 `true`；
- 修改后立即强制关闭网页可能来不及回存，请等待同步提示再关闭；
- 查看浏览器开发者工具 Network/Console 和 `docker compose logs`，再对照[故障排查手册](troubleshooting.md)。

## 日常启动、停止和查看状态

每次操作前都先进入 `C:\onlyoffice-demo`，并确认 Docker Desktop 已启动。

| 目的 | 在项目 PowerShell 执行 | 说明 |
| --- | --- | --- |
| 启动 | `docker compose up -d` | 已构建过时通常不需要再次 `--build` |
| 查看状态 | `docker compose ps` | 两项应为 healthy |
| 查看日志 | `docker compose logs --tail=100` | 排查启动或保存问题 |
| 重启 | `docker compose restart` | 配置未改变时使用 |
| 停止但保留容器 | `docker compose stop` | 下次用 `start` 或 `up -d` |
| 关闭并移除容器 | `docker compose down` | 文档和命名卷仍保留 |

不要运行 `docker compose down -v`，`-v` 会删除 ONLYOFFICE 的命名卷。不要手工删除 `storage`，你的 Word 和 Excel 正文保存在这里。

## 更新前先备份

ZIP 下载方式不会自动更新。更新前先关闭编辑器，确认没有人正在编辑，然后在项目 PowerShell 执行：

```powershell
docker compose down
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Item -ItemType Directory -Force "C:\onlyoffice-backup-$stamp" | Out-Null
Copy-Item .env, compose.yaml -Destination "C:\onlyoffice-backup-$stamp"
Copy-Item storage -Destination "C:\onlyoffice-backup-$stamp\storage" -Recurse
Write-Host "备份位置：C:\onlyoffice-backup-$stamp"
```

确认备份目录中有 `.env`、`compose.yaml` 和 `storage` 后，再下载新版本到另一个目录。不要直接覆盖唯一一份旧目录。高级的完整备份与回滚方法见 [Linux 高级部署手册](linux-deployment.md)，其原则同样适用于 Docker 卷。

## 常见问题的最短检查顺序

1. Docker Desktop 是否已经运行；
2. PowerShell 是否位于包含 `compose.yaml` 的目录；
3. `docker compose config --quiet` 是否通过；
4. `docker compose ps` 中哪一个服务不是 healthy；
5. `docker compose logs --tail=100 app document-server` 的最后一段错误；
6. 3000、8080 端口是否被其他程序占用。

更多症状与处理方法见[故障排查手册](troubleshooting.md)。
