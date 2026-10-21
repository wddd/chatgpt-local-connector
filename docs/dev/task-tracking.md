# Agent 任务追踪

[UI 规范](ui.md) · [派发 Agent](dispatch-agents.md) · [架构](architecture.md)

首页右侧 Agent 节点按三级递进展示正在进行的工作：转圈与数量角标、摘要气泡、点开后的执行时间线。三级共用一层原生侧归一化，同一层也产出执行证据。

## 目标与边界

- 统计范围是该 Agent 的**所有活动会话**：ARC 派发的 ACP/Pi 任务、经 Codex app-server 派发的线程，以及用户直接在 Codex Desktop、Claude Code 中开的会话（本地 transcript 扫描）。
- 第三级在 ARC 内渲染**执行时间线**，覆盖 ARC 派发的任务（ARC 持有完整事件流）。非 ARC 会话只有第一、二级，点击跳转到 Agent 的原生入口（有则给，无则不可点）。
- 时间线不是通用对话渲染器：前端只认归一化后的条目词表，不接触各 Agent 的原始消息格式；新增 Agent 只写原生侧适配器。
- 不修改受控 Agent 的源码或私有存储（例如不写其 workspace 索引）。
- 公开仓库：文档、测试与 fixture 使用通用示例，不出现个人项目名、路径或账号信息。

## Native 当前接口

- 归一化在 Core 内维护；ACP/Pi 随 ARC 任务记录保存，Codex app-server 按本次 Core 观察到的派发线程维护。时间戳是 ARC 观察时间，不推断未观察到的开始/完成时间。
- `agents/activity` 返回会话快照与兼容字段 `activeAgents`。等待审批、问题或选择的会话仍计为活动。
- `agent_context.evidence` 是所选回合的 command/file 条目，`executionEvidence` 按本会话观察返回 `true`、`false` 或 `"partial"`；有协议事件但没有工具调用时返回空证据，不报 unsupported。
- 2A 不改变首页视觉。`ActivityArc` 和现有前端轮询继续使用 `activeAgents`，2B/2C 可切换到会话结构与推送。

## 归一化层（native）

按来源写适配器，把原始事件投影成一套小词表：

| 类型 | 说明 |
|---|---|
| `user` | 用户/控制源消息（含线程内追加） |
| `text` | Agent 回复文本，chunk 在原生侧合并为条目 |
| `thinking` | 思考内容 |
| `command` | 命令：command、cwd、status、exitCode、输出摘要 |
| `file` | 文件操作：path、operation(read/write/edit/create)、status |
| `tool` | 其他工具调用：title、status、输入/输出摘要 |
| `plan` | 计划/待办更新 |
| `interaction` | 待处理请求：审批、问题、选择；附 respond 参数 |
| `error` | 错误 |

每个条目带稳定 `id`（工具类用 `toolCallId`/item id）、`startedAt`、`endedAt?`、`status`，便于前端增量合并。

来源：

- **ACP**：`session/update` 的 `agent_message_chunk`、`agent_thought_chunk`、`tool_call`、`tool_call_update`、`plan`，以及 `session/request_permission`。工具 `kind` 缺失或为 `other` 时，按 `rawInput.command` / `rawInput.file_path` 与工具名回退判断；`toolCallId` 关联 call 与 result；`exitCode` 优先取 `rawOutput`，否则从输出文本保守提取，提取不到留空。
- **Pi RPC**：`message_end`、工具事件、`extension_ui_request`、`agent_settled`。
- **Codex**：app-server 的 thread item（已类型化，含 reasoning 摘要）。
- **非 ARC 会话**（Codex/Claude Code 本地 transcript）：只读尾部，给出 phase 与 headline 即可，不产出完整条目。

审批上下文回填：审批请求只带 `toolCallId` 时，用同 id 的 `tool_call` 补齐 command/path/title，供通知、气泡和时间线展示“在批准什么”。

脱敏：`rawInput` 与输出摘要沿用现有截断上限，并对常见 secret 字段/形态做 redact。事件窗口被截断时标记 `coverage: partial`，不伪装完整。

### 执行证据

证据是归一化条目中 `command` 与 `file` 的过滤投影：`agent_context` 填 `evidence`，`executionEvidence` 改为按实际观察（有工具调用为 true，窗口截断为 partial），只在确实没有事件时报 `STRUCTURED_COMMAND_EVIDENCE_UNSUPPORTED`。

### 活动快照

替代 `agents/activity` 的 agent 集合，按会话粒度输出（保留 `activeAgents` 兼容字段直到前端切换完成）：

