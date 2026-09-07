# 在桌面上，继续探索

[← 返回产品介绍](../README.md) · [打开在线版](https://hsiaosiyuan0.github.io/shanhe/)

桌面版把地图、时间线和探索助手放在同一个窗口里。连接本机 Codex 或模型 API 后，可以通过对话添加事件、标记地点、绘制路线，故事和探索记录保存在你的电脑。

**支持 macOS 13.5+，提供 Apple Silicon 和 Intel 两种安装包。** 已经安装山河的用户可以直接打开 App，无需额外连接在线版。

窗口标题栏与工作台背景融合，不再重复显示应用名称。保留 macOS 原生红黄绿按钮和顶部拖动区域；全屏时自动收起按钮预留空间。浏览器版的布局不受影响。

## 下载安装包

正式打标签的版本会发布在 [GitHub Releases](https://github.com/hsiaosiyuan0/shanhe/releases)。如果还没有发行版，可以从 [Build macOS app](https://github.com/hsiaosiyuan0/shanhe/actions/workflows/macos.yml) 中选择最近一次成功的 `main` 构建，在 **Artifacts** 下载测试包（需要登录 GitHub）。

| 你的 Mac                | Actions 产物  | 里面的安装包                             |
| ----------------------- | ------------- | ---------------------------------------- |
| Apple Silicon（M 系列） | `macos-arm64` | `shanhe-<版本>-macos-arm64.dmg` / `.zip` |
| Intel                   | `macos-x64`   | `shanhe-<版本>-macos-x64.dmg` / `.zip`   |

打开 DMG，把「山河」拖到 Applications；ZIP 解压后的「山河.app」也可以直接拖入「应用程序」。Actions 下载的外层 ZIP 需要先解压，里面包含 DMG、App ZIP 和校验文件。安装后直接打开，无需安装 Node.js 或启动开发服务。

当前包使用 ad-hoc 签名，**未经 Apple Developer ID 签名和公证**。首次打开可能被 macOS 拦截；确认来源是本仓库后，可按系统「隐私与安全性」中的提示允许打开。新的 App 可以替换旧版本，故事库独立保存在本机。

## 从源码构建

构建需要 **macOS、Node.js 24+ 和 Xcode Command Line Tools**。如果尚未安装命令行工具，可先运行 `xcode-select --install`，按系统提示完成安装。

在终端执行：

```sh
git clone https://github.com/hsiaosiyuan0/shanhe.git
cd shanhe
npm ci
npm run desktop
```

命令会构建并打开「山河」。如果已经克隆了仓库，从项目目录执行后两条命令即可。

App 生成在 `release/mac-<架构>/山河.app`，Apple Silicon 对应 `release/mac-arm64/山河.app`。可以把它拖到「应用程序」文件夹，以后直接双击打开。App 内置 Node 运行时，并自动启动和关闭本地后端，无需另开终端运行服务。

仅构建 App、不自动打开时使用 `npm run desktop:pack`；生成 DMG、ZIP 并检查独立运行时使用 `npm run desktop:dist`。[更多运行配置](SETUP.md)

## 带上在线版里的故事

1. 在在线版打开要继续探索的故事，点击右上角「使用桌面版」，再点击「导出当前故事」。也可以从故事菜单导出。
2. 打开桌面 App，点击故事列表旁的「导入故事」，选择刚保存的 JSON 文件。
3. 导入会创建一个独立故事，事件、标记、路线、地图视角和已有对话都会带过来。

在线版和桌面版各自保存故事，不会自动同步。JSON 不包含版本快照、模型密钥或本机 Agent 会话关联；快照需要在桌面版重新创建。在线版仍可继续浏览地图、编辑事件和保存快照。

## 连接探索助手

打开桌面版左下角「模型设置」：

- **本地 Agent**：选择 Codex，复用本机已有登录，确认连接状态后保存。当前支持 Codex CLI 0.153+。
- **模型 API**：填写兼容服务的 API 地址、模型名称和密钥，也可连接支持工具调用的 Ollama 模型。

没有连接模型时，可以先用预设演示指令体验地图操作。模型新增的历史内容仍需核验。[详细连接方法](SETUP.md#连接模型)

## Windows / Linux

暂未提供对应的桌面安装包。可以在项目目录运行 `npm ci`、`npm run dev`，打开 [127.0.0.1:5178](http://127.0.0.1:5178) 使用带本地后端的 Web 版，同样保留探索助手。[本地 Web 配置](SETUP.md#运行)
