# 更新记录

本项目采用日期记录重要变化；固定依赖和镜像版本仍以 `package-lock.json`、`Dockerfile` 和 `compose.yaml` 为准。

## 2026-07-15

- 默认 Docker 端口改为只监听本机，并增加可信局域网试运行覆盖配置。
- 拒绝旧 revision 的 ONLYOFFICE 保存 callback，避免迟到会话覆盖新内容。
- 文件列表改为只读取 metadata，下载改为单次一致性读取。
- 增加 liveness、readiness、GitHub Actions 和 Dependabot。
- 增加快速启动入口并统一跨平台文本换行规则。

## 2026-07-14

- 完成 Word、Excel 新建、上传、编辑回存、下载和删除闭环。
- 增加 Windows、Linux 部署文档以及本地实机演示证据。
