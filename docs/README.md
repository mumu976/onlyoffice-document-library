# ONLYOFFICE 文档中心

这里不是按文件名堆放的资料列表，而是按“你现在要完成什么”组织的阅读路线。项目启动后，也可以直接访问 <http://localhost:3000/guides> 在本地文档中心阅读。

## 第一次使用

1. [10 分钟快速启动](quick-start.md)：已经安装 Docker，只想尽快跑通 Word 和 Excel。
2. [Windows 新手指南](windows-beginner-guide.md)：从 Docker Desktop 安装开始，适合本地电脑。
3. [Linux 新手指南](linux-beginner-guide.md)：从 Ubuntu 服务器准备开始，先完成受限 IP 试运行。
4. [本地演示与验收记录](demo-guide.md)：按实际证据检查编辑、保存、重开和下载。

## 准备正式部署

1. [Linux 高级部署指南](linux-deployment.md)：域名、Nginx HTTPS、防火墙、备份、恢复、升级和回滚。
2. [后端安装与 REST API](backend-installation.md)：环境变量、存储格式、接口、JWT 与 callback。
3. [故障排查手册](troubleshooting.md)：从服务健康、端口、编辑器加载到保存问题逐层定位。

> [!WARNING]
> 当前演示没有登录、权限和租户隔离。服务器 IP 试运行不等于正式上线；公网使用前必须增加 HTTPS、认证网关和访问控制。

## 进行二次开发

- [前端 JavaScript 库](frontend-library.md)：`OnlyOfficeEditor` 的构造方式、事件、生命周期和可运行示例。
- [后端安装与 REST API](backend-installation.md)：文件 CRUD、编辑配置、保存回调与错误结构。
- [ONLYOFFICE 集成调研报告](research-report.md)：方案比较、选型边界和官方依据。

## 按问题查找

| 现在的问题 | 建议入口 |
| --- | --- |
| Docker 还没有安装 | [Windows 新手指南](windows-beginner-guide.md) / [Linux 新手指南](linux-beginner-guide.md) |
| 服务启动了但网页打不开 | [故障排查](troubleshooting.md) |
| 文件列表正常但编辑器空白 | [故障排查](troubleshooting.md) → 编辑器加载 |
| 修改后没有保存 | [故障排查](troubleshooting.md) → callback 与版本 |
| 需要域名和 HTTPS | [Linux 高级部署](linux-deployment.md) |
| 需要备份、恢复或回滚 | [Linux 高级部署](linux-deployment.md) → 备份与回滚 |
| 需要接入自己的前端 | [前端 JavaScript 库](frontend-library.md) |
| 需要接入自己的后端 | [后端安装与 REST API](backend-installation.md) |

## 建议验收顺序

```mermaid
flowchart LR
    A["服务 healthy"] --> B["新建 Word"]
    B --> C["编辑并重开"]
    C --> D["新建 Excel"]
    D --> E["公式保存并重开"]
    E --> F["下载并本地打开"]
    F --> G["备份与恢复演练"]
```

不要只以“网页能打开”作为完成标准。至少验证 Word、Excel 的编辑、同步、重新打开和下载；正式部署还要完成备份恢复演练。

[返回项目首页](../README.md)
