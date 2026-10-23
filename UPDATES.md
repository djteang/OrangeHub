# OrangeHub 发布与更新

桌面端使用 Tauri 官方 updater，GitHub Releases 作为发布源。发布工作流位于 `.github/workflows/release.yml`。

## 首次配置

1. 在 GitHub 仓库的 Actions Secrets 中添加 `TAURI_SIGNING_PRIVATE_KEY`，值为本机生成的 `%USERPROFILE%\.tauri\orangehub-updater.key` 文件内容。也可以用 GitHub CLI 从 PowerShell 设置，不会把私钥写入命令历史：

   ```powershell
   Get-Content -Raw "$env:USERPROFILE\.tauri\orangehub-updater.key" | gh secret set TAURI_SIGNING_PRIVATE_KEY --repo djteang/OrangeHub
   ```
2. 如果生成私钥时设置了密码，再添加 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`；没有密码时可留空。
3. 客户端更新地址和产品页下载地址均指向 `djteang/OrangeHub`；如仓库迁移，需同步修改 `src-tauri/tauri.conf.json` 和 `product-page/.env`。

公钥已经写入 `src-tauri/tauri.conf.json`，私钥只应保存在本机和 GitHub Secret 中，不能提交到仓库。

## 发布

修改 `src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 的版本号后提交并推送标签：

```powershell
git tag v0.1.1
git push origin v0.1.1
```

工作流会上传 `OrangeHub-Setup.exe`、MSI、签名文件和 `latest.json`。已安装客户端点击“检查更新”时，会检查 `latest.json`、验证签名，用户确认后下载并安装新版本。

GitHub 仓库必须公开 Release 资产，且 Release 不能是草稿，否则客户端无法读取更新清单。
