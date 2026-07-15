# Windows 本地使用 ONLYOFFICE：从安装到编辑 Word、Excel

这份指南适合没有使用过 Docker、也不准备先学习代码的人。完成后，你会在自己的 Windows 电脑上打开一个文档库，并实际完成 Word、Excel 的新建、编辑、保存、重新打开和下载。

项目会启动两个服务：

| 地址 | 作用 |
| --- | --- |
| `http://localhost:3000` | 文件列表、新建、上传、下载和删除 |
| `http://localhost:8080` | ONLYOFFICE Word、Excel 编辑器 |

它们都只在你的电脑上运行。第一次启动需要下载较大的 ONLYOFFICE 镜像，通常比以后启动慢很多。

## 一、开始前确认电脑是否合适

建议准备：

- 满足 Docker Desktop 官方要求的 64 位 Windows 10 或 Windows 11；
- 8 GB 或更多内存；
- 约 50 GB 可用磁盘；
- BIOS/UEFI 中已开启 CPU 虚拟化；
- 能稳定下载数 GB 镜像的网络；
- Edge、Chrome 等现代浏览器。

2026-07-15 复核时，Docker Desktop 的 WSL 2 路径要求 WSL 2.1.5 或更高，并列出了受支持的 Windows 版本和版本类别。要求可能继续变化，安装前应查看 [Docker Desktop for Windows 官方页面](https://docs.docker.com/desktop/setup/install/windows-install/)。公司电脑还要确认软件安装策略和 Docker Desktop 许可是否适用。

### 检查 Windows、WSL 和虚拟化

按 `Win + R`，输入 `winver`，确认 Windows 版本。然后打开 PowerShell，执行：

```powershell
wsl --version
```

如果能看到 WSL 版本信息，说明 WSL 已安装。如果提示没有 WSL 或版本过旧，以管理员身份打开 PowerShell，执行：

```powershell
wsl --install
wsl --update
```

系统要求重启时先重启，再继续安装 Docker Desktop。

虚拟化可以在“任务管理器 → 性能 → CPU”中检查。右下角应显示“虚拟化：已启用”。如果没有启用，需要进入 BIOS/UEFI 打开 Intel Virtualization Technology、VT-x 或 AMD-V；不同电脑的入口不同，应查阅电脑厂商说明。

## 二、安装并确认 Docker Desktop

### 1. 安装 Docker Desktop

1. 打开 [Docker Desktop for Windows 官方安装页](https://docs.docker.com/desktop/setup/install/windows-install/)；
2. 下载适合处理器的安装包，大多数普通电脑选择 x86_64；
3. 双击安装包，普通个人电脑使用推荐的 WSL 2 后端；
4. 安装完成后，从开始菜单打开 Docker Desktop；
5. 阅读并接受适用的许可条款，等待 Docker Engine 启动完成。

Docker Desktop 第一次打开时可能继续安装 WSL 组件或要求注销、重启。完成这些操作后重新打开，直到界面不再显示 `Starting`。

### 2. 用命令确认 Docker 真的可用

重新打开一个普通 PowerShell，执行：

```powershell
docker version
docker compose version
```

正确结果应同时满足：

- `docker version` 中既有 `Client`，也有 `Server`；
- 第二条显示 `Docker Compose version`。

只有 Client、没有 Server，或者出现 pipe、daemon、engine 连接错误，通常表示 Docker Desktop 尚未启动完成。先回到 Docker Desktop 查看状态，不要反复重装项目。

本项目使用 Linux 容器。如果 Docker Desktop 菜单显示可以“Switch to Linux containers”，说明当前处在 Windows containers 模式，应先切换到 Linux containers。

## 三、下载项目并放到固定目录

不熟悉 Git 时，直接下载 ZIP 即可：

1. 打开 [项目 GitHub 页面](https://github.com/mumu976/onlyoffice-document-library)；
2. 点击绿色 **Code**，再点击 **Download ZIP**；
3. 下载完成后右键 ZIP，选择“全部解压”；
4. 把真正包含 `compose.yaml` 的那层文件夹移动并改名为：

```text
C:\onlyoffice-demo
```

GitHub 对 ZIP 下载方式的说明见 [Downloading files from GitHub](https://docs.github.com/en/get-started/start-your-journey/downloading-files-from-github)。ZIP 是当前代码的快照，不会自动更新。

打开 `C:\onlyoffice-demo` 后，应该直接看到：

```text
compose.yaml
.env.example
README.md
src
public
docs
```

如果只看到另一个同名文件夹，继续进入内层，直到找到 `compose.yaml`。不建议把项目放在 OneDrive 同步目录、网络盘或中文层级很深的路径中，文件同步和权限可能干扰 Docker 挂载。

## 四、创建这台电脑自己的配置

### 1. 在正确目录打开 PowerShell

在文件资源管理器进入 `C:\onlyoffice-demo`，点击地址栏，输入 `powershell` 后按 Enter。

执行：

```powershell
Get-Location
Test-Path .\compose.yaml
```

路径应为 `C:\onlyoffice-demo`，第二条应返回 `True`。如果不是，执行：

```powershell
Set-Location C:\onlyoffice-demo
```

### 2. 复制 `.env` 并生成随机密钥

`.env` 保存这台电脑自己的地址和 JWT 密钥，不会提交到 GitHub。首次安装时整体复制下面的命令：

```powershell
if (Test-Path .env) {
    throw '.env 已存在，请先确认它是否是正在使用的配置，不要直接覆盖。'
}

Copy-Item .env.example .env
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
(Get-Content .env) -replace '^JWT_SECRET=.*$', "JWT_SECRET=$secret" | Set-Content .env -Encoding ascii

$savedSecret = ((Get-Content .env | Where-Object { $_ -match '^JWT_SECRET=' }) -replace '^JWT_SECRET=', '')
if ($savedSecret.Length -lt 32) { throw 'JWT_SECRET 长度不足' }
Write-Host "JWT_SECRET 长度：$($savedSecret.Length)，配置正常"
Select-String -Path .env -Pattern '^DOCUMENT_SERVER_PUBLIC_URL='

Remove-Variable bytes, rng, secret, savedSecret
```

预期看到：

```text
JWT_SECRET 长度：64，配置正常
DOCUMENT_SERVER_PUBLIC_URL=http://localhost:8080
```

这里特意不打印真实密钥。不要把 `.env`、密钥或包含密钥的截图发到公开渠道。本机使用时，三个地址保持模板默认值，不要把内部的 `app`、`document-server` 改成 `localhost`。

## 五、启动 ONLYOFFICE 文档库

确保 Docker Desktop 保持运行，PowerShell 仍在 `C:\onlyoffice-demo`。

### 1. 先检查 Compose 配置

```powershell
docker compose config --quiet
```

没有输出并回到提示符，表示 `.env` 和 `compose.yaml` 可以解析。如果这里报错，应先修复配置，不要继续启动。

### 2. 构建并启动两个服务

```powershell
docker compose up -d --build
```

第一次会下载 Node.js 基础镜像和 `onlyoffice/documentserver:9.4.0.1`。下载进度一段时间不变化不一定是失败；网络慢时可能需要十几分钟。不要在下载过程中关闭 Docker Desktop。

命令返回后查看状态：

```powershell
docker compose ps
```

你会看到 `app` 和 `document-server`。Document Server 第一次初始化时通常先显示 `starting`，等待约 20～30 秒后再检查，直到两行都包含 `healthy`。

如果等待超过 5 分钟仍未健康，先查看日志：

```powershell
docker compose logs --tail=150 app document-server
```

不要一遇到 `starting` 就执行 `down -v` 或删除 Docker 数据，这会让问题更难判断。

### 3. 检查两个地址

```powershell
curl.exe -fsS http://localhost:3000/health
curl.exe -fsS http://localhost:8080/healthcheck
```

预期第一条返回包含 `"status":"ok"` 的 JSON，第二条返回 `true`。这说明文件服务和编辑器服务都已经准备好。

## 六、实际完成 Word 和 Excel 验收

在浏览器打开：

```text
http://localhost:3000
```

不要只确认首页能打开，按下面顺序做一次完整操作。

### Word

1. 点击“新建 Word”，输入名称，例如“第一次 Word”；
2. 打开文档并输入一段容易识别的文字；
3. 等待页面提示修改已同步，再关闭编辑器；
4. 重新打开这个 Word，确认文字仍然存在；
5. 下载 `.docx`，用本机 Office 软件打开。

### Excel

1. 点击“新建 Excel”，输入名称，例如“第一次 Excel”；
2. 在 A1 输入 `10`，A2 输入 `20`；
3. 在 A3 输入 `=SUM(A1:A2)`，确认结果为 `30`；
4. 等待同步，关闭并重新打开；
5. 确认数值和公式仍存在，再下载 `.xlsx`。

最后再上传一个已有的 `.docx` 或 `.xlsx`，确认它能打开、修改和保存。完成这些步骤，才证明文件列表、编辑器、保存回调和本地存储形成了完整闭环。

如果修改后立即关闭浏览器，保存回调可能还没完成。应先等待同步提示，再关闭编辑器。

## 七、以后每天怎么使用

先打开 Docker Desktop，等 Engine 启动，再进入 `C:\onlyoffice-demo` 打开 PowerShell。

| 目的 | 命令 | 说明 |
| --- | --- | --- |
| 启动 | `docker compose up -d` | 已构建过时通常不需要再次 `--build` |
| 查看状态 | `docker compose ps` | 两个服务应为 healthy |
| 查看最近日志 | `docker compose logs --tail=100 app document-server` | 排查启动或保存问题 |
| 重启 | `docker compose restart` | 配置未改变时使用 |
| 暂停 | `docker compose stop` | 容器保留，下次用 `start` 或 `up -d` |
| 关闭并移除容器 | `docker compose down` | `storage` 和命名卷仍保留 |

不要执行 `docker compose down -v`。其中 `-v` 会删除 ONLYOFFICE 的命名卷。不要手工删除 `C:\onlyoffice-demo\storage`，用户 Word、Excel 正文保存在这里。

Docker Desktop 不需要一直占用电脑资源。不使用时可以先执行 `docker compose down`，再退出 Docker Desktop。

## 八、更新项目之前先备份

ZIP 下载的项目不会自动更新。更新时不要直接把新 ZIP 覆盖到唯一的旧目录，也不要在有人编辑文档时更新。

### 1. 先保存当前配置和文档

关闭所有编辑器，等待同步完成，然后在旧项目 PowerShell 中执行：

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "C:\onlyoffice-backups\$stamp"
New-Item -ItemType Directory -Force $backup | Out-Null
docker compose images | Out-File "$backup\container-images.txt" -Encoding utf8
docker compose down
Copy-Item .env, compose.yaml -Destination $backup
Copy-Item storage -Destination "$backup\storage" -Recurse
Write-Host "备份位置：$backup"
```

打开打印出的备份目录，确认存在 `.env`、`compose.yaml`、`storage` 和版本记录。上述是项目文件的最低备份；命名卷的完整备份、恢复和回滚原则见 [Linux 高级部署手册](linux-deployment.md)，Windows Docker Desktop 同样不能依赖“容器还在”代替备份。

### 2. 用新目录试更新

1. 下载新版 ZIP，解压成临时目录；
2. 确认新版目录中有 `compose.yaml`；
3. 把旧备份中的 `.env` 和 `storage` 复制到新版目录；
4. 不要改 `JWT_SECRET`，否则应用和已有 Document Server 配置可能不一致；
5. 保留旧目录，直到新版通过 Word、Excel 保存和重新打开测试；
6. 最终继续使用固定目录名 `C:\onlyoffice-demo`，便于复用同一个 Compose 项目名和已有命名卷。

需要切换目录名时，先关闭当前 PowerShell并从 `C:\` 操作，避免 Windows 因当前目录正在使用而拒绝重命名。

## 九、出问题时按这个顺序检查

### Docker 命令提示无法连接

先看 Docker Desktop 是否已经启动完成，再执行 `docker version`。只有 Client 没有 Server，说明问题在 Docker Engine，不在本项目。

### 3000 或 8080 端口被占用

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000,8080 -ErrorAction SilentlyContinue |
    Select-Object LocalAddress, LocalPort, OwningProcess
```

如果有其他程序占用端口，先确认它是什么，不要随意结束不认识的系统进程。

### 网页打不开

依次执行：

```powershell
docker compose ps
curl.exe -i http://localhost:3000/health
docker compose logs --tail=100 app
```

app 不是 healthy 时先看 app 日志；app 健康但浏览器打不开时，再检查代理、浏览器扩展和安全软件。

### 文件列表正常，但编辑器空白

依次检查：

```powershell
curl.exe -i http://localhost:8080/healthcheck
docker compose logs --tail=150 document-server
Select-String -Path .env -Pattern '^DOCUMENT_SERVER_PUBLIC_URL='
```

本机地址应是 `http://localhost:8080`。浏览器开发者工具的 Console 和 Network 中如果出现 `api.js`、iframe、JWT 或 mixed content 错误，再按[故障排查手册](troubleshooting.md)处理。

### 修改后重新打开仍是旧内容

先确认关闭前已经看到同步提示，然后查看 app 和 document-server 日志。不要连续多次强制关闭浏览器。保存流程和 revision 规则见[后端安装文档](backend-installation.md)。

如果仍无法判断，按“Docker Desktop → `docker version` → `docker compose ps` → 两个健康地址 → 对应服务日志 → 浏览器 Console/Network”的顺序收集结果，比反复重装更容易定位问题。