```json
{
  "observedAt": "…",
  "agents": {
    "<agent>": {
      "sessions": [
        {
          "id": "…", "source": "arc-task|codex-thread|transcript",
          "title": "…", "project": "…",
          "phase": "thinking|command|file|tool|text|interaction|idle",
          "headline": "一行摘要", "startedAt": "…", "phaseSince": "…",
          "interaction": {"kind": "permission|question", "summary": "…", "respond": {…}},
          "timeline": true,
          "open": {"kind": "…", "target": "…"}
        }
      ]
    }
  }
}
```

- `phase`/`headline` 取自最新条目：思考取末行，命令取命令行，文件取路径，文本取最近一句。
- 有待处理 interaction 的会话（含 `waiting-permission`）仍计为活动，并单独标记。
- `timeline: true` 表示可请求完整时间线（ARC 派发的任务）。
- `open` 仅在已验证可用时给出；没有入口则省略。
- 推送沿用 Tauri 事件（同 `subscriptions:changed` 模型），节流约 1s；Web 端用 SSE。保留一次性 GET 供首屏与降级。

### 时间线接口

本地管理接口（沿用本地 Core 认证）：

| 操作 | 接口 |
|---|---|
| 一次性活动快照 | `GET /api/agents/activity`；CLI `agents.activity` |
| Web 推送 | `GET /api/agents/activity/events`，SSE `event: snapshot` |
| Desktop 推送 | Tauri `agents:activity`，payload 与 GET 一致 |
| 会话时间线 | `GET /api/agents/timeline/{id}?after={cursor}`；CLI `agents.timeline`，参数 `{"id":"…","body":{"after":12}}` |
| 已验证 CLI 会话入口 | `POST /api/agents/sessions/{id}/open`，body `{"agent":"claude"}`；CLI `agents.session.open` |

`id` 使用活动快照的 `sessions[].id`：ACP/Pi 为 ARC taskId（另给 `nativeSessionId`），Codex 为 threadId。`after` 可省略，默认 0；它是条目更新序号，同一 id 的 chunk 合并、完成与审批解决也推进游标。客户端按 id 替换条目，保留未出现在增量响应中的条目；游标超过当前序号时报 `TIMELINE_CURSOR_EXPIRED`，重新全量读取。时间线不需要前端处理原始 chunk。

```json
{
  "sessionId": "<activity-session-id>",
  "entries": [
    {
      "id": "command-example", "type": "command", "status": "completed",
      "startedAt": "2026-01-01T00:00:00.000Z", "endedAt": "2026-01-01T00:00:01.000Z",
      "updatedAt": "2026-01-01T00:00:01.000Z", "cursor": 13, "turnId": "turn-example",
      "command": "printf example", "exitCode": 0, "exitCodeSource": "rawOutput"
    }
  ],
  "cursor": 13,
  "coverage": {"state": "complete", "truncated": false},
  "executionEvidence": true
}
```

工具输入与输出摘要沿用 `agent_context` 的 1024 字节 excerpt 结构，含 `truncated`、摘要 hash；文本合并上限沿用 256 KiB，事件/条目窗口沿用 2000 条与 8 MiB。窗口丢失或合并文本截断后 `coverage.state` 为 `partial`，不宣称全历史完整。Codex 的缓存仅覆盖当前 Core 已跟踪的派发，Core 重启前的完整时间线不由此缓存恢复；原生历史仍由 Codex 负责。

活动推送约每秒检查一次，忽略 `observedAt` 的单独变化；本地 transcript 尾部约每两秒采样，不产生时间线。`phaseSince` 在同一条目的内容变化时保持其开始时间。待处理条目的 `interaction.respond` 复用原有 `agent_respond` / `codex_respond` 参数，调用时按既有契约补选项、答案与新的 requestId。`open.kind=url` 直接打开 target；`open.kind=agent-session` 将 target 交给上述 session open 接口。

## 首页 UI

### 第一级：转圈与角标

- 节点有活动会话时转圈（沿用 `ActivityArc`），会话数大于 1 时右上角显示数量角标，位置避开配额环。
- 存在待处理 interaction 时，圆弧与角标切到警示色并停止旋转（不消失）。
- reduced-motion 下静止显示。

### 第二级：摘要气泡

