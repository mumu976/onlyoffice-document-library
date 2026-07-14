# ONLYOFFICE 文档库集成演示

自建 ONLYOFFICE Docs 集成样例：Express 提供文件管理 REST API、OOXML 校验、JWT 配置和 callback 保存；ONLYOFFICE Docs Community Edition 提供 Word/Excel 编辑器；Docker Compose 编排两个服务。本项目不部署 DocSpace 或 Workspace，也没有登录鉴权。

## Windows 五分钟启动

安装并启动 Docker Desktop，在 PowerShell 执行：

```powershell
Copy-Item .env.example .env
# 编辑 .env，将 JWT_SECRET 替换为至少 32 个随机字符
npm ci
npm run templates
docker compose up -d --build
docker compose ps
```

浏览器打开 `http://localhost:3000`，Docs 默认在 `http://localhost:8080`。干净关闭：

```powershell
docker compose down
```

## 架构与功能

浏览器 → Express（`3000`）→ `storage/`；浏览器同时加载 Docs（`8080`）编辑器。Compose 内部使用 `http://app:3000` 和 `http://document-server`。支持新建、上传、列表、打开编辑、保存回存、下载和删除 `.docx`/`.xlsx`，以 UUID 目录和 revision/key 避免旧缓存。

安全警告：应用没有登录、用户权限、分享或身份审计，不能直接暴露公网；公网部署必须位于认证反向代理和 HTTPS 后。

## 文档

- [调研报告](docs/research-report.md)
- [后端安装与 REST API](docs/backend-installation.md)
- [前端 JavaScript 库](docs/frontend-library.md)
- [Ubuntu/Linux 部署](docs/linux-deployment.md)
- [故障排查](docs/troubleshooting.md)
- [演示与验收记录](docs/demo-guide.md)

## 测试

```powershell
npm test
```

本地演示是否通过以[演示指南](docs/demo-guide.md)的实机证据为准；Task 11 记录前，本 README 不宣称演示成功。
