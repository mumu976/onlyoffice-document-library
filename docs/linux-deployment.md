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

`ALLOW_PRIVATE_IP_ADDRESS=true` 是因为 Document Server 要从隔离 Compose 网络访问 `http://app:3000`；保持 `ALLOW_META_IP_ADDRESS` 禁用，两个服务留在同一 Compose 网络。该设置不是 Express callback URL 白名单的替代品。

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

```bash
sudo systemctl enable --now docker
tar -C /opt/onlyoffice-demo -czf /var/backups/onlyoffice-storage-$(date +%F).tar.gz storage
docker run --rm -v onlyoffice-document-library_document_data:/data -v /var/backups:/backup alpine tar -czf /backup/document-data-$(date +%F).tar.gz -C /data .
docker run --rm -v onlyoffice-document-library_document_logs:/data -v /var/backups:/backup alpine tar -czf /backup/document-logs-$(date +%F).tar.gz -C /data .
```

恢复 bind mount：`docker compose stop`；清空 `/opt/onlyoffice-demo/storage` 后执行 `sudo tar -C /opt/onlyoffice-demo -xzf /var/backups/onlyoffice-storage-YYYY-MM-DD.tar.gz`，再 `sudo chown -R 1000:1000 /opt/onlyoffice-demo/storage` 和 `docker compose up -d`。恢复 named volume 可用 `docker run --rm -v onlyoffice-document-library_document_data:/data -v /var/backups:/backup alpine sh -c 'rm -rf /data/* && tar -xzf /backup/document-data-YYYY-MM-DD.tar.gz -C /data'`。

升级前 `cp compose.yaml compose.yaml.before-upgrade`，备份 `storage` 与两个 named volume，改为已验证的固定镜像标签（不要 `latest`），再执行 `docker compose config && docker compose pull document-server && docker compose up -d --build`。回滚：`docker compose stop`、`cp compose.yaml.before-upgrade compose.yaml`、恢复同一时间点的 storage 备份、`docker compose up -d`、`docker compose ps`。不要让新版本写入旧版本不兼容数据后盲目降级。
