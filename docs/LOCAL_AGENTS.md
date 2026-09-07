# 本地 Agent 接入：Multica 调研与山河设计

调研日期：2026-09-07。参考 Multica 提交 `3ac53a68a61cecbe3f4459c94c7718045bdf46bf`。首版 Codex 已接入正式对话链路；下方记录调研依据与当前实现。

## 结论与本机验证

山河可以调用本机已经安装、登录的 agent CLI，复用它的模型连接、会话管理和工具循环。现有 Node 后端可以负责启动和管理 CLI，SQLite 继续存储故事、对话与会话关联。

最初调研阶段完成了以下只读连接探测：

| 项目 | 实测结果 |
| --- | --- |
| CLI 发现 | 找到 `codex`、`claude`、`opencode` |
| Codex 版本 | `0.153.2` |
| `initialize` / `initialized` | 成功 |
| `account/read`，`refreshToken: false` | 返回 `account.type: chatgpt` |
| `model/list` | 返回 5 个模型，默认 `gpt-5.6-sol` |
| 本机生成的协议类型 | 包含 `dynamicTools`、`item/tool/call`、会话续接相关类型 |

产品动态读取模型列表。实现阶段另用临时 SQLite 故事完成了两轮真实 Codex 对话：添加西湖标记、打开现代行政区对照、续接同一会话并调整视角，确认实际工具调用与保存。Claude Code、OpenCode 目前只确认可执行文件存在，尚未提供适配器。

“本地 agent”表示执行程序在本机；模型请求仍按该 CLI 的服务商配置发送，不能因此标成离线推理。山河不接管已经打开的 Codex 桌面任务，而是为故事建立自己的 agent 会话。

## Multica 如何绑定

