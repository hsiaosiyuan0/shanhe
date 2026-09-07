# 安装与配置

[← 返回产品介绍](../README.md)

无需安装可直接体验 [Pages 在线版](https://hsiaosiyuan0.github.io/shanhe/)。它使用浏览器存储；模型连接与本地版的区别见[在线版说明](PAGES.md)。

## 运行

需要 **Node.js 24+**。不需要配置数据库，不需要 API Key 就能先体验演示指令。

```sh
npm install
npm run dev
```

打开 <http://127.0.0.1:5178>。前端监听 5178，独立 API 监听 4310。两个服务都仅监听本机。首次运行自动创建数据库和三个示例故事。

独立 macOS 桌面窗口（自动启动内置 API，无需另开开发服务；构建需要 Xcode Command Line Tools）：

```sh
npm run desktop
```

打包 macOS 桌面 App（内置当前 Node 运行时，打开产物时无需安装 Node）：

```sh
npm run desktop:pack
```

产物在 `release/`。macOS Apple Silicon 为 `release/mac-arm64/山河.app`。当前是本地开发构建，未进行开发者证书签名或公证。macOS 原生外壳使用系统 WebKit；Windows/Linux 可使用浏览器版本，暂无桌面打包。

纯浏览器生产运行：

```sh
npm run build
npm start
```

打开 <http://127.0.0.1:4310>。支持的浏览器可将网页安装为 PWA；这种方式仍需本地后端运行。桌面版会自动管理后端生命周期。

### 数据保存在哪里

Web / 开发版默认使用 `data/shanhe.sqlite`，可以通过 `DATA_DIR` 更改。桌面版使用 `~/Library/Application Support/山河/data/shanhe.sqlite`。两种运行方式的数据独立，可以通过故事的 JSON 导入、导出迁移。

## 连接模型

左下角「模型设置」提供两种连接方式。

**本地 Agent（Codex）**：先安装并登录 Codex CLI 0.153+，选择「本地 Agent」，检测成功后选择模型并保存。山河会复用 Codex 的登录，不需要另填 API Key。默认查找 PATH、`~/.local/bin`、Homebrew 等位置；自定义安装位置可在「程序位置」填写完整可执行文件路径。模型列表从 CLI 动态读取，留空沿用 CLI 默认模型。

每个故事独立续聊；手动编辑、恢复快照、切换连接、失败或取消后重新建立上下文。关闭页面会停止未完成的回答，整轮完成前不会保存地图修改。Codex 会话由 CLI 自身持久化，山河 SQLite 仅存会话关联与已保存对话；会话关联不进入故事导出。本地运行 agent 不代表离线推理，模型请求仍使用 CLI 的服务配置。当前 agent 只开放故事工具，没有启用联网考证或本机文件操作。详细实现见 [本地 Agent 接入](LOCAL_AGENTS.md)。

**模型 API**：填写服务地址、模型 ID 和 API Key。兼容 **Chat Completions + tool calling** 协议。

- 远程服务：填写以 `/v1` 等 API 根路径结尾的 HTTPS 地址，**不要**包含 `/chat/completions`。
- 本地服务：如 `http://127.0.0.1:11434/v1`，填写已安装且支持工具调用的模型名称；无需 Key。
- 模型名称留空：使用本地演示模式。演示只执行预设指令，不会伪装成 LLM 回答。

也可以复制 `.env.example` 为 `.env`。界面保存的设置优先于环境变量。

```dotenv
LLM_BASE_URL=https://api.example.com/v1
LLM_MODEL=your-tool-capable-model
LLM_API_KEY=your-key
```

演示指令：「苏轼从眉山怎么赴京」「聊聊苏轼在黄州的岁月」「在地图上标记主要山川」「显示旅途路线」「开启三维地形」「显示海拔分层」「打开今地对照」。自由主题的故事内容生成需要连接真实模型。

API 模式的凭据只在服务端使用，保存在权限受限的本机 SQLite 中，不发送回前端，不进入 Git 或故事导出。它不是加密数据库。API 模式发送当前故事与最近 16 条消息；Codex 新建会话时携带近期已保存对话，续聊则读取最新故事并使用自己的会话历史。模型新增内容一律标记为待核验，并移除未经检索核验的来源 URL。

## 工程结构

```text
src/                 React 工作台、MapLibre 地图、交互与样式
server/              独立 HTTP API、SQLite、模型工具循环、种子故事
shared/schema.ts     前后端共用的数据结构与地图操作校验
desktop/main.swift   macOS WebKit 外壳与本地 API 生命周期
scripts/             打包原生 App，内置 Node 与生产依赖
public/data/         可离线读取的海岸线、河流、现代省级行政区 GeoJSON
tests/               持久化、并发、工具协议与回滚集成测试
docs/ARCHITECTURE.md  产品模型、接口与下一阶段设计
```

```sh
npm test        # 临时 SQLite + 本机模拟 LLM，不调用外部付费模型
npm run check  # TypeScript 校验
npm run build  # 类型检查 + 前后端生产构建
npm run icons  # 从 public/icon.svg 生成 PNG；macOS 同时生成桌面 ICNS
```

参考实现文档：[MapLibre 地形](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/)、[Node SQLite](https://nodejs.org/api/sqlite.html)、[函数调用](https://developers.openai.com/api/docs/guides/function-calling)、[Apple WKWebView](https://developer.apple.com/documentation/webkit/wkwebview)。
