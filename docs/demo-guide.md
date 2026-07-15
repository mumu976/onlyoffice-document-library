# 本地演示与验收记录

以下步骤用于 Windows Docker Desktop。2026-07-14T16:37Z 已完成 Task 11 实机演示，证据保存在 `docs/evidence/`。

## 启动与证据

```powershell
Copy-Item .env.example .env
# 在 .env 设置至少 32 字符 JWT_SECRET
New-Item -ItemType Directory -Force .\logs | Out-Null
docker compose up -d --build
docker compose ps | Tee-Object .\logs\compose-ps.txt
docker compose logs --tail=200 app document-server | Tee-Object .\logs\compose-logs.txt
npm test 2>&1 | Tee-Object .\logs\npm-test.txt
docker compose images | Tee-Object .\logs\container-versions.txt
```

## Word

- [x] 新建 Word，输入内容，保存并关闭。
- [x] 重新打开 Word，内容仍存在。
- [x] 上传 `.docx`，打开并修改。
- [x] 下载 `.docx`，本地 Office 软件可打开。
- [x] 保留 Word 截图或带时间验收记录。

记录：`Word 证据：docs/evidence/word-editor.png、docs/evidence/file-lifecycle.txt`  `时间：2026-07-14T16:37Z`

## Excel

- [x] 新建 Excel，填写单元格和公式，保存并关闭。
- [x] 重新打开 Excel，单元格和公式仍存在。
- [x] 上传 `.xlsx`，打开并修改。
- [x] 下载 `.xlsx`，本地 Office 软件可打开。
- [x] 保留 Excel 截图或带时间验收记录。

记录：`Excel 证据：docs/evidence/excel-editor.png、docs/evidence/file-lifecycle.txt`  `时间：2026-07-14T16:37Z`

## 文件与服务

- [x] 删除文件后列表没有该文件。
- [x] 删除文件后 `storage/<uuid>` 目录不存在。
- [x] 自动化测试通过。
- [x] `docker compose ps` 显示两个服务健康。

```text
compose ps：docs/evidence/compose-ps.txt
npm test：docs/evidence/test-output.txt
完整验证链：docs/evidence/verification-output.txt
容器版本：docs/evidence/versions.txt
删除后 storage：docs/evidence/file-lifecycle.txt（上传副本 UUID 目录剩余 0）
```

关闭：`docker compose down`
