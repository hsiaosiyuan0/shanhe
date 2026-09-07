# macOS 自动打包与发布

[← 返回产品介绍](../README.md) · [桌面版安装](DESKTOP.md)

[Build macOS app](https://github.com/hsiaosiyuan0/shanhe/actions/workflows/macos.yml) 分别在 Apple Silicon 和 Intel 的 GitHub 托管 macOS 机器上运行，不依赖个人电脑。

## 什么时候构建

| 触发方式               | 结果                                                |
| ---------------------- | --------------------------------------------------- |
| 推送到 `main`          | 测试、打包并上传两个架构的 Actions 产物，保留 30 天 |
| Pull Request           | 同样检查和打包，供审阅；不发布 Release              |
| Actions → Run workflow | 手动构建所选分支或标签；不发布 Release              |
| 推送 `v*` 标签         | 检查版本后构建，两个架构均成功才发布 GitHub Release |

同一分支的旧构建会被新提交取消，版本标签构建不自动取消。日常构建只有仓库读取权限；发布 job 单独使用 GitHub 自动提供的 `GITHUB_TOKEN` 写入 Release，无需个人访问令牌。

## 产物与检查

每个架构的 `macos-arm64` / `macos-x64` artifact 包含：

- `shanhe-<版本>-macos-<架构>.dmg`：带 Applications 快捷方式的拖拽安装镜像。
- `shanhe-<版本>-macos-<架构>.zip`：保留执行权限和签名的 App 压缩包。
- `shanhe-<版本>-macos-<架构>.sha256`：两份文件的 SHA-256 校验值。

CI 执行回归测试后打包 Swift 外壳、前端、本地后端、生产依赖和官方 Node.js 24 运行时。App 版本来自 `package.json`，内置 `build-info.json` 记录提交、架构、运行时和签名状态；不包含个人故事库、模型密钥或 Codex 登录。

检查会解压实际 ZIP 到仓库外的临时目录，验证执行权限、二进制架构和签名完整性，再启动内置后端，访问页面与 API、创建测试故事并重启以验证 SQLite 保存。DMG 另执行镜像校验。这些检查不替代真实桌面交互或 Gatekeeper 公证测试。

## 发布版本

标签必须与 `package.json` 的版本严格一致，例如当前 `0.1.0` 对应 `v0.1.0`；发布提交必须已进入 `main`。

首次发布当前版本：

```sh
git tag v0.1.0
git push origin v0.1.0
```

之后发布补丁版本，可在工作区干净、当前 main 已同步时执行：

```sh
npm version patch
git push origin main --follow-tags
```

两个架构构建完成后，工作流先创建草稿 Release，上传全部包与校验值，再公开。包含预发布后缀的版本（如 `0.2.0-beta.1`）标记为 Pre-release。上传失败时保留草稿，可重跑；已公开的 Release 不会被覆盖，应使用新版本。

## 签名与系统版本

目前不需要配置 Apple 证书，产物采用 ad-hoc 签名，**不代表已获 Apple 验证**。从网上下载后，Gatekeeper 可能阻止首次打开。安装说明会明确这一点。

后续接入 Developer ID 签名、`notarytool` 公证和 stapling，需要 Apple 开发者证书及公证凭据；当前工作流尚未启用这些步骤。

最低系统要求为 macOS 13.5，与[官方 Node.js 24 平台要求](https://github.com/nodejs/node/blob/v24.x/BUILDING.md#platform-list)一致。架构分别使用 [`macos-15` 与 `macos-15-intel`](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)，避免依赖 `macos-latest` 架构变化。

本机复现完整打包与检查：

```sh
npm ci
npm run desktop:dist
```

使用 fnm / nvm 安装的官方 Node.js 发行版即可。依赖 Homebrew 动态库的 Node 不能直接分发，打包脚本会给出错误提示。输出位于 `release/artifacts/`；重跑检查用 `npm run desktop:verify`。
