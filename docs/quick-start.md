# 10 分钟快速启动

这条路线只负责让你完成第一次 Word 和 Excel 编辑。遇到安装、网络或保存问题时，再进入 [Windows 新手指南](windows-beginner-guide.md)、[Linux 新手指南](linux-beginner-guide.md)或[故障排查](troubleshooting.md)。

## 开始前

准备好 Docker Desktop（Windows）或 Docker Engine + Compose 插件（Ubuntu），并确认下面命令能显示版本：

```text
docker version
docker compose version
```

建议至少准备 4 GB 可用内存和 10 GB 以上空闲磁盘。第一次启动需要下载较大的 ONLYOFFICE 镜像。

## Windows

打开 PowerShell，进入项目目录：

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

最后一条命令应返回 `{"data":{"status":"ready"}}`。浏览器打开 <http://localhost:3000>。

## Ubuntu 服务器 IP 试运行

下面方式会让 3000、8080 监听服务器网卡，只能用于已经通过云安全组或上游防火墙限制可信来源的试运行环境。当前项目没有登录，不得把这两个端口直接开放给整个互联网。

```bash
cp .env.example .env
SECRET="$(openssl rand -hex 32)"
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" .env
unset SECRET
sed -i "s|^DOCUMENT_SERVER_PUBLIC_URL=.*|DOCUMENT_SERVER_PUBLIC_URL=http://服务器IP:8080|" .env
sudo mkdir -p storage
sudo chown -R 1000:1000 storage
sudo docker compose -f compose.yaml -f compose.lan.yaml up -d --build
sudo docker compose ps
curl -fsS http://127.0.0.1:3000/health/ready
```

把命令中的 `服务器IP` 换成真实地址，然后在可信电脑打开 `http://服务器IP:3000`。正式上线必须进入 [Linux 高级部署指南](linux-deployment.md)，使用域名、HTTPS 和认证网关。

## 完成 Word 和 Excel 验收

1. 点击“新建 Word”，输入一句文字，等待页面提示同步，关闭并重新打开，确认内容仍在。
2. 点击“新建 Excel”，填写两个数字和一个求和公式，等待同步，关闭并重新打开，确认单元格和公式仍在。
3. 分别下载文件，确认本地 Office 兼容软件可以打开。

## 停止

```text
docker compose down
```

不要添加 `-v`，也不要删除 `storage`；否则可能删除文档或 ONLYOFFICE 数据。Linux IP 试运行也可以使用普通 `docker compose down` 停止同一 Compose 项目。

## 接下来读什么

- Windows 本地长期使用：[Windows 新手指南](windows-beginner-guide.md)
- Ubuntu 服务器试运行：[Linux 新手指南](linux-beginner-guide.md)
- 域名、HTTPS、备份与回滚：[Linux 高级部署](linux-deployment.md)
- 遇到启动、编辑或保存问题：[故障排查](troubleshooting.md)

[返回文档中心](README.md)
