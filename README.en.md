# OrangeHub

[简体中文](README.md) | English

![Release](https://github.com/djteang/OrangeHub/actions/workflows/release.yml/badge.svg)

OrangeHub is a Windows desktop workspace for remote servers, databases, and Docker. It brings terminal access, file transfer, database tools, and container management into one local-first application.

## Features

- SSH terminal sessions and SFTP, FTP, and FTPS file transfer.
- SQL connections for MySQL, MariaDB, TiDB, OceanBase, Apache Doris, StarRocks, ClickHouse, Microsoft SQL Server, Oracle, PostgreSQL, CockroachDB, Neon, and SQLite.
- Redis and MongoDB workspaces, plus Docker container, image, network, and volume management.
- A local encrypted credential vault, saved SQL snippets, and session activity history.
- Optional AI assistance configured with your own compatible API endpoint and key.
- Signed desktop updates delivered through GitHub Releases.

The current release workflow packages Windows x64 installers, a portable executable, and Linux DEB/RPM packages. macOS packages are not published.

## Download

Download the latest Windows installer, portable executable, or Linux package from [GitHub Releases](https://github.com/djteang/OrangeHub/releases/latest).

## Development

Requirements: Windows 10 or 11, Node.js 22.12 or newer, Rust 1.94 or newer, and the Tauri Windows build prerequisites, including WebView2 and Microsoft C++ build tools.

```powershell
npm ci
npm run tauri dev
```

Build the Windows installers locally:

```powershell
npm run tauri build
```

The application frontend can also be run independently with `npm run dev`. The Rust backend and Tauri configuration are in `src-tauri/`.

## Releases and updates

Pushing a `v*.*.*` tag that matches the versions in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` starts the Windows and Linux release workflow. It builds the NSIS and MSI installers, publishes `OrangeHub-Portable.zip`, Linux DEB/RPM packages, signs updater artifacts, and publishes `latest.json` to the GitHub Release. See [`UPDATES.md`](UPDATES.md) for signing setup and release steps.

## License

OrangeHub is licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](LICENSE.txt) (CC BY-NC-SA 4.0).