- 每个活动会话一个气泡，从 Agent 图标向右铺开：阶段图标 + 阶段名 + 持续时间，下一行为单行省略的 headline。
- headline 更新最多约每秒一次，交叉淡入，不用打字机效果。
- 最多同时展示约 3 个，其余折叠为“+N”；需关注的排最前。
- 右侧横向空间不足以放下最小气泡宽度时不显示气泡，只保留第一级。
- 审批类直接给“允许 / 拒绝”，走现有 respond 通道；问题类提示并引导进入时间线。
- 与配额悬停气泡（QuotaBubble）错开触发方式与位置，互不遮挡。
- 气泡不改变节点排序、拖动和连线行为；拖动节点时气泡跟随或暂时隐藏。

### 第三级：执行时间线

- 点击 ARC 派发任务的气泡，从气泡位置变形展开面板（复用 `ElasticPanel`）。
- 条目渲染：
  - `text`：复用现有 Markdown 组件，按快照刷新，不逐字流式。
  - `thinking`：默认折叠为一行。
  - `command` / `file` / `tool`：一律折叠为单行（图标 + 命令或路径 + 状态 + 耗时），展开看截断输出；不做 diff 视图。
  - `plan`：勾选列表。
  - `interaction`：审批（允许/拒绝）与选择/输入类问题就地处理，与气泡同一通道。
  - `error`：醒目单行。
- 运行中自动跟随到底部，用户上翻后停止跟随。
- `coverage: partial` 时顶部提示记录不完整。
- 有原生入口的（如 Codex）在面板头部给“在 Agent 中打开”按钮。
- 不提供输入框；`agent_send` 排队（`sendMode`）落地后再加“追加消息”。
- 回合结束后，按回合改动统计落地时在时间线末尾挂改动摘要。
- 非 ARC 会话的气泡点击直接调用 `open`；无入口时不可点击，悬停提示原因。

## 分段

| 段 | 内容 | 验收要点 |
|---|---|---|
| 2A（native） | 三类适配器、执行证据投影、会话级活动快照与推送、时间线接口、审批上下文回填、原生入口调研 | ARC 派发的 ACP 任务与 Codex 线程各跑一次，快照、时间线、证据与事件流一致；等待审批期间仍计为活动；非 ARC 会话被计入；入口表有实测结论 |
| 2B（UI） | 第一级角标/需关注态、第二级气泡与就地审批 | 打包产物中两路并行 + 一个待审批；窄窗口隐藏气泡；深浅色与 reduced-motion |
| 2C（UI） | 第三级执行时间线 | 2B 验收后派发；效果不理想可整段砍掉，不影响 2A/2B |
| 并行项 | `agent_send` 的 `sendMode` 排队、ACP 会话恢复、按回合改动统计 | 与上面独立，串行安排避免同目录并行 |

## 入口表

下表针对 macOS 已安装版本的会话入口；不由命令存在或帮助参数推断可用，不修改 Agent 私有索引。Windows/Linux 不新增未经验证的 CLI 入口。

| Agent | 原生候选入口 | 当前接入与实测结论 |
|---|---|---|
| Codex | `codex://threads/{threadId}` | 已接入；ARC app-server 创建并完成的线程可打开，IPC 确认同一 threadId 的 Desktop owner。Linux 不给 Desktop 入口。 |
| Claude Code | `claude --resume {sessionId}`，使用原工作目录 | macOS 已接入；ACP 会话在 CLI 恢复后显示原测试回复。命令只使用已记录会话或当前活动 transcript 的 UUID 与工作目录。 |
| Cursor | `cursor-agent --resume {sessionId}` | 已确认独立 `cursor-agent`；同名 `agent` 不作为身份依据。打开停在工作区信任提示，尚未确认会话恢复，不给 open。 |
| Grok | `grok --resume {sessionId}` | ACP 可创建会话；CLI 启动未取得同会话内容回读，不给 open。 |
| OpenCode | `opencode --session {sessionId}` | ACP 可创建会话；CLI 打开空会话界面，未取得同 id 内容确认，不给 open。该参数也可创建不存在的会话，不能仅按启动成功判断恢复成功。 |
| Pi | `pi --session <path或id>`；ARC 自有 session-dir | 空 RPC 会话尚未写出可恢复文件，按 id 恢复返回找不到会话；不把 sessionFile 的预期路径当作已持久化证据，不给 open。 |
| DeepSeek Harness | `dsh tui --resume <session>` / ACP profile | ACP profile 可创建会话；已安装配置缺少 tui profile，未确认 Desktop 按会话打开的路径，不给 open。 |
| Gemini、Copilot、Kimi、Qwen、Kiro、Devin、Cline、Junie、Hermes、Droid、Goose、CodeBuddy、Oh My Pi | — | 本次原生发现未安装可用入口；未接入。 |
