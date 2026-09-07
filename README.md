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
- 地图：缩放、拖动、事件定位、全路线适配、山川图层显隐。默认按真实海拔分层设色，配合山体阴影、海拔图例和主要盆地/平原名称；可独立切换三维地形。开启三维后，点击空白处可查询加载范围内的估算高程。
- 今地对照：地图右上角一键叠加现代省界和省名，点击地图显示「今属 · 省名」。当前内置中国大陆 31 个省级行政区，数据可离线读取，图层状态随故事、快照与导出保存。
- 历史行程：独立记录出发/抵达年份、经过地点、陆路/水路/待考分段和资料依据。首个案例是苏轼 1056 年首次赴京，采用有明确分歧说明的研究重建走廊；点击「行程」或 1056/1057 年节点查看，分段可展开、定位，地点可点击查依据。
- 地点关系：历史故事不再默认把相邻人生事件连成旅途。「地点连线（非行程）」需在图层中显式打开；旅行规划仍提供平滑示意。考证行程不会套用平滑算法，也不会按生平事件推算行走进度。
- 时间线：按事件排列，点击与地图联动，前后切换、播放/暂停、手动添加和编辑事件。时间轴当前不是按年份等比例排布。
- 对话：连接本地 Codex 或模型 API，参考当前 Story 添加事件、地点、路线、修改视角与图层。本地 Codex 支持流式回答、工具过程、停止和按故事续聊；回答完成后统一保存。
- 保存：编辑与对话自动写入 SQLite。快照额外保存当前地图视角，支持完整恢复，恢复前自动创建备份。
- 迁移：导出包含事件、路线、标记、聊天的 JSON，再导入任意山河实例。导出不包含模型密钥或版本快照。

## 连接模型

左下角「模型设置」提供两种连接方式。

**本地 Agent（Codex）**：先安装并登录 Codex CLI 0.153+，选择「本地 Agent」，检测成功后选择模型并保存。山河会复用 Codex 的登录，不需要另填 API Key。默认查找 PATH、`~/.local/bin`、Homebrew 等位置；自定义安装位置可在「程序位置」填写完整可执行文件路径。模型列表从 CLI 动态读取，留空沿用 CLI 默认模型。

每个故事独立续聊；手动编辑、恢复快照、切换连接、失败或取消后重新建立上下文。关闭页面会停止未完成的回答，整轮完成前不会保存地图修改。Codex 会话由 CLI 自身持久化，山河 SQLite 仅存会话关联与已保存对话；会话关联不进入故事导出。本地运行 agent 不代表离线推理，模型请求仍使用 CLI 的服务配置。当前 agent 只开放故事工具，没有启用联网考证或本机文件操作。详细实现见 [本地 Agent 接入](docs/LOCAL_AGENTS.md)。

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

## 数据与地图边界

Web/开发版数据库默认在 `data/shanhe.sqlite`，可通过 `DATA_DIR` 更改。桌面版数据库在 `~/Library/Application Support/山河/data/shanhe.sqlite`。两种运行方式的数据独立，使用导入/导出迁移。

- 海岸线与河流：[Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/)，公共领域。小比例尺数据内置在 `public/data/`，无网络时仍可显示。
- 在线晕渲地形：Esri / USGS World Shaded Relief。
- 在线高程：Mapzen Terrarium，AWS Open Data。使用 MapLibre `color-relief` 与 `hillshade` 绘制海拔颜色和山体明暗；三维地形夸张系数为 1.3，高程查询来自地形数据。色彩表示绝对海拔，盆地与平原还需结合周围地势判断。
- 现代省界：Natural Earth 1:10m，内置中国大陆省级范围；不是权威行政区划数据，也不随历史年份变化。详见 `public/data/README.md`。
- 示例历史事件附参考链接，地点采用现代 WGS84 概略坐标；还不是经过逐条文献校勘的历史数据库。
- **尚未实现按年份变化的历史疆界**，现代海岸线与河道不能当作古代地理复原。
- 1056 年赴京图采用「金牛道—陈仓故道」研究方案，以现代概略地名坐标表达走廊，不是精确古道轨迹，也不是学界定论。秦岭支道与部分水陆转换仍有分歧；1059 年经三峡、江陵的水陆赴京是另一趟行程，尚未绘制。其余人生行程也未补全。详见 [行程资料与精度说明](docs/ROUTE_EVIDENCE.md)。
- 无 `journey` 信息的旧路线只表示地点关系或旅行规划，曲线不能提供走法的历史证据，不能用作导航。升级旧苏轼示例前会创建自动快照，不覆盖用户修改过的路线坐标。
- 在线地形及远程 LLM 需要网络；界面字体使用本机字体，不依赖在线字体服务。当前不预下载地形瓦片。

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
