# Agent 任务追踪

[UI 规范](ui.md) · [派发 Agent](dispatch-agents.md) · [架构](architecture.md)

首页沿用控制源、ARC 中心与 Agent 的一级连接；Agent 通过外弧和二级触手连接任务气泡，点击气泡打开当前任务的执行时间线。节点活动、任务摘要与时间线共用原生侧归一化，同一层也产出执行证据。

## 目标与边界

- 统计范围是该 Agent 的**所有活动会话**：ARC 派发的 ACP/Pi 任务、经 Codex app-server 派发的线程，以及用户直接在 Codex Desktop、Claude Code 中开的会话（本地 transcript 扫描）。
- 第三级在 ARC 内渲染**执行时间线**，覆盖 ARC 派发的任务（ARC 持有完整事件流）。非 ARC 会话只有第一、二级，点击跳转到 Agent 的原生入口（有则给，无则不可点）。
- 时间线不是通用对话渲染器：前端只认归一化后的条目词表，不接触各 Agent 的原始消息格式；新增 Agent 只写原生侧适配器。
- 不修改受控 Agent 的源码或私有存储（例如不写其 workspace 索引）。
- 公开仓库：文档、测试与 fixture 使用通用示例，不出现个人项目名、路径或账号信息。

## Native 当前接口

- 归一化在 Core 内维护；ACP/Pi 随 ARC 任务记录保存，Codex app-server 在首次时间线请求时读取线程历史，并与本次 Core 观察到的派发线程合并。实时条目的时间戳是 ARC 观察时间；只在历史中出现的条目开始/结束时间为 null，耗时优先使用上游 durationMs，不推断未观察到的时间。
- `agents/activity` 返回会话快照与兼容字段 `activeAgents`。等待审批、问题或选择的会话仍计为活动。
- `agent_context.evidence` 是所选回合的 command/file 条目，`executionEvidence` 按本会话观察返回 `true`、`false` 或 `"partial"`；有协议事件但没有工具调用时返回空证据，不报 unsupported。
- 首页使用会话快照；Desktop 订阅 `agents:activity`，Web 订阅 SSE，首屏与订阅失败时用 GET。`activeAgents` 仅保留供旧调用方兼容。

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
- **Codex**：app-server 的 thread item（已类型化，含 reasoning 摘要），首次读取用 app-server 线程历史回填。
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

- `phase`/`headline` 优先取自 pending/running 的非交互条目，其次才取最新结束条目；同优先级按更新顺序选择，迟到的完成事件不抢占进行中的阶段。pending 交互优先覆盖；已解决交互不参与阶段与摘要选择，`phaseSince` 回到所选条目的开始时间。思考取末行，命令取命令行，文件取路径，文本取最近一句；文字摘要去除 Markdown 格式符号，命令和路径保持原文。
- 有待处理 interaction 的会话（含 `waiting-permission`）仍计为活动，并单独标记。
- `timeline: true` 表示可请求时间线；是否完整以 coverage 为准，外部会话也可以提供只读时间线。
- `fallbackHeadline` 为最近非空文本、思考、命令或文件摘要，无可读条目时取任务标题或最近用户消息；`recentContent` 提供最近三条可读摘要。两者供空 headline 和无时间线详情使用，不改变当前 phase/headline 的含义。
- `open` 仅在已验证可用时给出；没有入口则省略。
- 推送沿用 Tauri 事件（同 `subscriptions:changed` 模型），节流约 1s；Web 端用 SSE。保留一次性 GET 供首屏与降级。

### 时间线接口

本地管理接口（沿用本地 Core 认证）：

| 操作 | 接口 |
|---|---|
| 一次性活动快照 | `GET /api/agents/activity`；CLI `agents.activity` |
| 本地交互响应 | `POST /api/agents/respond`，body 为快照的 `{op,args}` 并在 args 补入选项与稳定 `requestId`；CLI `agents.respond`，参数 `{"body":{"op":"agent_respond","args":{…}}}` |
| Web 推送 | `GET /api/agents/activity/events`，SSE `event: snapshot` |
| Desktop 推送 | Tauri `agents:activity`，payload 与 GET 一致 |
| 会话时间线 | `GET /api/agents/timeline/{id}?after={cursor}`；CLI `agents.timeline`，参数 `{"id":"…","body":{"after":12}}` |
| 已验证 CLI 会话入口 | `POST /api/agents/sessions/{id}/open`，body `{"agent":"claude"}`；CLI `agents.session.open` |

`id` 使用活动快照的 `sessions[].id`：ACP/Pi 为 ARC taskId（另给 `nativeSessionId`），Codex 为 threadId。`after` 可省略，默认 0；它是条目更新序号，同一 id 的 chunk 合并、完成与审批解决也推进游标。客户端按 id 替换条目，保留未出现在增量响应中的条目，并按 `position` 排序（回填旧条目时也会更新已有条目的位置）；游标超过当前序号时报 `TIMELINE_CURSOR_EXPIRED`，重新全量读取。时间线不需要前端处理原始 chunk。

