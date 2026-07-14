# 本地演示与验收记录

以下步骤用于 Windows Docker Desktop。结果栏保持未勾选，等 Task 11 实机演示后填写证据。

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

- [ ] 新建 Word，输入内容，保存并关闭。
- [ ] 重新打开 Word，内容仍存在。
- [ ] 上传 `.docx`，打开并修改。
- [ ] 下载 `.docx`，本地 Office 软件可打开。
- [ ] 保留 Word 截图或带时间验收记录。

记录：`Word 证据：____________________`  `时间：____________________`

## Excel

- [ ] 新建 Excel，填写单元格和公式，保存并关闭。
- [ ] 重新打开 Excel，单元格和公式仍存在。
- [ ] 上传 `.xlsx`，打开并修改。
- [ ] 下载 `.xlsx`，本地 Office 软件可打开。
- [ ] 保留 Excel 截图或带时间验收记录。

记录：`Excel 证据：____________________`  `时间：____________________`

## 文件与服务

- [ ] 删除文件后列表没有该文件。
- [ ] 删除文件后 `storage/<uuid>` 目录不存在。
- [ ] 自动化测试通过。
- [ ] `docker compose ps` 显示两个服务健康。

```text
compose ps：____________________
npm test：____________________
容器版本：____________________
删除后 storage：____________________
```

关闭：`docker compose down`
