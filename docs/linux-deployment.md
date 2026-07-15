# Ubuntu Docker Compose 部署

目标环境为 Ubuntu 22.04/24.04 x86_64。2026-07-15 复核时，[ONLYOFFICE Linux 系统要求](https://helpcenter.onlyoffice.com/docs/installation/docs-community-sys-reqs-linux.aspx)列出的最低值为单核 2 GHz、至少 2 GB RAM、40 GB 磁盘和至少 4 GB Swap；[ONLYOFFICE Docker 安装说明](https://helpcenter.onlyoffice.com/docs/installation/docs-community-install-docker.aspx)给出双核 2 GHz、4 GB RAM、40 GB 磁盘和 4 GB Swap 的更保守基线。本项目的完整双容器部署采用后者作为起步建议，实际容量仍须按并发编辑数、文档类型和大小压测。Docker Engine 仓库流程以 [Docker 官方 Ubuntu 安装文档](https://docs.docker.com/engine/install/ubuntu/) 为准。

## Docker Engine 与 Compose

以下流程使用 Docker 当前官方推荐的 `docker.sources` 格式。先添加仓库，再安装 Engine、Buildx 和 Compose 插件：

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
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

本页后续命令假定操作者已经被授权访问 Docker daemon。若没有配置 Docker 用户组，请为单条 Docker 命令添加 `sudo`；不要仅为了省略 `sudo` 就把不受信任账户加入 `docker` 组，该组具有接近 root 的权限。

## 项目与 storage 权限

新服务器可以直接从 GitHub 获取项目。先让当前部署用户拥有项目目录，避免整个仓库归 root：

```bash
sudo install -d -m 0755 -o "$USER" -g "$USER" /opt/onlyoffice-demo
git clone https://github.com/mumu976/onlyoffice-document-library.git /opt/onlyoffice-demo
cd /opt/onlyoffice-demo
cp .env.example .env
SECRET="$(openssl rand -hex 32)"
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" .env
unset SECRET
sudo mkdir -p storage
sudo chown -R 1000:1000 storage
sudo chmod 750 storage
```

IP 试运行示例是 `DOCUMENT_SERVER_PUBLIC_URL=http://192.168.1.20:8080`，域名正式环境示例是 `DOCUMENT_SERVER_PUBLIC_URL=https://docs.example.com`。`DOCUMENT_SERVER_INTERNAL_URL=http://document-server`、`APP_INTERNAL_URL=http://app:3000` 保持 Compose 服务名。`.env` 不提交 Git，真实 `JWT_SECRET` 不进入终端录屏、日志或工单。

浏览器访问 Docs 后，保存 callback 里的下载 URL 可能使用公共域名。后端只接受 `DOCUMENT_SERVER_PUBLIC_URL` 和 `DOCUMENT_SERVER_INTERNAL_URL` 两个 origin，并把受信任的公共 URL 保留路径/查询后改写到内部地址下载；因此公共 URL 必须准确配置，不能用宽泛域名或通配规则代替。

**必须先执行 `mkdir` 和 `chown 1000:1000`。** Dockerfile 对镜像内 `/app/storage` 的 chown 会被 `./storage:/app/storage` bind mount 遮蔽；宿主机属主不正确时 Node 用户无法写入。

## 启动与健康检查

```bash
docker compose config
docker compose pull document-server
docker compose build app
docker compose up -d
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 document-server
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:8080/healthcheck
docker compose stop
docker compose restart
docker compose down
```

## LAN/IP 试运行与防火墙边界

LAN 演示可以限制可信来源：

```bash
sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 8080 proto tcp
sudo ufw enable
```

这些 UFW 命令不是充分的 Docker 端口保护。Docker 发布端口的流量可能在到达 UFW 使用的链之前已经被转发；云服务器必须同时使用云安全组限制 3000/8080 的来源，裸机则按网络架构配置 `DOCKER-USER` 或等效的上游防火墙规则。原理与建议以 [Docker packet filtering and firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/) 为准。

`ALLOW_PRIVATE_IP_ADDRESS=true` 是因为 Document Server 要从 Compose 网络访问私有地址 `http://app:3000`。该开关也扩大了 Document Server 的服务端请求范围：一旦攻击者能影响待获取 URL，就可能探测或访问宿主机、LAN 和其他私网服务，形成 SSRF 或横向访问。Compose 默认网络只隔离容器命名空间，**不会**阻断容器到宿主机或 LAN 的出站连接；因此保持 `ALLOW_META_IP_ADDRESS` 禁用、只让两个服务加入项目网络、限制 3000/8080 入站，并在基础设施层按需限制 Document Server 出站。该设置绝不是 Express callback URL origin 白名单或认证反向代理的替代品。

## 双域名 Nginx HTTPS

下面示例假定 Nginx 安装在同一台宿主机：`files.example.com` 反代应用 3000，`docs.example.com` 反代 Docs 8080。

在正式环境中，必须先把 `compose.yaml` 的端口映射从所有网卡改为仅宿主机回环地址：

```yaml
services:
  document-server:
    ports:
      - "127.0.0.1:8080:80"
  app:
    ports:
      - "127.0.0.1:3000:3000"
```

修改后重新解析并应用 Compose，确认两个端口只监听回环地址：

```bash
docker compose config --quiet
docker compose up -d
sudo ss -lntp | grep -E '127\.0\.0\.1:(3000|8080)\b'
```

最终结果不应再出现 `0.0.0.0:3000` 或 `0.0.0.0:8080`。若反向代理位于另一台机器，则不能绑定本机回环地址，应绑定受控私网地址，并在安全组/防火墙中只允许反向代理来源。

先在 DNS 服务商为两个域名创建指向服务器公网 IP 的 A 记录，并确认 `getent ahostsv4 files.example.com`、`getent ahostsv4 docs.example.com` 返回正确地址。云安全组只需对公网开放 80/443，3000/8080 不再对公网开放。

安装 Nginx 和 Certbot。以下 standalone 方式会临时占用 80 端口，因此先停止 Nginx；执行前必须确认 DNS 已生效且公网 80 可访问：

```bash
sudo apt update
sudo apt install -y nginx certbot
sudo systemctl stop nginx
sudo certbot certonly --standalone --pre-hook "systemctl stop nginx" --post-hook "systemctl start nginx" -d files.example.com
sudo certbot certonly --standalone --pre-hook "systemctl stop nginx" --post-hook "systemctl start nginx" -d docs.example.com
sudo certbot renew --dry-run
```

两次签发成功后，应存在 `/etc/letsencrypt/live/files.example.com/` 和 `/etc/letsencrypt/live/docs.example.com/`。如果签发失败，不要继续写引用这些文件的 Nginx 配置；先检查 DNS、80 端口和其他占用 80 的进程。

将下面配置保存为 `/etc/nginx/sites-available/onlyoffice-demo`，创建到 `sites-enabled` 的链接后执行 `sudo nginx -t`。`map` 指令必须位于 Nginx 的 `http` 上下文；Ubuntu 的 `sites-enabled` 默认正是在该上下文中加载。

```nginx
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
server {
    listen 443 ssl;
    http2 on;
    server_name files.example.com;
    ssl_certificate /etc/letsencrypt/live/files.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/files.example.com/privkey.pem;
    client_max_body_size 20m;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
server {
    listen 443 ssl;
    http2 on;
    server_name docs.example.com;
    ssl_certificate /etc/letsencrypt/live/docs.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/docs.example.com/privkey.pem;
    client_max_body_size 20m;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
```

启用并重载：

```bash
sudo ln -s /etc/nginx/sites-available/onlyoffice-demo /etc/nginx/sites-enabled/onlyoffice-demo
sudo nginx -t
sudo systemctl reload nginx
curl -fsS https://files.example.com/health
curl -fsS https://docs.example.com/healthcheck
```

如果链接已经存在，`ln -s` 会报 `File exists`；先用 `ls -l /etc/nginx/sites-enabled/onlyoffice-demo` 确认它指向正确文件，不要重复创建。

在 `.env` 设置 `DOCUMENT_SERVER_PUBLIC_URL=https://docs.example.com`，然后执行 `docker compose up -d --force-recreate app` 并检查 `https://files.example.com/api/config` 返回的新地址。两个浏览器可见 URL 必须同时 HTTPS，否则 mixed content 会阻止 API 或 iframe。应用没有登录鉴权，互联网暴露前必须在 `files.example.com` 前接入认证、限流和审计。不要随意给 Docs 静态资源域名添加会阻断 iframe/API 请求的通用登录页面，应按所选认证网关验证完整编辑流程。仅增加 Nginx 配置但继续公开 3000/8080 会留下绕过 HTTPS 和认证代理的直连路径，不属于完成上线。

## 开机、备份、恢复与回滚

启用 Docker 开机启动：

```bash
sudo systemctl enable --now docker
```

### 动态发现并验证 named volume

不要猜测 Compose 项目前缀，也不要把卷名硬编码到 `docker run -v`。在 Document Server 正常运行时，从该容器的 `Mounts` 读取两个真实卷名，并在任何备份或恢复前拒绝空值、拒绝不存在的卷：

```bash
set -euo pipefail

cd /opt/onlyoffice-demo
CONTAINER_ID="$(docker compose ps -q document-server)"
test -n "$CONTAINER_ID" || { echo "document-server 未运行，无法发现卷" >&2; exit 1; }

DOCUMENT_DATA_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/www/onlyoffice/Data"}}{{.Name}}{{end}}{{end}}' "$CONTAINER_ID")"
DOCUMENT_LOGS_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/log/onlyoffice"}}{{.Name}}{{end}}{{end}}' "$CONTAINER_ID")"

test -n "$DOCUMENT_DATA_VOLUME" || { echo "未发现 Document Server Data 卷" >&2; exit 1; }
test -n "$DOCUMENT_LOGS_VOLUME" || { echo "未发现 Document Server Logs 卷" >&2; exit 1; }
docker volume inspect "$DOCUMENT_DATA_VOLUME" >/dev/null
docker volume inspect "$DOCUMENT_LOGS_VOLUME" >/dev/null
```

后续命令使用 `--mount` 和上述已验证变量。发现卷名后只执行 `docker compose stop`，不要执行 `down -v` 或删除容器；现有容器会继续引用这些卷，错误名称不会被静默创建。

### 同一时间点备份

先执行上面的卷发现块，再在同一 shell 会话执行。三个归档共享一个 UTC `BACKUP_ID`；停服后制作归档，确保 `storage`、Data 和 Logs 属于同一时间点：

```bash
set -euo pipefail

# 若在新 shell 执行，先设置项目目录并进入该目录。
cd /opt/onlyoffice-demo
BACKUP_DIR=/var/backups/onlyoffice-demo
BACKUP_ID="$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$BACKUP_DIR"

CONTAINER_ID="$(docker compose ps -q document-server)"
test -n "$CONTAINER_ID" || { echo "document-server 未运行，无法发现卷" >&2; exit 1; }
DOCUMENT_DATA_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/www/onlyoffice/Data"}}{{.Name}}{{end}}{{end}}' "$CONTAINER_ID")"
DOCUMENT_LOGS_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/log/onlyoffice"}}{{.Name}}{{end}}{{end}}' "$CONTAINER_ID")"
test -n "$DOCUMENT_DATA_VOLUME" || { echo "未发现 Document Server Data 卷" >&2; exit 1; }
test -n "$DOCUMENT_LOGS_VOLUME" || { echo "未发现 Document Server Logs 卷" >&2; exit 1; }
docker volume inspect "$DOCUMENT_DATA_VOLUME" >/dev/null
docker volume inspect "$DOCUMENT_LOGS_VOLUME" >/dev/null

trap 'docker compose start >/dev/null 2>&1 || true' EXIT
docker compose stop
docker volume inspect "$DOCUMENT_DATA_VOLUME" >/dev/null
docker volume inspect "$DOCUMENT_LOGS_VOLUME" >/dev/null

sudo tar -C /opt/onlyoffice-demo -czf "$BACKUP_DIR/storage-${BACKUP_ID}.tar.gz" storage
docker run --rm \
  --mount "type=volume,src=${DOCUMENT_DATA_VOLUME},dst=/data,readonly" \
  --mount "type=bind,src=${BACKUP_DIR},dst=/backup" \
  alpine:3.20 tar -czf "/backup/document-data-${BACKUP_ID}.tar.gz" -C /data .
docker run --rm \
  --mount "type=volume,src=${DOCUMENT_LOGS_VOLUME},dst=/data,readonly" \
  --mount "type=bind,src=${BACKUP_DIR},dst=/backup" \
  alpine:3.20 tar -czf "/backup/document-logs-${BACKUP_ID}.tar.gz" -C /data .

test -s "$BACKUP_DIR/storage-${BACKUP_ID}.tar.gz"
test -s "$BACKUP_DIR/document-data-${BACKUP_ID}.tar.gz"
test -s "$BACKUP_DIR/document-logs-${BACKUP_ID}.tar.gz"
printf '%s\n' "$DOCUMENT_DATA_VOLUME" "$DOCUMENT_LOGS_VOLUME" | sudo tee "$BACKUP_DIR/volumes-${BACKUP_ID}.txt" >/dev/null
docker compose start
trap - EXIT
echo "备份时间点：$BACKUP_ID"
```

### 完整恢复

先让目标 Compose 项目的 `document-server` 运行，并重新执行卷发现块；然后在同一 shell 设置要恢复的 `BACKUP_ID`。下列步骤先验证三个归档，再停服并清空目标内容，包括隐藏文件：

```bash
set -euo pipefail

# 若在新 shell 执行，先设置项目目录并进入该目录。
cd /opt/onlyoffice-demo
BACKUP_DIR=/var/backups/onlyoffice-demo
BACKUP_ID=20260714T120000Z

CONTAINER_ID="$(docker compose ps -q document-server)"
test -n "$CONTAINER_ID" || { echo "document-server 未运行，无法发现卷" >&2; exit 1; }
DOCUMENT_DATA_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/www/onlyoffice/Data"}}{{.Name}}{{end}}{{end}}' "$CONTAINER_ID")"
DOCUMENT_LOGS_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/log/onlyoffice"}}{{.Name}}{{end}}{{end}}' "$CONTAINER_ID")"
test -n "$DOCUMENT_DATA_VOLUME" || { echo "未发现 Document Server Data 卷" >&2; exit 1; }
test -n "$DOCUMENT_LOGS_VOLUME" || { echo "未发现 Document Server Logs 卷" >&2; exit 1; }
docker volume inspect "$DOCUMENT_DATA_VOLUME" >/dev/null
docker volume inspect "$DOCUMENT_LOGS_VOLUME" >/dev/null
test -s "$BACKUP_DIR/storage-${BACKUP_ID}.tar.gz"
test -s "$BACKUP_DIR/document-data-${BACKUP_ID}.tar.gz"
test -s "$BACKUP_DIR/document-logs-${BACKUP_ID}.tar.gz"
tar -tzf "$BACKUP_DIR/storage-${BACKUP_ID}.tar.gz" >/dev/null
tar -tzf "$BACKUP_DIR/document-data-${BACKUP_ID}.tar.gz" >/dev/null
tar -tzf "$BACKUP_DIR/document-logs-${BACKUP_ID}.tar.gz" >/dev/null

docker compose stop
sudo find /opt/onlyoffice-demo/storage -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
sudo tar -C /opt/onlyoffice-demo -xzf "$BACKUP_DIR/storage-${BACKUP_ID}.tar.gz"
sudo chown -R 1000:1000 /opt/onlyoffice-demo/storage

docker run --rm \
  --mount "type=volume,src=${DOCUMENT_DATA_VOLUME},dst=/data" \
  --mount "type=bind,src=${BACKUP_DIR},dst=/backup,readonly" \
  alpine:3.20 sh -eu -c "rm -rf /data/* /data/.[!.]* /data/..?*; tar -xzf /backup/document-data-${BACKUP_ID}.tar.gz -C /data"
docker run --rm \
  --mount "type=volume,src=${DOCUMENT_LOGS_VOLUME},dst=/data" \
  --mount "type=bind,src=${BACKUP_DIR},dst=/backup,readonly" \
  alpine:3.20 sh -eu -c "rm -rf /data/* /data/.[!.]* /data/..?*; tar -xzf /backup/document-logs-${BACKUP_ID}.tar.gz -C /data"

docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:8080/healthcheck
```

### 固定版本升级与回滚

升级前先完成一次同一时间点备份并保留其 `BACKUP_ID`，再保存 Compose 文件、改为已验证的固定镜像标签（不要 `latest`）并升级：

```bash
set -euo pipefail

# 若在新 shell 执行，先设置项目目录并进入该目录。
cd /opt/onlyoffice-demo
BACKUP_DIR=/var/backups/onlyoffice-demo
BACKUP_ID=20260714T120000Z

test -s "$BACKUP_DIR/storage-${BACKUP_ID}.tar.gz"
test -s "$BACKUP_DIR/document-data-${BACKUP_ID}.tar.gz"
test -s "$BACKUP_DIR/document-logs-${BACKUP_ID}.tar.gz"
tar -tzf "$BACKUP_DIR/storage-${BACKUP_ID}.tar.gz" >/dev/null
tar -tzf "$BACKUP_DIR/document-data-${BACKUP_ID}.tar.gz" >/dev/null
tar -tzf "$BACKUP_DIR/document-logs-${BACKUP_ID}.tar.gz" >/dev/null
cp compose.yaml "$BACKUP_DIR/compose-${BACKUP_ID}.before-upgrade.yaml"
docker compose config
docker compose pull document-server
docker compose up -d --build
docker compose ps
```

需要回滚时，先在仍运行的新版本容器上重新执行卷发现块，并确认 `DOCUMENT_DATA_VOLUME`、`DOCUMENT_LOGS_VOLUME` 非空。然后使用升级前同一个 `BACKUP_ID` 执行以下命令；它会恢复旧 Compose 文件以及同一时间点的 storage、Data 和 Logs：

```bash
set -euo pipefail

# 若在新 shell 执行，先设置项目目录并进入该目录。
cd /opt/onlyoffice-demo
BACKUP_DIR=/var/backups/onlyoffice-demo
BACKUP_ID=20260714T120000Z

CONTAINER_ID="$(docker compose ps -q document-server)"
test -n "$CONTAINER_ID" || { echo "document-server 未运行，无法发现卷" >&2; exit 1; }
DOCUMENT_DATA_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/www/onlyoffice/Data"}}{{.Name}}{{end}}{{end}}' "$CONTAINER_ID")"
DOCUMENT_LOGS_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/log/onlyoffice"}}{{.Name}}{{end}}{{end}}' "$CONTAINER_ID")"
test -n "$DOCUMENT_DATA_VOLUME" || { echo "未发现 Document Server Data 卷" >&2; exit 1; }
test -n "$DOCUMENT_LOGS_VOLUME" || { echo "未发现 Document Server Logs 卷" >&2; exit 1; }
docker volume inspect "$DOCUMENT_DATA_VOLUME" >/dev/null
docker volume inspect "$DOCUMENT_LOGS_VOLUME" >/dev/null
test -s "$BACKUP_DIR/compose-${BACKUP_ID}.before-upgrade.yaml"
test -s "$BACKUP_DIR/storage-${BACKUP_ID}.tar.gz"
test -s "$BACKUP_DIR/document-data-${BACKUP_ID}.tar.gz"
test -s "$BACKUP_DIR/document-logs-${BACKUP_ID}.tar.gz"
tar -tzf "$BACKUP_DIR/storage-${BACKUP_ID}.tar.gz" >/dev/null
tar -tzf "$BACKUP_DIR/document-data-${BACKUP_ID}.tar.gz" >/dev/null
tar -tzf "$BACKUP_DIR/document-logs-${BACKUP_ID}.tar.gz" >/dev/null
docker compose -f "$BACKUP_DIR/compose-${BACKUP_ID}.before-upgrade.yaml" config --quiet

docker compose stop
cp "$BACKUP_DIR/compose-${BACKUP_ID}.before-upgrade.yaml" compose.yaml
sudo find /opt/onlyoffice-demo/storage -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
sudo tar -C /opt/onlyoffice-demo -xzf "$BACKUP_DIR/storage-${BACKUP_ID}.tar.gz"
sudo chown -R 1000:1000 /opt/onlyoffice-demo/storage
docker run --rm --mount "type=volume,src=${DOCUMENT_DATA_VOLUME},dst=/data" --mount "type=bind,src=${BACKUP_DIR},dst=/backup,readonly" alpine:3.20 sh -eu -c "rm -rf /data/* /data/.[!.]* /data/..?*; tar -xzf /backup/document-data-${BACKUP_ID}.tar.gz -C /data"
docker run --rm --mount "type=volume,src=${DOCUMENT_LOGS_VOLUME},dst=/data" --mount "type=bind,src=${BACKUP_DIR},dst=/backup,readonly" alpine:3.20 sh -eu -c "rm -rf /data/* /data/.[!.]* /data/..?*; tar -xzf /backup/document-logs-${BACKUP_ID}.tar.gz -C /data"
docker compose up -d
docker compose ps
```

如果新版本已经完成不可逆的数据迁移，不要在没有供应商兼容性确认和完整备份的情况下盲目降级。
