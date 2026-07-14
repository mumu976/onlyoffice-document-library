# Ubuntu Docker Compose 部署

目标环境为 Ubuntu 22.04/24.04 x86_64。官方 Docs Linux Docker 基线为双核 2 GHz、4 GB RAM、40 GB 磁盘和 4 GB Swap，见[官方要求](https://helpcenter.onlyoffice.com/docs/installation/docs-community-sys-reqs-linux.aspx)。实际容量按并发编辑数和文档大小压测。Docker Engine 仓库流程以 [Docker 官方 Ubuntu 安装文档](https://docs.docker.com/engine/install/ubuntu/) 为准。

## Docker Engine 与 Compose

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker compose version
```

## 项目与 storage 权限

```bash
sudo mkdir -p /opt/onlyoffice-demo
sudo cp -a . /opt/onlyoffice-demo/
cd /opt/onlyoffice-demo
sudo mkdir -p /opt/onlyoffice-demo/storage
sudo chown -R 1000:1000 /opt/onlyoffice-demo/storage
cp .env.example .env
openssl rand -hex 32
```

将随机值写入 `.env` 的 `JWT_SECRET`。IP 示例是 `DOCUMENT_SERVER_PUBLIC_URL=http://192.168.1.20:8080`，域名示例是 `DOCUMENT_SERVER_PUBLIC_URL=https://docs.example.com`。`DOCUMENT_SERVER_INTERNAL_URL=http://document-server`、`APP_INTERNAL_URL=http://app:3000` 保持 Compose 服务名。

**必须先执行 `mkdir` 和 `chown 1000:1000`。** Dockerfile 对镜像内 `/app/storage` 的 chown 会被 `./storage:/app/storage` bind mount 遮蔽；宿主机属主不正确时 Node 用户无法写入。

## 启动、健康与防火墙

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

LAN 演示端口：

```bash
sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 8080 proto tcp
sudo ufw enable
```

`ALLOW_PRIVATE_IP_ADDRESS=true` 是因为 Document Server 要从 Compose 网络访问私有地址 `http://app:3000`。该开关也扩大了 Document Server 的服务端请求范围：一旦攻击者能影响待获取 URL，就可能探测或访问宿主机、LAN 和其他私网服务，形成 SSRF 或横向访问。Compose 默认网络只隔离容器命名空间，**不会**阻断容器到宿主机或 LAN 的出站连接；因此保持 `ALLOW_META_IP_ADDRESS` 禁用、只让两个服务加入项目网络、限制 3000/8080 入站，并在基础设施层按需限制 Document Server 出站。该设置绝不是 Express callback URL origin 白名单或认证反向代理的替代品。

## 双域名 Nginx HTTPS

`files.example.com` 反代应用 3000，`docs.example.com` 反代 Docs 8080：

```nginx
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
server {
    listen 443 ssl http2;
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
    listen 443 ssl http2;
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

设置 `DOCUMENT_SERVER_PUBLIC_URL=https://docs.example.com`。两个浏览器可见 URL 必须同时 HTTPS，否则 mixed content 会阻止 API 或 iframe。应用没有登录鉴权，互联网暴露前必须接入认证反向代理、限流和审计。

## 开机、备份、恢复与回滚

启用 Docker 开机启动：

```bash
sudo systemctl enable --now docker
```

### 动态发现并验证 named volume

不要猜测 Compose 项目前缀，也不要把卷名硬编码到 `docker run -v`。在 Document Server 正常运行时，从该容器的 `Mounts` 读取两个真实卷名，并在任何备份或恢复前拒绝空值、拒绝不存在的卷：

```bash
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
BACKUP_DIR=/var/backups/onlyoffice-demo
BACKUP_ID="$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$BACKUP_DIR"

docker compose stop
trap 'docker compose start >/dev/null 2>&1 || true' EXIT
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
BACKUP_DIR=/var/backups/onlyoffice-demo
BACKUP_ID=20260714T120000Z

test -s "$BACKUP_DIR/storage-${BACKUP_ID}.tar.gz"
test -s "$BACKUP_DIR/document-data-${BACKUP_ID}.tar.gz"
test -s "$BACKUP_DIR/document-logs-${BACKUP_ID}.tar.gz"
test -n "$DOCUMENT_DATA_VOLUME" && docker volume inspect "$DOCUMENT_DATA_VOLUME" >/dev/null
test -n "$DOCUMENT_LOGS_VOLUME" && docker volume inspect "$DOCUMENT_LOGS_VOLUME" >/dev/null

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
cp compose.yaml "$BACKUP_DIR/compose-${BACKUP_ID}.before-upgrade.yaml"
docker compose config
docker compose pull document-server
docker compose up -d --build
docker compose ps
```

需要回滚时，先在仍运行的新版本容器上重新执行卷发现块，并确认 `DOCUMENT_DATA_VOLUME`、`DOCUMENT_LOGS_VOLUME` 非空。然后使用升级前同一个 `BACKUP_ID` 执行以下命令；它会恢复旧 Compose 文件以及同一时间点的 storage、Data 和 Logs：

```bash
test -s "$BACKUP_DIR/compose-${BACKUP_ID}.before-upgrade.yaml"
test -s "$BACKUP_DIR/storage-${BACKUP_ID}.tar.gz"
test -s "$BACKUP_DIR/document-data-${BACKUP_ID}.tar.gz"
test -s "$BACKUP_DIR/document-logs-${BACKUP_ID}.tar.gz"
test -n "$DOCUMENT_DATA_VOLUME" && docker volume inspect "$DOCUMENT_DATA_VOLUME" >/dev/null
test -n "$DOCUMENT_LOGS_VOLUME" && docker volume inspect "$DOCUMENT_LOGS_VOLUME" >/dev/null

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
