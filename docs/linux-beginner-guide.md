# Linux 新手部署指南：Ubuntu 服务器从零运行 ONLYOFFICE

这份指南面向第一次接触 Linux 服务器的使用者。你不需要先学会 Node.js，也不需要自己安装数据库；Docker Compose 会启动文件管理应用和 ONLYOFFICE Docs 两个服务。

主流程先完成“IP 试运行”：只允许你自己的电脑访问服务器的 3000、8080 端口，确认 Word 和 Excel 能编辑保存。正式互联网使用不是把端口开放给所有人，而是继续配置域名、HTTPS 和登录认证。

## 先理解这次要搭建什么

浏览器会访问两个地址：

- `http://服务器地址:3000`：文件列表、新建、上传、下载和删除；
- `http://服务器地址:8080`：ONLYOFFICE Word/Excel 编辑器资源。

服务器内部还有两个容器地址：`http://app:3000` 和 `http://document-server`。它们已经写在 `compose.yaml` 中，新手部署不要修改。

如果浏览器只能访问 3000、不能访问 8080，文件列表可能出现，但编辑器无法加载；因此 IP 试运行时两个端口都要对你的电脑放行。

## 第 1 步：准备合适的服务器

**要做什么：** 确认服务器的系统、架构和资源足以运行完整演示。

**在哪里操作：** 云平台购买页、虚拟机管理界面或公司服务器管理平台。

建议准备：

- Ubuntu Server 22.04 LTS 或 24.04 LTS，64 位 x86_64/amd64；
- 2 核 CPU 或更多；
- 4 GB 内存或更多；
- 至少 40 GB 可用磁盘；
- 至少 4 GB Swap；
- 一个浏览器能够访问的固定内网地址或公网 IPv4；
- 你自己的电脑有 SSH 客户端，例如 Windows Terminal。

