# Ubuntu 服务器部署 ONLYOFFICE：从零到可以编辑 Word、Excel

这份指南适合第一次部署 Linux 服务的人。它不会只给出一长串命令，而会说明每组命令在哪里执行、解决什么问题，以及怎样判断结果是否正确。

部署完成后，服务器上会运行两个容器：

| 服务 | 默认端口 | 作用 |
| --- | --- | --- |
| `app` | 3000 | 文件列表、新建、上传、下载、删除和保存回调 |
| `document-server` | 8080 | 浏览器中的 ONLYOFFICE Word、Excel 编辑器 |

浏览器必须同时访问这两个端口。只开放 3000 会出现“文件列表能打开，但编辑器空白”的情况。

## 先选择你的部署阶段

本指南把部署分成两个阶段，不要混在一起操作：

1. **IP 试运行**：使用 `http://服务器IP:3000` 和 `http://服务器IP:8080`，仅允许你自己的电脑或可信局域网访问，用来确认功能正常。
2. **正式上线**：使用两个 HTTPS 域名、认证反向代理和备份策略，不再把 3000、8080 直接开放给互联网。

这个项目没有登录、用户权限和身份审计。IP 试运行不能直接变成公网正式环境。

## 一、准备 Ubuntu 服务器

### 1. 推荐配置

本项目验证的系统范围是 Ubuntu Server 22.04/24.04 x86_64。建议从下面的配置起步：

- 2 核 CPU；
- 4 GB 内存；
- 40 GB 以上可用磁盘；
- 4 GB Swap；
- 固定的局域网 IP 或公网 IPv4。