它把机器上的运行环境称为 runtime。daemon 发现 CLI 路径、探测版本，向服务端注册机器和 runtime；agent 记录关联 runtime，任务再由对应的 daemon 执行。在线通知负责及时唤醒，轮询和心跳负责补偿与状态维护。[发现实现](https://github.com/multica-ai/multica/blob/3ac53a68a61cecbe3f4459c94c7718045bdf46bf/server/internal/daemon/agents_probe.go)、[注册与调度](https://github.com/multica-ai/multica/blob/3ac53a68a61cecbe3f4459c94c7718045bdf46bf/server/internal/daemon/daemon.go)、[Agent 与 runtime 关联](https://github.com/multica-ai/multica/blob/3ac53a68a61cecbe3f4459c94c7718045bdf46bf/server/pkg/db/queries/agent.sql)。

这里有两套独立认证：Multica 的 token 用于 daemon 连接 Multica 服务；agent 自身的登录用于模型请求。桌面端负责同步前者和管理 daemon 的生命周期。[桌面 daemon 管理](https://github.com/multica-ai/multica/blob/3ac53a68a61cecbe3f4459c94c7718045bdf46bf/apps/desktop/src/main/daemon-manager.ts)。山河当前是单机应用，首版可以由已有后端直接管理 agent 子进程。

Multica 没有假设所有 CLI 都讲同一种协议，而是定义统一的执行接口，将各家输出转换成文本、工具、状态、错误和最终结果。[统一 Backend / Session 接口](https://github.com/multica-ai/multica/blob/3ac53a68a61cecbe3f4459c94c7718045bdf46bf/server/pkg/agent/agent.go)。

| Provider | Multica 使用的入口 | 会话续接 | 应用工具接入 |
| --- | --- | --- | --- |
| Codex | `codex app-server --listen stdio://`，双向 JSON-RPC | `thread/resume`，随后 `turn/start` | 写入任务配置中的 MCP 服务 |
| Claude Code | `claude -p`，输入输出 `stream-json` | `--resume` | `--mcp-config` |
| OpenCode | `opencode run --format json`，提示词走 stdin | `--session` | 转换 MCP 配置后通过运行环境传入 |

对应源码：[Codex](https://github.com/multica-ai/multica/blob/3ac53a68a61cecbe3f4459c94c7718045bdf46bf/server/pkg/agent/codex.go)、[Claude](https://github.com/multica-ai/multica/blob/3ac53a68a61cecbe3f4459c94c7718045bdf46bf/server/pkg/agent/claude.go)、[OpenCode](https://github.com/multica-ai/multica/blob/3ac53a68a61cecbe3f4459c94c7718045bdf46bf/server/pkg/agent/opencode.go)。其他 provider 还有 ACP 适配，因此“支持本地 agent”需要按协议提供适配器。

Codex 的隔离处理值得参考：Multica 建立任务专用的运行目录，共享认证文件的链接，复制配置，单独管理会话与技能。这样复用登录的同时可给每个任务配置不同工具。[Codex 运行目录实现](https://github.com/multica-ai/multica/blob/3ac53a68a61cecbe3f4459c94c7718045bdf46bf/server/internal/daemon/execenv/codex_home.go)。山河应优先让 CLI 自己管理认证，通过公开接口读取状态；是否需要独立配置目录，应在会话和工具隔离测试后决定，避免主动复制用户凭据。

macOS 从 Finder 启动时通常缺少终端 PATH。Multica 既恢复 shell PATH，也补充常见安装目录，并允许指定 CLI 路径。[桌面启动环境](https://github.com/multica-ai/multica/blob/3ac53a68a61cecbe3f4459c94c7718045bdf46bf/apps/desktop/src/main/index.ts)。山河的 Swift 外壳目前直接继承环境，接入时必须覆盖这种启动方式。

本文借鉴运行机制；正式适配器由山河独立编写。若计划直接嵌入 Multica 源码，需要先按其完整 [LICENSE](https://github.com/multica-ai/multica/blob/3ac53a68a61cecbe3f4459c94c7718045bdf46bf/LICENSE) 评估，不能只依据其中包含 Apache 文本就认定它是无附加条件的 Apache 2.0 项目。

## 山河当前实现

设置面板的「本地 Agent」支持 Codex CLI 0.153+。自动发现程序、检查登录、动态读取模型列表；保存后当前对话直接走 Codex。原有 API 与演示模式保留。登录凭据始终由 CLI 管理，不复制到山河数据库或返回前端。

| 模块 | 职责 |
| --- | --- |
| `server/agents/discovery.ts` | PATH、常见安装目录、自定义完整路径、版本检查；兼容 Finder 启动的精简环境 |
| `server/agents/rpc.ts` | JSONL 双向协议、请求 ID、超时、协议错误处理与进程树清理 |
| `server/agents/codex.ts` | 登录/模型探测、创建与续接会话、动态工具、文本事件、执行边界 |
| `server/story-tools.ts` | API 和本地 agent 共用的动作暂存、Zod 校验、证据降级 |
| `server/app.ts` | JSON / SSE 对话、取消、SQLite 锁与原子提交 |
| `src/AgentConnection.tsx` | 连接卡片、模型选择、路径设置与检测反馈 |

Codex 通过 stdio app-server 连接。新会话注册 `get_story_context` 和 `apply_story_actions`，回调交给山河后端处理；续接时 Codex 恢复工具定义。官方接口说明：[App Server](https://learn.chatgpt.com/docs/app-server)。动态工具属于实验接口，当前针对 CLI 0.153 的函数工具结构实现，并设置最低版本检查。

Codex 不接受 draft-7 的坐标 tuple `items: [schema, schema]`，因此工具描述将它投影为两个数值的数组；实际执行仍使用完整 Zod Schema 校验经纬度范围、路线分段、ID 与动作数量。原 API 的工具 Schema 不受影响。

每轮先读取当前故事。工具变更在内存副本上暂存，回执明确标注尚未保存。最终回答完成后检查起始 revision，在同一 SQLite 事务中保存故事、两条对话消息与 agent 会话关联。失败、取消、超时或版本冲突都丢弃该轮暂存。

### 会话与并发

- `agent_sessions` 保存 story_id 到 Codex thread ID、连接指纹和成功 revision 的关联。
- 发送新一轮前清除旧关联，只有成功提交才写回，避免续接包含失败操作的 agent 历史。
- 任意故事保存先使旧关联失效；成功聊天在同一事务中恢复新的关联。因此手动编辑和恢复快照后，下轮会以当前故事及近期已保存消息创建新会话。
- 修改 agent 路径、模型或连接方式会更新连接标识，后续不再复用旧绑定。
- `chat_locks` 用 SQLite 原子占用锁约束同一故事并发，每 10 秒续期，45 秒过期；崩溃后无需手动清锁。
- 每轮最多 40 个地图动作、30 次故事工具调用、5 分钟运行时间。API 模式保留原来的 90 秒和最多 5 轮请求限制。

Codex 自己保存会话历史，SQLite 保存故事及已提交消息。临时工作目录位于数据库目录下的 `agent-workspaces`，目录名使用故事 ID 的摘要；导出故事不包含这些本机运行信息。没有引入额外数据库、常驻 daemon 或 Multica 服务。

### 运行与权限

子进程通过程序路径和独立参数数组启动，提示词通过协议传输。线程使用只读沙箱，并关闭执行环境、shell、应用连接器、插件、外部 MCP、浏览器与电脑操作、子 agent、记忆和搜索等非故事工具。配置覆盖只作用于当前会话，不修改用户的 CLI 配置文件。未知工具和权限请求不会自动批准。

停止按钮先调用取消接口，再关闭客户端流；页面断开也会取消运行。服务退出时终止 agent 进程树，并等待必要的强制回收。停止与最终提交同时发生时，前端重新读取保存结果，避免把已经完成的回答错误显示为丢失。

本地 agent 仍按其服务配置请求模型，当前不提供联网史料核验。新增内容继续保持待核验；不能把生成路线当作考证结论。

### HTTP 接口

| 接口 | 行为 |
| --- | --- |
| `POST /api/agents/discover` | 发现 Codex 路径和版本 |
| `POST /api/agents/codex/probe` | 检查登录并读取模型；不发起模型推理 |
| `GET/PUT /api/settings` | 读取/保存连接方式、路径、模型；不返回密钥 |
| `POST /api/stories/:id/chat` | 原 JSON 请求兼容；`Accept: text/event-stream` 输出状态、文本、工具摘要和最终结果 |
| `POST /api/stories/:id/chat/cancel` | 停止当前服务中该故事的活动对话 |

首版采用与单次 POST 生命周期绑定的 SSE，断连即取消，没有后台续跑或断点事件重放。跨设备 agent、Claude Code/OpenCode 适配和 MCP 工具服务留待后续扩展。

### 验证

自动测试使用临时 SQLite 与受控测试 CLI，覆盖登录缺失、流式协议、地图动作保存、非法坐标、来源降级、会话恢复、取消、进程退出、权限拒绝和并发修改，不消耗用户模型额度。真实联调另在临时故事中完成了两轮对话，确认同一 Codex thread 能续接并实际调用地图工具。
