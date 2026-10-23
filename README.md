# OrangeHub

[简体中文](README.md) | [English](README.en.md)

![Release](https://github.com/djteang/OrangeHub/actions/workflows/release.yml/badge.svg)

OrangeHub 是一款面向 Windows 的桌面工作台，用于管理远程服务器、数据库和 Docker。它将终端访问、文件传输、数据库操作和容器管理整合在一个以本地使用为主的应用中。

## 功能

- SSH 终端，以及 SFTP、FTP 和 FTPS 文件传输。
- 支持 MySQL、MariaDB、TiDB、OceanBase、Apache Doris、StarRocks、ClickHouse、Microsoft SQL Server、Oracle、PostgreSQL、CockroachDB、Neon 和 SQLite 数据库连接。
- Redis 和 MongoDB 工作区，以及 Docker 容器、镜像、网络和卷管理。
- 本地加密凭据库、SQL 收藏和会话活动历史。
- 可选 AI 助手，可配置为使用兼容的 API 服务地址和密钥。
- 通过 GitHub Releases 分发并签名的桌面端更新。

当前发布流程提供 Windows x64 安装包，暂未发布 macOS 和 Linux 安装包。

## 下载

前往 [GitHub Releases](https://github.com/djteang/OrangeHub/releases/latest) 下载最新的 Windows 安装包。

## 开发

开发环境要求：Windows 10 或 11、Node.js 22.12 或更高版本、Rust 1.94 或更高版本，以及 Tauri 所需的 Windows 构建环境（包括 WebView2 和 Microsoft C++ 构建工具）。

```powershell
npm ci
npm run tauri dev
```

在本机打包 Windows 安装程序：

```powershell
npm run tauri build
```

也可以通过 `npm run dev` 单独运行应用前端。Rust 后端和 Tauri 配置位于 `src-tauri/`。

## 发布与更新

推送到 `main` 会触发 Windows 安装包构建，产物保存在 Actions 中。推送符合 `v*.*.*` 格式且与 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 中版本一致的标签后，会触发正式发布工作流：构建 NSIS 和 MSI 安装包、签名更新文件，并将 `latest.json` 发布到对应的 GitHub Release。Windows NSIS 安装器使用 OrangeHub 品牌界面，并可分别选择程序和本地数据目录。签名配置和发布步骤请参阅 [`UPDATES.md`](UPDATES.md)。

## 许可证

OrangeHub 采用 [知识共享署名-非商业性使用-相同方式共享 4.0 国际许可协议](LICENSE.txt)（CC BY-NC-SA 4.0）。