ONLYOFFICE 的系统要求会随版本调整。2026-07-15 复核时，[Linux 系统要求](https://helpcenter.onlyoffice.com/docs/installation/docs-community-sys-reqs-linux.aspx)列出的单机最低值低于上述建议，而 [Docker 安装说明](https://helpcenter.onlyoffice.com/docs/installation/docs-community-install-docker.aspx)采用双核、4 GB RAM、40 GB 磁盘和 4 GB Swap 的更保守基线。本项目同时运行应用和 Document Server，因此采用后者。实际并发能力仍取决于打开文档的人数、文档大小和转换任务。

### 2. 云服务器先设置安全组

这一步在云平台网页控制台操作，不是在 Ubuntu 终端操作。

先查询你当前电脑的公网 IPv4，然后只添加以下入站规则：

| 端口 | 来源 | 说明 |
| --- | --- | --- |
| TCP 22 | `你的电脑公网IP/32` | SSH 登录 |
| TCP 3000 | `你的电脑公网IP/32` | IP 试运行的文件管理页面 |
| TCP 8080 | `你的电脑公网IP/32` | IP 试运行的编辑器 |

不要把 3000、8080 的来源设为 `0.0.0.0/0`。如果服务器只在局域网使用，可以把来源设为可信网段，例如 `192.168.1.0/24`。

### 3. 连接服务器并检查环境

在自己的 Windows Terminal 或 PowerShell 中连接服务器：

```powershell
ssh ubuntu@你的服务器IP
```

`ubuntu` 是很多云平台的默认用户名，但要以你的云平台控制台为准。登录成功后，提示符通常类似 `ubuntu@server:~$`。从这里开始，除非特别说明，命令都在 Ubuntu 终端执行。

先检查系统和资源：

```bash
cat /etc/os-release
uname -m
free -h
df -h /
swapon --show
```

继续部署前应确认：

- `VERSION_ID` 是 `22.04` 或 `24.04`；
- `uname -m` 是 `x86_64`；
- 内存约 4 GB 或更多；
- 根分区至少还有约 40 GB；
- Swap 已启用。

如果服务器明显不满足这些条件，应先扩容。Document Server 初始化失败时，内存和磁盘不足比代码错误更常见。

## 二、安装 Docker Engine 和 Compose

如果下面两条命令已经正常显示版本，可以跳到“部署项目”：

```bash
sudo docker version
sudo docker compose version
```

如果尚未安装，使用 [Docker 官方 Ubuntu 安装流程](https://docs.docker.com/engine/install/ubuntu/)，不要混用 Ubuntu 自带的旧 `docker.io` 和独立 `docker-compose` 包。

### 1. 添加 Docker 官方软件源

整段复制到 Ubuntu 终端执行：

```bash
sudo apt update
sudo apt install -y ca-certificates curl git openssl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
```

这组命令结束时不应出现 GPG 签名错误或找不到仓库。若出现冲突包提示，请先按 Docker 官方文档的“Uninstall old versions”处理旧的 `docker.io`、`docker-compose`、`containerd` 或 `runc`，不要直接强制覆盖。

### 2. 安装并验证 Docker

```bash
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

看到 `Hello from Docker!` 和 `Docker Compose version` 才算安装成功。

本指南统一使用 `sudo docker`，这样不会为了少输入几个字符就把当前用户加入具有 root 级权限的 `docker` 组。如果你明确理解风险后仍要配置非 root 使用方式，请阅读 [Docker Linux 安装后说明](https://docs.docker.com/engine/install/linux-postinstall)。

## 三、部署项目

### 1. 把项目放到 `/opt/onlyoffice-demo`

先创建一个由当前登录用户管理的目录，再克隆项目。不要使用 `sudo git clone`，否则整个仓库会归 root，后续更新和查看状态都需要 sudo。

```bash
sudo install -d -m 0755 -o "$USER" -g "$USER" /opt/onlyoffice-demo
git clone https://github.com/mumu976/onlyoffice-document-library.git /opt/onlyoffice-demo
cd /opt/onlyoffice-demo
git status --short
test -f compose.yaml && echo "项目文件完整"
```

正常结果是最后显示“项目文件完整”，`git status --short` 没有输出。

如果 `/opt/onlyoffice-demo` 已经有文件，`git clone` 会拒绝执行。这时不要删除目录；先确认它是不是旧部署，并备份 `.env`、`storage` 和 Docker 命名卷。旧环境的完整更新和回滚方法见[高级部署手册](linux-deployment.md)。

### 2. 创建 `.env` 配置

`.env` 是这台服务器自己的配置文件，不会提交到 GitHub。下面的命令会复制模板并自动生成 64 位十六进制 JWT 密钥：

```bash
cd /opt/onlyoffice-demo
cp .env.example .env
SECRET="$(openssl rand -hex 32)"
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" .env
unset SECRET
```

接下来配置浏览器实际访问 Document Server 的地址。执行下面的命令后，根据提示输入真实服务器 IP，不要输入 `http://`，也不要使用文档中的示例 IP：

```bash
read -r -p "请输入浏览器访问这台服务器时使用的 IP：" SERVER_IP
sed -i "s|^DOCUMENT_SERVER_PUBLIC_URL=.*|DOCUMENT_SERVER_PUBLIC_URL=http://$SERVER_IP:8080|" .env
unset SERVER_IP
grep -E '^(DOCUMENT_SERVER_PUBLIC_URL|DOCUMENT_SERVER_INTERNAL_URL|APP_INTERNAL_URL)=' .env
```

检查结果应类似：

```text
DOCUMENT_SERVER_PUBLIC_URL=http://真实服务器IP:8080
DOCUMENT_SERVER_INTERNAL_URL=http://document-server
APP_INTERNAL_URL=http://app:3000
```

只修改第一行的服务器地址。`document-server` 和 `app` 是 Docker Compose 内部服务名，不能替换为公网 IP。真实 `JWT_SECRET` 不要打印到公共日志、截图或工单。

### 3. 创建持久化目录

用户的 Word、Excel 正文保存在 `/opt/onlyoffice-demo/storage`。应用容器以 UID 1000 运行，因此宿主目录需要对应写权限：

```bash
cd /opt/onlyoffice-demo
sudo mkdir -p storage
sudo chown -R 1000:1000 storage
sudo chmod 750 storage
sudo ls -ld storage
```

不要用 `chmod 777`。以后从备份恢复 `storage` 后，也要重新检查属主是否为 `1000:1000`。

## 四、启动并验证

### 1. 先检查配置，再启动

```bash
cd /opt/onlyoffice-demo
sudo docker compose config --quiet
sudo docker compose pull document-server
sudo docker compose build app
sudo docker compose -f compose.yaml -f compose.lan.yaml config --quiet
sudo docker compose -f compose.yaml -f compose.lan.yaml up -d
```

两次 `config --quiet` 都没有输出并返回提示符，表示基础配置和 LAN 覆盖配置能正常解析。`compose.yaml` 默认只监听本机，`compose.lan.yaml` 才会把 3000、8080 发布到服务器网卡；只能在安全组已限制可信来源时使用。第一次拉取 `onlyoffice/documentserver:9.4.0.1` 需要下载较大的镜像，取决于服务器网络，可能持续数分钟。

项目固定镜像版本而不是使用 `latest`，目的是避免未来重启时突然换成未经验证的新版本。

### 2. 等两个服务变为 healthy

```bash
sudo docker compose ps
```

Document Server 第一次启动时通常先显示 `starting`。等待约 20～30 秒后重新执行，直到 `app` 和 `document-server` 两行都包含 `healthy`。

然后分别检查应用和编辑器：

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/health/ready
curl -fsS http://127.0.0.1:8080/healthcheck
```

预期第一条返回包含 `"status":"ok"`，第二条返回包含 `"status":"ready"`，第三条返回 `true`。

如果超过 5 分钟仍未健康，先看日志，不要反复删除和重建容器：

```bash
sudo docker compose logs --tail=150 app document-server
```

常见判断：

- app 出现 `permission denied`：重新检查 `storage` 权限；
- document-server 反复重启：检查内存、Swap 和磁盘；
- 3000 或 8080 被占用：执行 `sudo ss -lntp | grep -E ':(3000|8080)\b'`；
- 拉取镜像失败：检查 DNS、代理和 Docker Hub 网络。

### 3. 从自己的电脑完成实际验收

在自己的电脑浏览器打开：

```text
http://真实服务器IP:3000
```

按下面顺序验证，不要只确认首页能打开：

1. 新建 Word，输入一句话，等待同步提示，关闭后重新打开；
2. 新建 Excel，在 A1 输入 `10`、A2 输入 `20`、A3 输入 `=SUM(A1:A2)`；
3. 确认 A3 为 `30`，等待同步，关闭后重新打开；
4. 下载 Word 和 Excel，确认本地 Office 软件能打开；
5. 上传一个已有 `.docx` 或 `.xlsx`，确认可以编辑保存。

如果文件列表能打开但编辑器空白，优先检查：

1. 浏览器能否打开 `http://真实服务器IP:8080/healthcheck`；
2. 云安全组是否同时允许 3000 和 8080；
3. `.env` 中的 `DOCUMENT_SERVER_PUBLIC_URL` 是否正是浏览器正在使用的地址；
4. 浏览器开发者工具是否出现 mixed content、脚本或 iframe 错误。

更完整的症状对照表见[故障排查手册](troubleshooting.md)。

## 五、日常启动、停止和日志

每次先进入项目目录：

```bash
cd /opt/onlyoffice-demo
```

然后根据目的使用对应命令：

| 目的 | 命令 | 结果 |
| --- | --- | --- |
| 查看状态 | `sudo docker compose ps` | 两个服务应为 healthy |
| 启动 IP 试运行 | `sudo docker compose -f compose.yaml -f compose.lan.yaml up -d` | 使用受限来源的 LAN 端口覆盖配置 |
| 停止 | `sudo docker compose stop` | 容器和数据保留 |
| 重启 | `sudo docker compose restart` | 两个服务重启 |
| 查看最近日志 | `sudo docker compose logs --tail=100 app document-server` | 显示两个服务最近日志 |
| 持续看日志 | `sudo docker compose logs -f app document-server` | 按 Ctrl+C 只退出查看，不停止服务 |
| 移除容器 | `sudo docker compose down` | `storage` 和命名卷仍保留 |

不要执行 `sudo docker compose down -v`，其中 `-v` 会删除命名卷。不要删除 `storage`，这里保存用户文档。

## 六、从试运行转为正式上线

完成 IP 验收后，不要把 3000、8080 改成对 `0.0.0.0/0` 开放。正式上线至少需要：

1. 文件服务域名，例如 `files.example.com`；
2. 编辑器域名，例如 `docs.example.com`；
3. 两个域名都使用可信 HTTPS 证书；
4. 在文件服务前加入登录认证；
5. 在云安全组或上游防火墙阻止互联网直接访问 3000、8080；
6. 验证备份、恢复和固定版本回滚。

只配置 Nginx 并不会自动关闭 Compose 已经发布的 3000、8080。只配置 UFW 也不一定足够：Docker 官方说明发布端口的流量可能在到达 UFW 使用的链之前被转发，见 [Docker 防火墙说明](https://docs.docker.com/engine/network/packet-filtering-firewalls/)。云服务器应优先在云安全组限制来源，并按基础设施情况补充 `DOCKER-USER` 或等效规则。

域名、Nginx、HTTPS、认证边界、命名卷备份、完整恢复和回滚命令见[Ubuntu/Linux 高级部署手册](linux-deployment.md)。

## 七、更新前最低限度要做什么

不要在有人编辑文档时直接执行 `git pull`。更新前至少：

1. 确认没有正在编辑的文件；
2. 备份 `.env`、`compose.yaml` 和 `storage`；
3. 备份 Document Server 的 Data、Logs 命名卷；
4. 记录当前固定镜像版本；
5. 验证备份归档能正常列出；
6. 准备恢复旧 Compose 文件和同一时间点数据的回滚步骤。

完整、安全的命令已集中放在[高级部署手册的备份、恢复与回滚部分](linux-deployment.md)，不要从不同教程中拼接互不对应的备份和恢复命令。

## 接下来读什么

- 域名、HTTPS、认证边界与完整运维：[Linux 高级部署](linux-deployment.md)
- 环境变量、REST API 与 callback：[后端安装文档](backend-installation.md)
- 启动、编辑器或保存异常：[故障排查](troubleshooting.md)
- 按证据完成 Word / Excel 验收：[本地演示记录](demo-guide.md)

[返回文档中心](README.md)
