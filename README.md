# 山河 · Story Atlas

在地图上，读懂每一个故事。

一个优先在本地保存数据的交互式 Story 工作台。把人物生平、历史事件、旅行构想放进同一张地图，通过时间线阅读，通过对话继续探索。React 前端与 Node API 分离，SQLite 是唯一数据库。提供 macOS 原生 WebKit 桌面外壳和浏览器入口。

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

## 这一版能做什么

- 故事库：创建空白历史、人物、旅行故事，或从「苏轼的一生」「五代十国」「江南三日漫游」开始。
- 地图：缩放、拖动、事件定位、全路线适配、山川图层显隐、在线三维地形。开启地形后，点击空白处可查询加载范围内的估算高程。
- 时间线：按事件排列，点击与地图联动，前后切换、播放/暂停、手动添加和编辑事件。时间轴当前不是按年份等比例排布。
- 对话：参考当前 Story，添加事件、地点、路线、修改视角与图层；每轮回答显示地图操作回执。
- 保存：编辑与对话自动写入 SQLite。快照额外保存当前地图视角，支持完整恢复，恢复前自动创建备份。
- 迁移：导出包含事件、路线、标记、聊天的 JSON，再导入任意山河实例。导出不包含模型密钥或版本快照。

## 连接模型

左下角「模型设置」填写服务地址、模型 ID 和 API Key。兼容 **Chat Completions + tool calling** 协议。没有指定任何默认付费模型。

- 远程服务：填写以 `/v1` 等 API 根路径结尾的 HTTPS 地址，**不要**包含 `/chat/completions`。
- 本地服务：如 `http://127.0.0.1:11434/v1`，填写已安装且支持工具调用的模型名称；无需 Key。
- 模型名称留空：使用本地演示模式。演示只执行预设指令，不会伪装成 LLM 回答。

也可以复制 `.env.example` 为 `.env`。界面保存的设置优先于环境变量。

```dotenv
LLM_BASE_URL=https://api.example.com/v1
LLM_MODEL=your-tool-capable-model
LLM_API_KEY=your-key
```

演示指令：「聊聊苏轼在黄州的岁月」「在地图上标记主要山川」「显示旅途路线」「开启三维地形」。自由主题的故事内容生成需要连接真实模型。

模型凭据只在服务端使用，保存在权限受限的本机 SQLite 中，不发送回前端，不进入 Git 或故事导出。它不是加密数据库。真实对话时会向配置的服务发送当前故事与最近 16 条消息。模型新增内容一律标记为待核验，并移除未经检索核验的来源 URL。

## 数据与地图边界

Web/开发版数据库默认在 `data/shanhe.sqlite`，可通过 `DATA_DIR` 更改。桌面版数据库在 `~/Library/Application Support/山河/data/shanhe.sqlite`。两种运行方式的数据独立，使用导入/导出迁移。

- 海岸线与河流：[Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/)，公共领域。小比例尺数据内置在 `public/data/`，无网络时仍可显示。
- 在线晕渲地形：Esri / USGS World Shaded Relief。
- 在线高程：Mapzen Terrarium，AWS Open Data。地形夸张系数为 1.3，高程查询来自地形数据。
- 示例历史事件附参考链接，地点采用现代 WGS84 概略坐标；还不是经过逐条文献校勘的历史数据库。
- **尚未实现按年份变化的历史疆界**，现代海岸线与河道不能当作古代地理复原。
- 路线是按事件节点连接的示意，既非考证过的古道，也非旅行导航。
- 在线地形及远程 LLM 需要网络；界面字体使用本机字体，不依赖在线字体服务。当前不预下载地形瓦片。

## 工程结构

```text
src/                 React 工作台、MapLibre 地图、交互与样式
server/              独立 HTTP API、SQLite、模型工具循环、种子故事
shared/schema.ts     前后端共用的数据结构与地图操作校验
desktop/main.swift   macOS WebKit 外壳与本地 API 生命周期
scripts/             打包原生 App，内置 Node 与生产依赖
public/data/         可离线读取的海岸线、河流 GeoJSON
tests/               持久化、并发、工具协议与回滚集成测试
docs/ARCHITECTURE.md  产品模型、接口与下一阶段设计
```

```sh
npm test        # 临时 SQLite + 本机模拟 LLM，不调用外部付费模型
npm run check  # TypeScript 校验
npm run build  # 类型检查 + 前后端生产构建
```

参考实现文档：[MapLibre 地形](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/)、[Node SQLite](https://nodejs.org/api/sqlite.html)、[函数调用](https://developers.openai.com/api/docs/guides/function-calling)、[Apple WKWebView](https://developer.apple.com/documentation/webkit/wkwebview)。
