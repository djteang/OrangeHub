# OrangeHub

OrangeHub 是一款面向开发者的桌面工作区，将 SSH、SFTP/FTP、数据库查询与 Docker 管理放在同一个客户端中。桌面客户端使用 React、Tauri 和 Rust；产品页源码位于 `product-page/`。

## 本地开发

```powershell
npm ci
npm run tauri dev
```

构建 Windows 安装包：

```powershell
npm run tauri build
```

## 发布与自动更新

推送与 `src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 版本一致的 `v*.*.*` 标签后，GitHub Actions 会构建 Windows 安装包并创建 Release。客户端更新使用 Tauri 签名更新清单。

首次配置、签名密钥和发布步骤见 [UPDATES.md](UPDATES.md)。

## 产品页

产品页是独立的 Vue + Vite 项目：

```powershell
cd product-page
npm ci
npm run dev
```