```json
{
  "sessionId": "<activity-session-id>",
  "status": "completed",
  "entries": [
    {
      "id": "command-example", "type": "command", "status": "completed",
      "startedAt": "2026-01-01T00:00:00.000Z", "endedAt": "2026-01-01T00:00:01.000Z",
      "updatedAt": "2026-01-01T00:00:01.000Z", "cursor": 13, "position": 0, "turnId": "turn-example",
      "command": "printf example", "exitCode": 0, "exitCodeSource": "rawOutput"
    }
  ],
  "cursor": 13,
  "coverage": {"state": "complete", "truncated": false},
  "executionEvidence": true
}
```

工具输入与输出摘要沿用 `agent_context` 的 1024 字节 excerpt 结构，含 `truncated`、摘要 hash；文本合并上限沿用 256 KiB，事件/条目窗口沿用 2000 条与 8 MiB。窗口丢失或合并文本截断后 `coverage.state` 为 `partial`，不宣称全历史完整。Codex 首次读取在当前 Core 内按线程串行回填一次：调用 app-server `thread/read`（`includeTurns: true`），将各 turn 的 items 投影为同一词表，按 item id 与实时条目去重。回填读期间更新过的实时条目优先，已有观察时间保留；历史顺序优先，实时独有条目保留。重启后根据 ARC 任务记录识别可回填的 threadId，并在活动快照中恢复该线程的时间线入口；Desktop 线程先恢复只读事件订阅，不恢复或重启后台任务。非 ARC transcript 仍不提供时间线。原生历史读取失败、缺少 turns/items 或超过内容/条目上限时返回 partial；成功投影的历史不因原始事件窗口淘汰而变成 partial。回填失败保留实时条目，本次 Core 不自动反复重试回填。

响应 `status` 表示任务状态，`position` 为条目顺序键（不要求连续，窗口淘汰后不回退），`durationMs` 为可用的原生耗时。历史条目没有可信观察时间时 `startedAt` / `endedAt` 可为 null。Pi interaction 附 `method`（select / confirm / input / editor）；选择传 `value`，输入或编辑传字符串 `value`，取消传 `cancelled: true`，均沿用 `agent_respond`。

活动推送约每秒检查一次，忽略 `observedAt` 的单独变化；本地 transcript 尾部约每两秒采样，不产生时间线。`phaseSince` 在同一条目的内容变化时保持其开始时间。待处理条目的 `interaction.respond` 复用原有 `agent_respond` / `codex_respond` 参数，调用时按既有契约补选项、答案与新的 requestId。`open.kind=url` 直接打开 target；`open.kind=agent-session` 将 target 交给上述 session open 接口。

## 首页 UI

### 布局与节点

- 有任务的 Agent 按可见槽位分配高度：每槽 64px，行高为 `n × 64 + 8`；空闲行高 46px，行间距 10px。每个 Agent 最多占五槽，超限汇总也占一槽。
- 列高为各行高与间距之和，场景高为 `max(视口高, 列高 + 160)`；控制源过密时保留其最小行距所需高度。列在场景内垂直居中，ARC 标识与控制源对齐中线。Agent 槽位不随短窗口压缩，控制源仍先压缩行距；高度不足时整个场景纵向滚动。
- 有任务节点为 44px。空闲节点缩至 0.78 倍、不透明度 0.62，并向左缩进 26px；名称始终在节点下方。一级触手保留耳罩端口、密集扩角与原有曲线视觉，Agent 侧有任务与空闲链路的不透明度分别为 0.75、0.28。
- 保留节点拖动排序、键盘排序、点击展开 Agent 详情、配额环与 QuotaBubble。运行时沿用 ActivityArc；待处理时改为 warning 并停转，不显示数量角标。

### 外弧、触手与气泡

