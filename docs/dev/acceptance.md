# 验收

[开发](development.md) · [CLI 契约](../reference/cli.md)

## UI 场景

```sh
npm ci
npx playwright install chromium
npm run accept:ui
```

脚本启动独立 Vite 页面，以 640 和 1280 像素两种宽度、800 像素高度截图。已有服务占用 5187 端口时先停止该开发服务。场景模式不连接真实 Core，脚本会拒绝所有实际管理 API 请求。需要 WebKit 对照时运行：

```sh
npx playwright install webkit
npm run accept:ui -- --webkit
```

产物位于 `output/acceptance/ui/<时间戳>-<浏览器>/`：

- `index.html`：全部场景的当前截图、上次截图和像素差异对照。
- `report.json`：缺失基线、变化像素数、变化比例和渲染错误。
- `<场景>-<宽度>.png` / `.json`：截图与实时派生状态。
- `*-before.png` / `*-diff.png`：上次基线和像素差异。

首次运行只产生基线；后续运行与同一浏览器最近一次目录比较。变化标记供人工看图，不自动判为缺陷；渲染异常、意外真实 API 请求或场景节点缺失使脚本非零退出。基线和报告均被 Git 忽略。

场景位于 `tooling/acceptance/scenarios/*.json`。当前包括 `idle`、`single-task`、`parallel-seven`、`approval`、`long-multilingual`、`narrow-tentacles`、`left-panel`、`right-panel`、`light`、`dark`。左右面板分别截图，遵循产品单面板选择规则。可复制 JSON 修改 Agent、任务阶段、文案、主题、语言和面板；不需要添加单元测试。

手动查看运行 `npm run dev:ui` 后打开 `http://127.0.0.1:5187/?scenario=<场景名>`。只有 Vite 开发模式加载场景；发布构建不包含 fixture 模块。截图固定时间、减少动画，便于比较布局；不代表真实 Agent 或原生窗口验收。

## 通知可达性与控制源 guide

```sh
node tooling/acceptance/notifications.mjs
```

通过独立临时状态、MCP fixture、原生 Agent 模拟进程及本地假 Claude CLI 验收；所有派发使用 `purpose:"self-test"`。覆盖新目标、发送成功但未确认、一次性确认/重放、重启持久化、握手超时、投递失败与恢复，以及四种派发回执的等待分支。历史中位耗时使用合成记录，超时边界只修改临时状态中的截止时间。验证来源裁剪、schema 索引与 dispatch_policy 默认筛选，输出至 `output/acceptance/notifications/`（可传一个输出目录参数）。不调用真实账号或通知目标；真实云端会话收到验证码并回调仍需独立确认。

## 已安装 App 自截图

```sh
arc cli app start
arc cli app snapshot --out ./output/acceptance/manual
printf '%s' '{"width":1280,"height":800,"panel":{"kind":"agent","id":"codex"}}' | arc cli app snapshot --out ./output/acceptance/agent --stdin
```

未安装 shim 时使用 App 内 CLI 的完整路径。macOS 可运行 `cli install-shim` 建立 `~/.local/bin/arc`，重复运行幂等；遇到已有其他文件会停止，不覆盖。返回 `pathHint` 检查非交互 shell 的 PATH；缺少路径时可复制其中的 zsh 命令，不会自动修改 shell 配置。检查使用最小系统 PATH 启动 `$SHELL -c`，避免继承交互 shell 已添加的路径；不代表 SSH 服务端的自定义环境。

macOS App 自截图使用 WKWebView，不需要屏幕录制权限。输出包含 `snapshot.png`、`view-model.json`；返回值给出绝对路径。省略 `--out` 时保存在目标机状态目录的 `acceptance/<唯一编号>/`。Windows/Linux 桌面可导出渲染状态，PNG 返回 `NOT_SUPPORTED`；Linux 无界面核心没有可导出的 WebView。`layoutSettled` 始终为布尔值。检查 `png.ok` 和 `layoutSettled`，不要仅凭命令成功认定图片完整。

指定 `panel.kind` 为 `agent`、`source` 或 `none`；前两者需要节点 `id`。窗口尺寸与面板选择保留在 App 中。状态和截图依次采集，活动任务可能在两者之间更新。

## 跨设备

目标机需安装包含验收命令的 macOS App、配置可执行的 Codex 登录，并允许 SSH 别名免交互连接。脚本优先找 PATH 中的 `arc`，然后找标准 App 安装位置。

```sh
node tooling/acceptance/remote.mjs --host <host>
node tooling/acceptance/remote.mjs --host <host> --project /path/to/project --out ./output/acceptance/remote-manual
```

脚本通过 `app start` 启动 App 管理的 Core，读取 doctor，以 `local-cli` 派发只回复 `ARC_ACCEPTANCE_OK` 的只读任务，等待创建回执和任务终态，核对任务记录、来源与 activity，再收集 App 截图。不会启动独立 headless daemon，不执行宿主侧循环 SSH 轮询；等待由目标机 `cli wait` 完成，每段有明确期限。审批使用请求中的 `approval:bypass`，不修改目标机全局设置。

默认输出位于 `output/acceptance/remote/<时间戳>/`。每一步的 CLI JSON、`report.json`、`view-model.json` 与 `snapshot.png` 放在同一目录。报告将实际断言失败记为 `defects`；CLI 版本缺能力、无法连接或任务过快导致活动样本缺失等记为 `evidenceGaps`。退出码 0 表示已取得完整证据，1 表示发现缺陷，2 表示只有证据缺口。报告的 `assertions` 逐项记录：实际渲染任务按 `threadId` / `taskId` 匹配本轮派发、其来源为 `local-cli`、`layoutSettled:true`，以及 PNG 合成白底后的亮度像素方差大于 1。明确不匹配记为缺陷；缺少可判断数据或 PNG 无法解码记为证据缺口。任务失败时仍尝试采集截图。任务与目标机原始截图保留，可按报告中的 ID 和路径查看。

## 控制源与等待

```sh
arc cli control guide
arc cli control guide codex_create
printf '%s' '{"prompt":"Do not call tools. Reply ARC_ACCEPTANCE_OK.","mode":"read-only"}' | arc cli control codex_create --stdin
printf '%s' '{"threadId":"<thread-id>","turnId":"<turn-id>","until":"terminal"}' | arc cli wait --control --op codex_wait --stdin --until '/conditionMet==true' --timeout 60
arc cli wait --op status --until '/core/desktop/state=="ready"' --timeout 20
```

多个 `--until` 为 AND；支持 JSON Pointer 的 `==`、`!=` 和 `exists`。字符串比较值需要 JSON 双引号。超时读取 `error.lastResult`；不会取消或重复派发任务。完整参数从 `cli schema` 和 `cli control guide <op>` 获取。
