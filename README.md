# ONLYOFFICE 文档库

这是一个可以在自己的电脑或服务器上运行的 Word、Excel 文档库示例。启动后，你可以在浏览器里新建、上传、编辑、保存、下载和删除 `.docx`、`.xlsx` 文件。

它由两部分组成：本项目负责文件列表和保存，ONLYOFFICE Docs 负责浏览器里的 Word、Excel 编辑器。第一次使用不需要先理解代码或接口，请根据你的场景选择入口。

## 选择你的使用方式

### 我只想在 Windows 电脑上使用

从安装 Docker Desktop、下载项目到完成第一次 Word 和 Excel 编辑，按下面的指南逐步操作：

➡️ [Windows 新手指南](docs/windows-beginner-guide.md)

### 我要部署到 Linux 服务器

适用于 Ubuntu 22.04/24.04 x86_64。指南包含服务器准备、Docker 安装、IP 试运行、端口设置、启动检查和日常维护：

➡️ [Linux 新手部署指南](docs/linux-beginner-guide.md)

### 我是开发或运维人员

- [ONLYOFFICE 选型与集成调研](docs/research-report.md)
- [后端安装、配置与 REST API](docs/backend-installation.md)
- [前端 JavaScript 库及使用方法](docs/frontend-library.md)
- [Ubuntu/Linux 高级部署、HTTPS、备份与回滚](docs/linux-deployment.md)
- [故障排查手册](docs/troubleshooting.md)
- [本地演示与验收记录](docs/demo-guide.md)

## 使用前必须知道的安全限制

这个示例没有登录、用户权限、分享控制或身份审计。它适合本机、可信局域网和集成开发，不可以不加保护地直接放到互联网。正式公网使用必须配置 HTTPS 和带登录认证的反向代理，具体见 [Linux 高级部署手册](docs/linux-deployment.md)。

## 已支持的功能

- 新建 Word 和 Excel；
- 上传已有 `.docx`、`.xlsx`；
- 在浏览器中编辑并保存回本项目；
- 重新打开、下载和删除文件；
- JWT 编辑配置、保存回调验证和 OOXML 文件校验；
- Windows Docker Desktop 与 Ubuntu Docker Compose 部署。

项目自动化检查命令是 `npm test`。此前 Word、Excel 的实际操作结果与截图见[本地演示与验收记录](docs/demo-guide.md)。
