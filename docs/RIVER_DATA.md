# 河道数据：用户导入与模型工具

在地图右上角打开 **图层 → 河道数据**。用户与模型操作同一份故事数据，新增河道不是浮动地点标记，也不是平滑后的旅行路线。

## 使用入口

- **从目录添加**：汉江、大渡河、赣江、西江。选中后预览实际河段，核对名称、年代、颜色和来源，再添加到故事。目录摘取自已随应用分发的 Natural Earth 1:50m 数据；未补画断点或缺失河段。
- **导入自己的数据**：选择 `.geojson` / `.json` 文件，或展开「粘贴 GeoJSON」。支持线几何、Feature 和 FeatureCollection；一个文件按一条有名称的河道导入，集合中的河段保持分离。若文件包含不同河流，请先按河名拆分。
- **继续整理**：显示/隐藏、定位、换色、编辑名称、年代、说明和来源，或用新文件替换几何。支持单条 GeoJSON 导出、删除及当次撤销删除。
- **保存与迁移**：河道随故事保存到 SQLite；在线版保存在浏览器 IndexedDB。故事 JSON 导出/导入、快照及恢复都包含完整河道，无需额外数据库或在线服务。

[下载可导入的汉江示例](../public/examples/han-river.geojson)。这是实际数据的摘录，不是示意绘制；名称、来源和年代写在 Feature 的 `properties` 中。

## 接受的数据

使用 [GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946)，坐标为 WGS84 二维 `[经度, 纬度]`，经度 −180..180，当前地图支持纬度 −85..85。投影坐标或其他坐标系需先转换；不接受旧版 `crs` 字段。

- `LineString`：至少两个不同坐标。
- `MultiLineString`：最多 200 段，每段至少两个不同坐标。不同河段绝不自动相连或平滑。
- `Feature`：几何须为上述两种之一。
- `FeatureCollection`：最多 200 个 Feature，几何须全部为河段。不把 Polygon 湖泊面或 Point 地点隐式转成线。

单文件最多 **1 MB**，单条河道合计最多 **8,000 点**。每个故事最多 **50 条自定义河道、合计 24,000 点**。故事整体导入仍受现有 3 MB 文件限制；大量对话及动作历史可能使完整导出超过此限制，可单独导出河道迁移。

年代字段 `period` 取 `modern` / `historical` / `unknown`，`periodLabel` 填写具体时期或版本说明。现代河道不能用于直接推断古代河道；历史数据不会根据时间轴自动切换，标签与详情会明确显示其时期。来源链接是数据的出处记录，不表示山河已经核验其历史准确性。

## 模型可用的能力

本地 Codex 与兼容 Chat Completions 的模型 API 使用同一份工具注册表：

| 工具 | 能力 |
| --- | --- |
| `get_story_context` | 最新故事、已暂存动作数；河道返回名称、年代、来源、点数、分段数和范围，避免每轮重复全部坐标 |
| `search_rivers` | 按名称/ID 查询故事内数据和内置目录；空字符串列出全部，结果包含 `scope: story / catalog` |
| `get_river_data` | 按 `{id, scope}` 读取完整原始几何及元数据 |
| `apply_story_actions` | 原子暂存添加、更新、删除河道等操作 |

新增四类动作：

| 动作 | 参数 | 行为 |
| --- | --- | --- |
| `add_catalog_river` | `catalogId`, `id` | 导入内置目录中的真实数据，保留来源与概略精度 |
| `add_river` | `river` | 添加外部提供的完整河道 |
| `update_river` | `id`, `patch` | 部分更新名称、几何、颜色、说明、年代、来源、可见性；省略的字段保持原样，`source: null` 清空来源 |
| `remove_river` | `id` | 移除当前故事的自定义河道，不修改底图 |

例如，模型先 `search_rivers({query: "汉江"})`，再执行：

```json
{
  "actions": [
    { "type": "add_catalog_river", "catalogId": "han", "id": "han-reference" },
    { "type": "update_river", "id": "han-reference", "patch": { "color": "#786093" } }
  ]
}
```

`river.visible` 控制单条河道，`story.layers.rivers` 控制河流总图层。新建时模型应读取当前图层状态，并在必要时通过 `set_layers` 开启河流图层；修改视角仍用 `set_view`。

目录之外，模型可以使用用户提供的 GeoJSON 或读取已导入河道，但**没有联网抓取河道工具，也不能凭记忆编造几何**。缺少数据时会引导用户导入。模型直接新增几何，或修改几何/来源/年代/精度时，系统会移除未核验来源并将其标为 `unverified`；仅换色、显隐等操作保留原数据来源。

动作在内存故事副本上验证、暂存，最终回答完成后才和对话一起提交。非法坐标、重复 ID、超限数据或批内其他错误不会部分写入；停止、进程异常、超时、版本冲突沿用原有回滚机制。工具定义变更会使旧 Codex 会话绑定失效，下次对话注册新的工具。

## 本地 HTTP 接口

- `GET /api/tools`：完整工具注册表与 JSON Schema。
- `GET /api/capabilities`：兼容原接口，继续返回批量修改工具 Schema，包含新的河道动作。
- `GET /api/river-catalog`：内置河道目录与完整数据。
- `GET /api/stories/:id`：故事数据，包括 `riverChannels`。
- `POST /api/stories/:id/actions`：`{ "revision": 当前版本, "actions": [...] }`，UI 和外部本机客户端均可使用。

这些 HTTP 接口由本地服务提供，保持原来的本机访问限制；GitHub Pages 使用浏览器内的同一套校验与存储逻辑，没有独立 HTTP 后端。此处的工具注册表不是独立 MCP 服务。

## 代码位置

`shared/rivers.ts` 定义几何、元数据与 GeoJSON 导入导出；`shared/river-catalog.ts` 与 `shared/data/river-catalog.json` 提供确定的数据目录；`shared/schema.ts` 接入故事及动作；`shared/story-tools.ts` 是两种模型接入共用的执行入口。前端在 `src/RiverManager.tsx` 管理数据，`src/map/customRivers.ts` 生成原始河道图层与河道上的文字锚点。

目录数据与 `public/data/rivers.geojson` 的原始分段逐点一致，此约束有自动测试。扩充目录时需同步更新来源信息和对应测试；用户导入新河道不需要修改代码。
