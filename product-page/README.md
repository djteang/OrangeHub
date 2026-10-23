# OrangeHub Product Page

The project website is a standalone Vue 3 and Vite app. It can be developed and deployed independently from the React and Tauri desktop client in the repository root.

## Local development

Requirements: Node.js 22.12 or newer.

```powershell
npm ci
npm run dev
```

Create a production build with:

```powershell
npm run build
```

Vite writes the static site to `dist/`. Deploy the contents of that directory to a static web host.

## Configuration

Copy `.env.example` to `.env` to set any of the following values:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_GITHUB_REPO` | `djteang/OrangeHub` | GitHub repository used for source and release links. |
| `VITE_WINDOWS_DOWNLOAD_URL` | Latest Release's `OrangeHub-Setup.exe` | Optional direct Windows installer URL. |
| `VITE_AUTHOR_EMAIL` | `hello@czdgg.top` | Contact address for the site. |

The Windows download link expects the Release workflow to publish an asset named `OrangeHub-Setup.exe`. Release signing and client auto-update configuration are maintained in the repository root; see [`../UPDATES.md`](../UPDATES.md).