- 有任务节点右侧绘制半径 34px、线宽 4px、圆头外弧。半角 `span = min(58°, 16° + 11° × n)`；单任务端口角为 0，多任务均匀分布于 `±0.72 × span`。
- 气泡中心按 64px 间距围绕节点中心排列，左缘位于节点中心右侧 110px。二级触手为三次曲线，控制点分别在端口右侧 56px、气泡左侧 70px。
- 一级与二级连线共用 Motion postRender 坐标读取，节点、气泡与外弧的端口和槽位使用弹簧跟随。拖动、让位、归位时二级结构跟随节点，静止后停止逐帧读取。
- 最多五条二级触手；超过五个任务时，前四个单独显示，第五槽为“还有 N 个任务 / 查看全部”。汇总触手用 border-strong，点击打开该 Agent 的完整活动任务列表，包含外部会话；列表使用无气泡阴影的平铺行。
- 待处理交互排最前，其余按开始时间排序。首次观察时固定开始顺序；缺少开始时间时使用首次观察时间，同时间按会话 id 确定顺序。阶段、摘要、快照顺序与后续时间戳修订不触发重排。
- 气泡所有状态固定为 232 × 54px，圆角 13px、内边距 8px 12px，使用 surface、内描边、阴影与圆体。整个气泡是按钮，没有内嵌审批按钮、叠放、悬停展开或数量角标。
- 第一行为 14px 阶段图标、12px/500 阶段名与右对齐的 11.5px 等宽计时；第二行为 13px 单行 headline。命令用等宽字，文件显示项目内相对路径并优先保留文件名；当前内容为空（包括无可读思考摘要）时，依次取最近非空文本/命令/文件、任务标题或最近用户消息；尚无任何内容时显示通用任务标题，第二行始终非空。回退文字使用 text-tertiary。摘要最多每秒刷新一次，使用 220ms、5px 上移交叉淡入。
- 思考图标为三个呼吸点，命令为旋转弧，编辑为轻微上下移动的笔尖，回复为闪烁光标，待处理为 warning 盾牌，完成为 success 对勾。
- 运行触手用 accent，叠加 `2 10` 流动虚线，周期 900ms；待处理用 warning 并静止，气泡 warning 内描边为 1.5px，外弧同步 warning；刚结束用半透明 success 并静止。
- 后端完整快照移除会话后，前端保留最后摘要并显示“已完成”约 2s，再用 300ms 淡出与约 420ms 槽位合拢。打开详情的任务保留触发气泡与链路，防止阅读中失去连接和焦点返回点；关闭后再进入结束停留。打开期间任务超出前五槽时保留选中槽，其余计入汇总。
- 外部会话（source=transcript）使用 text-tertiary 的 `3 5` 虚线与 ↗；点击同样打开详情，↗ 只表示外部来源；跳转 Agent 应用的入口仅位于详情头部。
- 气泡与二级触手在窄窗口右侧直接截断，右缘有 32px 渐隐；不缩窄、不隐藏整组、不产生横向滚动。可见的气泡部分仍可点击。新增气泡 300ms 自左 10px 滑入淡入，触手从外弧长出。

### 当前任务详情

- 从所点气泡通过 ElasticPanel / surfaceMotion 变形展开，宽 400px，距窗口右侧、顶部、底部各 16px，圆角 20px。打开约 250ms、关闭 160ms、遮罩淡入 220ms。
- 被点触手连接面板左缘；所属 Agent 节点、外弧、该触手与一级链路位于遮罩之上，其余压暗。打开时锁定场景滚动，Escape 或点击遮罩关闭并恢复气泡焦点。
- 面板只含当前任务，没有任务切换。头部第一行显示 Agent 图标、最多两行的任务标题，以及原生入口图标和关闭按钮；第二行显示状态与 Agent/项目/总耗时。状态区区分待处理、运行中与已完成。
- 时间线保留归一化条目：文本 Markdown、用户消息浅底引用、折叠命令/文件/工具与输出、思考、计划、交互结果和错误。条目在内部滚动，不改变外壳尺寸；支持回到最新。
- ARC 任务首次全量读取，此后每次读取完成约 1s 后按 after 增量拉取，不重叠请求；游标过期时全量重拉。外部会话约 5s 全量刷新只读快照。关闭停止轮询。coverage 为 partial 时提示历史不完整。
- 外部 Codex 通过 app-server 的 thread/read（includeTurns）复用历史回填；不接管线程、不恢复任务、不登记审批。Claude 本地 transcript 使用相同词表投影文本、用户消息、思考、工具调用和结果，按工具 id 合并；读取最多末尾 8 MiB，截断时标记 partial。外部时间线响应附带 readOnly，使用全量快照而非 after 增量。
- 所有来源的气泡均打开详情。外部会话没有时间线或读取失败时显示当前阶段、最近几条可读内容与“该会话不是由 ARC 派发，完整记录请在 Agent 中查看”；有 open 时在头部提供图标入口。外部会话不提供审批操作。
- 首次定位底部；运行时自动跟随，上翻后暂停，回到底部 24px 范围内恢复。结束时保留最后一次跟随，之后不自动跳动；任务结束不关闭详情。
- 审批和 Pi 选择/输入问题仅放在底部固定卡片。卡片使用 warning-soft 背景与 warning 描边，展示请求者、对象、单次允许说明和拒绝/允许操作；待处理卡片出现时获得焦点。卡片占满底栏宽度，左右内边距 14px；单次允许说明位于按钮左侧，按钮右对齐。文件请求按已知路径显示；同回合关联工具明确给出 read/write/edit/create 操作时使用读取或写入，否则保留“访问文件”，不从路径或标题猜测权限。
- 本地 respond 转发、提交锁、稳定 requestId 和回执状态沿用现有实现。提交中转圈并禁止重复；成功后收起卡片，时间线保留响应结果。ACP 允许只选择 allow_once，没有单次选项时不可允许。
- 时间线交互使用无边框单行：等待审批与对象，提交后显示允许或拒绝结果。同回合、相同明确对象的关联工具仍待执行时不重复显示；并行同对象无法唯一关联时保留工具，避免误隐藏。工具实际执行后恢复正常条目。文件和命令统一使用左侧折叠箭头，无详情时不提供折叠控件；未知耗时不显示占位破折号。
- 不提供额外消息输入框，问题回答字段除外。

所有颜色使用语义 token，支持深浅主题。reduced-motion 下流动与图标静止，伸缩和位移直接切换。

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