这些是用于本项目完整 Docker 环境的保守起步值，不是并发容量承诺。ONLYOFFICE 当前系统要求页列出更低的单机最低值，同时说明实际需求取决于并发打开文档数、类型和大小；官方 Docker 安装页给出双核、4 GB RAM、40 GB 磁盘和 4 GB Swap 的更保守基线。部署前请核对 [ONLYOFFICE Linux 系统要求](https://helpcenter.onlyoffice.com/docs/installation/docs-community-sys-reqs-linux.aspx)和 [ONLYOFFICE Docker 安装说明](https://helpcenter.onlyoffice.com/docs/installation/docs-community-install-docker.aspx)。

**成功时看到什么：** 云平台实例状态为“运行中”，你能看到服务器 IP、SSH 用户名和密钥或密码。

**如果不成功：**

- ARM/aarch64 服务器不属于本指南验证范围，优先选择 x86_64/amd64；
- 2 GB 内存机器即使能启动，也可能在初始化或编辑时内存不足；
- 系统盘不足 40 GB 时，镜像、日志和文档会很快挤满磁盘。

## 第 2 步：设置最小化网络访问范围

**要做什么：** 只让你的电脑能连接 SSH 和试运行端口，避免把无登录的演示直接暴露给所有互联网用户。

**在哪里操作：** 云平台“安全组”“防火墙”“入站规则”页面；这不是 Linux 终端。

先查询你当前电脑的公网 IPv4。可以在浏览器搜索“我的 IP”，记为 `你的电脑公网IP`。在云平台为服务器添加以下入站规则：

| 协议 | 端口 | 来源 | 用途 |
| --- | --- | --- | --- |
| TCP | 22 | `你的电脑公网IP/32` | SSH 登录 |
| TCP | 3000 | `你的电脑公网IP/32` | 文档库 IP 试运行 |
| TCP | 8080 | `你的电脑公网IP/32` | 编辑器 IP 试运行 |

不要把 3000、8080 的来源设为 `0.0.0.0/0`。如果是在可信局域网内测试，可以使用你的局域网网段，例如 `192.168.1.0/24`。

**成功时看到什么：** 规则已启用，来源列显示你的单个 IP `/32` 或明确的可信网段。

**如果不成功：**

- 家庭宽带公网 IP 可能变化，之后连不上时先核对来源地址；
- 有些平台同时存在实例防火墙和子网 ACL，两层都需要允许；
- 没有上游安全组或硬件防火墙时，不要在公网主机上直接进行本指南的 IP 试运行，先让运维人员设置网络边界。

## 第 3 步：连接 Ubuntu 服务器

**要做什么：** 从自己的电脑进入服务器命令行。

**在哪里操作：** 你的 Windows Terminal、PowerShell，或云平台提供的网页控制台。

Windows Terminal 中的常见连接方式是：

```powershell
ssh 用户名@服务器IP
```

例如云平台给出的用户是 `ubuntu`、服务器 IP 是 `203.0.113.10`，则命令为 `ssh ubuntu@203.0.113.10`。这里的示例 IP 不能直接使用，要换成你控制台中看到的真实 IP。

首次连接会询问是否信任主机指纹。先和云平台显示的信息核对，再输入 `yes`。如果使用私钥，按云平台提供的 SSH 命令操作。

**成功时看到什么：** 提示符变成类似 `ubuntu@server:~$`，说明后面的命令是在 Linux 服务器执行，而不是在你的 Windows 电脑执行。

**如果不成功：**

- `Connection timed out`：检查安全组 22 端口、服务器 IP 和实例状态；
- `Permission denied`：检查用户名、密码或私钥，不要反复猜测触发封禁；
- 仍无法连接时，使用云平台网页控制台进入服务器。

## 第 4 步：检查系统、架构、内存和磁盘

**要做什么：** 在安装前确认拿到的是预期服务器。

**在哪里操作：** 已连接的 Ubuntu 终端。

执行：

```bash
cat /etc/os-release
uname -m
free -h
df -h /
swapon --show
```

**成功时看到什么：**

- `VERSION_ID` 为 `22.04` 或 `24.04`；
- `uname -m` 为 `x86_64`；
- 内存约 4 GB 或更多；
- 根分区可用空间不少于约 40 GB；
- `swapon --show` 能看到约 4 GB 或更多 Swap。

**如果不成功：** 先扩容或更换实例。不要在明显资源不足的服务器上继续，再把初始化失败误判为代码问题。

## 第 5 步：安装 Docker Engine 和 Compose

**要做什么：** 使用 Docker 官方 apt 仓库安装 Docker Engine、Buildx 和 Compose 插件。

**在哪里操作：** Ubuntu 终端，需要 `sudo` 权限。

下面的命令来自 [Docker 官方 Ubuntu 安装文档](https://docs.docker.com/engine/install/ubuntu/)。先添加官方签名和软件仓库：

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

命令完成后安装 Docker：

```bash
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

**成功时看到什么：** `hello-world` 输出欢迎信息，最后一条显示 `Docker Compose version`。

**如果不成功：**

- apt 提示冲突包时，按 Docker 官方页面的“Uninstall old versions”处理 `docker.io`、旧 `docker-compose` 等包；
- 下载域名失败时检查服务器 DNS、代理和外网访问；
- 本指南统一使用 `sudo docker`，暂时不把普通用户加入 `docker` 组，因为该组具有接近 root 的权限；原理见 [Docker Linux 安装后说明](https://docs.docker.com/engine/install/linux-postinstall)。

## 第 6 步：下载项目到固定目录

**要做什么：** 从项目仓库获取经过版本管理的文件。

**在哪里操作：** Ubuntu 终端。

先确认目标目录不存在：

```bash
sudo test ! -e /opt/onlyoffice-demo && echo "目标目录可用"
```

看到“目标目录可用”后，再下载：

```bash
sudo git clone https://github.com/mumu976/onlyoffice-document-library.git /opt/onlyoffice-demo
cd /opt/onlyoffice-demo
sudo git status --short
sudo test -f compose.yaml && echo "项目文件完整"
```

**成功时看到什么：** 当前目录为 `/opt/onlyoffice-demo`，Git 状态没有修改，最后显示“项目文件完整”。

**如果不成功：**

- 如果目标目录已经存在，不要盲目删除；它可能包含旧文档，先执行后面的备份流程；
- GitHub 连接失败时检查 DNS、代理和出口网络；
- `compose.yaml` 不存在说明下载路径或仓库不正确。

## 第 7 步：创建服务器配置

**要做什么：** 生成 JWT 密钥，并把浏览器实际访问的服务器地址写入 `.env`。

**在哪里操作：** Ubuntu 终端，当前目录必须是 `/opt/onlyoffice-demo`。

先复制模板并生成密钥：

```bash
cd /opt/onlyoffice-demo
sudo cp .env.example .env
SECRET=$(openssl rand -hex 32)
sudo sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" .env
unset SECRET
```

然后执行下面的交互式命令。提示出现后，输入浏览器访问服务器时使用的真实 IP；不要输入示例地址，也不要带 `http://`：

```bash
read -r -p "请输入浏览器访问服务器时使用的 IP：" SERVER_IP
sudo sed -i "s|^DOCUMENT_SERVER_PUBLIC_URL=.*|DOCUMENT_SERVER_PUBLIC_URL=http://$SERVER_IP:8080|" .env
unset SERVER_IP
sudo grep -E '^(DOCUMENT_SERVER_PUBLIC_URL|DOCUMENT_SERVER_INTERNAL_URL|APP_INTERNAL_URL|JWT_SECRET)=' .env
```

如果服务器只在局域网使用，就输入局域网 IP；云服务器试运行通常输入公网 IPv4。`.env` 不要提交到 Git，也不要把真实 `JWT_SECRET` 发到聊天、工单或截图里。

**成功时看到什么：**

- `DOCUMENT_SERVER_PUBLIC_URL` 是浏览器可访问的 `http://真实地址:8080`；
- `DOCUMENT_SERVER_INTERNAL_URL=http://document-server`；
- `APP_INTERNAL_URL=http://app:3000`；
- `JWT_SECRET` 是 64 个十六进制字符。

**如果不成功：**

- 输入错 IP 时可以重新执行交互式命令；
- 不要把内部地址 `document-server` 或 `app` 换成公网 IP；
- 正式域名上线时不要直接在这里拼凑配置，转到[高级部署手册](linux-deployment.md)。

## 第 8 步：创建文档存储目录并设置权限

**要做什么：** 让容器内的非 root Node 用户能够写入持久化目录。

**在哪里操作：** Ubuntu 终端。

执行：

```bash
cd /opt/onlyoffice-demo
sudo mkdir -p storage
sudo chown -R 1000:1000 storage
sudo chmod 750 storage
sudo ls -ld storage
```

**成功时看到什么：** `storage` 的属主和属组数字对应 `1000 1000`，权限类似 `drwxr-x---`。

**如果不成功：**

- 不能省略 `chown`：宿主目录会覆盖镜像内原有权限；
- 不要为省事使用 `chmod 777`；
- 以后备份文件恢复后，也需要再次检查属主和权限。

## 第 9 步：检查配置并启动服务

**要做什么：** 构建本项目应用，启动固定版本的 ONLYOFFICE Docs，并等待健康检查。

**在哪里操作：** Ubuntu 终端。

先检查 Compose 配置：

```bash
cd /opt/onlyoffice-demo
sudo docker compose config --quiet
```

没有输出并返回提示符表示通过。然后拉取、构建和启动：

```bash
sudo docker compose pull document-server
sudo docker compose build app
sudo docker compose up -d
```

项目固定使用 `onlyoffice/documentserver:9.4.0.1`，不会自动追随 `latest`。第一次下载和初始化可能需要几分钟。

**成功时看到什么：** 命令返回提示符，两个服务已创建并启动。

**如果不成功：**

- 镜像下载失败：检查磁盘、DNS、代理和 Docker Hub 网络；
- `JWT_SECRET` 报错：检查 `.env` 是否存在且密钥足够长；
- `storage` 权限错误：重新执行第 8 步。

## 第 10 步：确认两个容器健康

**要做什么：** 在开放浏览器前验证服务器内部状态。

**在哪里操作：** Ubuntu 终端。

执行：

```bash
sudo docker compose ps
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:8080/healthcheck
```

**成功时看到什么：**

- `app` 和 `document-server` 都是 `healthy`；
- 应用健康检查返回包含 `ok` 的 JSON；
- ONLYOFFICE 健康检查返回 `true`。

如果 Document Server 仍是 `starting`，等约 20 秒再检查。首次初始化可能持续几分钟。

**如果不成功：**

```bash
sudo docker compose logs --tail=150 app document-server
```

- app 报权限错误：检查 `storage`；
- document-server 反复重启：检查内存、Swap、磁盘和日志；
- 端口冲突：执行 `sudo ss -lntp | grep -E ':(3000|8080)\b'` 找出占用程序。

## 第 11 步：从自己的电脑访问并实际测试

**要做什么：** 验证网络访问、编辑器加载和文件回存完整闭环。

**在哪里操作：** 你自己的电脑浏览器，不是服务器终端。

1. 打开 `http://服务器IP:3000`；
2. 新建 Word，输入一句话，等待同步，关闭并重新打开；
3. 新建 Excel，在 A1 输入 `10`、A2 输入 `20`、A3 输入 `=SUM(A1:A2)`；
4. 确认 A3 为 `30`，等待同步，关闭并重新打开；
5. 下载两个文件并确认本地 Office 软件可以打开。

可以另外打开 `http://服务器IP:8080/healthcheck`，预期看到 `true`。

**成功时看到什么：** 文件列表、Word/Excel 编辑器都能打开，重新打开后内容和公式仍存在。

**如果不成功：**

- 服务器本机健康但电脑打不开：检查云安全组、IP 是否正确，以及你的公网 IP 是否变化；
- 文件列表能开、编辑器空白：重点检查 8080 端口和 `.env` 中的 `DOCUMENT_SERVER_PUBLIC_URL`；
- 能编辑但不能保存：检查 callback、JWT 和 Document Server 到 app 的内部访问，见[故障排查手册](troubleshooting.md)。

## IP 试运行之后：不要直接开放公网

这个项目没有登录和文件权限。完成测试后，建议立即在云安全组删除 3000、8080 的临时入站规则，或继续严格限制为可信 IP。

只配置 UFW 不能证明 Docker 发布端口已经被限制。Docker 官方明确说明，发布的容器端口流量可能在到达 UFW 使用的链之前被转发，相关原理见 [Docker packet filtering and firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/)。因此：

1. 新手试运行优先依赖云安全组或上游硬件防火墙限制来源；
2. 正式上线使用两个 HTTPS 域名，例如 `files.example.com` 和 `docs.example.com`；
3. 在最外层反向代理增加登录认证；
4. 不对互联网直接暴露 3000、8080；
5. 配置备份、恢复验证和回滚后再上线。

完整 Nginx、HTTPS、认证边界、Docker 防火墙注意事项、备份与回滚命令见 [Ubuntu/Linux 高级部署手册](linux-deployment.md)。

## 日常运维命令

**在哪里操作：** Ubuntu 终端，先执行 `cd /opt/onlyoffice-demo`。

| 目的 | 命令 | 成功标志 |
| --- | --- | --- |
| 查看状态 | `sudo docker compose ps` | 两个服务均为 healthy |
| 查看最近日志 | `sudo docker compose logs --tail=100 app document-server` | 能看到时间和服务名 |
| 持续查看日志 | `sudo docker compose logs -f app document-server` | 按 Ctrl+C 退出，不会停止容器 |
| 启动 | `sudo docker compose up -d` | 服务进入 running/healthy |
| 重启 | `sudo docker compose restart` | 两个服务重新启动 |
| 停止 | `sudo docker compose stop` | 容器保留但停止 |
| 关闭并移除容器 | `sudo docker compose down` | storage 和命名卷保留 |

不要执行 `sudo docker compose down -v`，它会删除命名卷。不要删除 `/opt/onlyoffice-demo/storage`，这里保存用户文档。

## 更新前的最低备份要求

更新不是直接执行 `git pull`。先确认无人编辑，再备份 `.env`、`compose.yaml`、`storage` 和 ONLYOFFICE 命名卷，并验证备份可读。最短的项目文件备份示例是：

```bash
cd /opt/onlyoffice-demo
sudo docker compose stop
BACKUP_DIR="/opt/onlyoffice-backups/$(date +%Y%m%d-%H%M%S)"
sudo mkdir -p "$BACKUP_DIR"
sudo cp .env compose.yaml "$BACKUP_DIR/"
sudo tar -C /opt/onlyoffice-demo -czf "$BACKUP_DIR/storage.tar.gz" storage
sudo tar -tzf "$BACKUP_DIR/storage.tar.gz" >/dev/null
echo "项目文件备份完成：$BACKUP_DIR"
sudo docker compose start
```

这还不是完整升级流程。命名卷备份、版本固定升级、恢复和回滚必须按[高级部署手册](linux-deployment.md)执行。

## 出问题时按这个顺序检查

1. `sudo systemctl status docker --no-pager`：Docker 服务是否运行；
2. `sudo docker compose config --quiet`：`.env` 和 Compose 是否有效；
3. `sudo docker compose ps`：哪一个容器不是 healthy；
4. `sudo docker compose logs --tail=150 app document-server`：对应服务最后的错误；
5. `curl` 两个本机健康地址：应用内部是否正常；
6. 云安全组来源 IP、3000 和 8080：外部网络是否放行；
7. 浏览器 Network/Console：是 3000 页面、8080 脚本、iframe 还是 callback 失败；
8. `.env` 的公共地址和 JWT 是否匹配当前部署。

按症状分类的处理方法见[故障排查手册](troubleshooting.md)。
