# OrangeHub 产品页

这是一个独立的 Vue 3 + Vite 项目，与根目录的 React/Tauri 桌面客户端分开安装和构建。

```powershell
cd product-page
npm install
npm run dev
```

生产构建输出到 `product-page/dist/`：

```powershell
npm run build
```

复制 `.env.example` 为 `.env` 后，可以配置 GitHub 仓库、Windows 安装包直链和作者邮箱。根目录的 GitHub Actions 会在推送 `v*.*.*` 标签时构建并发布 `OrangeHub-Setup.exe`。客户端更新使用同一个 GitHub Release 的 `latest.json`，安装包和更新清单都必须由 Tauri 签名。
