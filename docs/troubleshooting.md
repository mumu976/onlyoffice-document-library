# 故障排查

| 症状 | 原因线索 | 检查 | 修复 |
| --- | --- | --- | --- |
| 容器不健康 | 初始化、资源不足或端口冲突 | `docker compose ps`；`docker compose logs --tail=200 document-server`；`curl -i http://localhost:8080/healthcheck` | 等待初始化、释放端口，按官方基线增加资源 |
| 应用存活但未就绪 | storage 不可读或 Document Server 未健康 | 对比 `/health/live` 与 `/health/ready`；查看两个容器日志 | 修复存储权限或 Document Server，再等待 readiness 恢复 |
| Docs 无法获取内容 | `APP_INTERNAL_URL`、网络或 app 未就绪 | `docker compose exec document-server curl -v http://app:3000/health`；Network 查看 `/content` | 保持 `APP_INTERNAL_URL=http://app:3000`，确认同一 network |
| callback 不可达 | callback 地址/端口错误或应用停止 | `docker compose exec document-server curl -v http://app:3000/health`；`docker compose logs app` | 修正 `APP_INTERNAL_URL`，检查健康状态 |
| JWT mismatch | 两服务密钥、长度或 header 不同 | 依次运行 `docker compose exec -T app sh -c 'test "${#JWT_SECRET}" -ge 32'`、`docker compose exec -T document-server bash -lc 'test "${#JWT_SECRET}" -ge 32'`；再按下方命令只比较哈希、不输出密钥；Network 查看 Authorization | 同步 `.env` 的 `JWT_SECRET`，执行 `docker compose up -d --force-recreate` |
| 编辑器空白页 | CSP、API URL 或 mixed content | 浏览器 Console 看 CSP/mixed-content；Network 打开 `<DOCS_URL>/web-apps/apps/api/documents/api.js` | CSP 放行 Docs origin，浏览器可见地址统一 HTTPS |
| mixed content | HTTPS 页面加载 HTTP Docs | Console 搜索 `Mixed Content`；检查 `/api/config` | 设置 `DOCUMENT_SERVER_PUBLIC_URL=https://docs.example.com` |
| 上传拒绝 | 类型、大小或 OOXML 结构错误 | `curl -v -F 'file=@file.docx' http://localhost:3000/api/files/upload`；查看 `error.code` | 使用 `.docx`/`.xlsx`、正确 MIME 和必需 ZIP 部件 |
| storage 权限错误 | bind mount 遮蔽镜像属主 | `ls -ld /opt/onlyoffice-demo/storage`；`docker compose exec app id` | `sudo mkdir -p /opt/onlyoffice-demo/storage && sudo chown -R 1000:1000 /opt/onlyoffice-demo/storage` |
| 字体/排版变化 | 镜像缺少字体 | `docker compose exec document-server fc-list | head`；截图比对 | 安装并挂载许可字体后重建 |
| 重新打开旧内容 | key 未随 revision 变化或 callback 未保存 | `curl http://localhost:3000/api/files` 查看该文件的 `revision`；`curl http://localhost:3000/api/files/<ID>/editor-config` 查看 `data.document.key` | 等待状态 2/6 callback，确认 revision 加一 |
| callback 失败且文件已有新 revision | 旧编辑会话迟到保存 | 比较 callback key 与当前 `<ID>-<revision>` | 关闭旧页面并重新打开最新文件；系统会拒绝旧 revision 覆盖 |

callback 失败仍返回 HTTP `200` 和 `{"error":1}`，原因写入结构化日志，不写 JWT 或文件正文；状态语义见[官方 callback handler](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/)。

JWT 哈希比较命令只把两个容器内密钥的 SHA-256 放入当前 shell 变量，不打印密钥或哈希：

```bash
APP_JWT_HASH="$(docker compose exec -T app sh -c 'printf %s "$JWT_SECRET" | sha256sum | cut -d " " -f 1')"
DOCS_JWT_HASH="$(docker compose exec -T document-server bash -lc 'printf %s "$JWT_SECRET" | sha256sum | cut -d " " -f 1')"
test -n "$APP_JWT_HASH" && test "$APP_JWT_HASH" = "$DOCS_JWT_HASH" && echo "JWT_SECRET 已设置且两端一致"
unset APP_JWT_HASH DOCS_JWT_HASH
```

任一 `test` 返回非零都表示配置未满足要求；不要使用 `docker compose config` 检查密钥，因为其展开结果会把 `JWT_SECRET` 明文写到终端或日志。
