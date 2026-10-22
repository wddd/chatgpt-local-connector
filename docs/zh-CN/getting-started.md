# 完成第一个 Claude + Codex 闭环

[English](../getting-started.md) | **简体中文**

先调用 `guide` 读取当前入口的编排指南、可用 op 和调用示例；`guide({"op":"codex_create"})` 可查看完整参数。所有操作通过 `query({"op":"…","args":{…}})` 或 `act({"op":"…","args":{…}})` 调用；结果中的 `arcVersion` 变化时重新读取 `guide`。

## 安装与连接

[安装 ARC](installation.md)，打开应用并登录 Codex。在欢迎页选择「在这台电脑上」或「在手机和网页上」，按底部状态入口补齐权限。

### 本机模式

ARC 自动为已安装的 Claude Code 添加连接。Claude 桌面版点击「安装扩展」；ARC 合并官方配置文件中的独立条目，保留其他扩展，完成后重启 Claude。复制面板中的试用提示，无需配置网络。

### 创建或加入中继

选择「创建我的中继」，登录免费的 Cloudflare 账号。ARC 依次完成登录、部署和连接，随后显示远程链接。已有共享链接时，选择「使用共享中继」并粘贴。

部署者在 ARC 内只看得到电脑列表，但技术上可在 Cloudflare 后台看到经过中继的流量；仅加入你信任的人。拥有者在「远程链接」复制或重置共享链接、移除电脑；加入者可以退出。

### 添加控制源

1. 选择 Claude、ChatGPT 或其他控制源，复制链接。
2. 按面板提示，在控制源设置中添加链接。
3. 回到 ARC，确认四位配对码与浏览器相同，再批准。浏览器会自动返回，连接完成后可复制试用提示。

ChatGPT 默认使用同一条远程链接流程。已有地址、OpenAI Secure Tunnel 和 Agent 辅助配置在「远程链接 → 高级」。

### 3. 派任务并接收通知

在 claude.ai 打开 Claude Code 云端会话，发送下面的提示词。Claude 可以从自身环境读取会话 ID，例如 `CLAUDE_CODE_REMOTE_SDK_URL` 中的 `cse_…`：

> 通过 ARC 创建 Codex 任务，不调用工具、不读取文件，只回复 ARC_LOOP_OK。使用新 requestId，设置 notify 为 {channel: "claude-session", target: 你自己的 Claude Code 云端会话 ID 或 URL}。读取回执，保留 threadId 和 turnId，然后结束本轮。完成通知唤醒本会话后读取结果，确认内容一致。

若 Claude 无法读取自身会话 ID，再手动粘贴云端会话 URL 或 ID。

Codex 轮次完成后，ARC 的状态通知唤醒同一 Claude 会话，让它读取结果；处理真实工作时，它可以审查 diff，再继续同一个任务。[Claude 指南](guides/claude.md)说明任务提示词、审批和下一轮操作。

## 下一步

- 让本机 Agent 配置：[自动配置](auto-setup.md)。
- 理解任务归属与工具权限：[概念](concepts.md)。
- 使用 ChatGPT Chat：[ChatGPT 指南](guides/chatgpt.md)。
- 使用 Windows、Homebrew 或 Linux：[安装说明](installation.md)。

## 检查权限与就绪

远程使用前，在本机打开 ARC **权限与就绪**，点击 **重新检测**。按需点击 **去授权**，从系统设置切回 ARC 会自动刷新。

辅助功能用于 screen tree / press / show / key / raise；屏幕录制用于 capture 和 windows 标题，授权后可能需要重开 ARC。文件访问统一引导完全磁盘访问：项目在文稿、桌面、下载、外置盘、网络卷时，没有授权可能弹窗或失败。Core 的只读探测为启发式，结果为 granted / missing / unknown；unknown 不代表已授权。command 仅在 cwd 位于受保护位置时，通过实际执行通道检测 FDA 并快速失败。

通知权限在 ARC Desktop 中检测，用于闭环通知兜底；Desktop 未运行时仅记日志。登录时启动检查注册与禁用状态。Codex、Claude 和入口验证状态在同页查看。Windows/Linux 不适用的系统授权不要求开启。

### 远程工具为什么返回 PERMISSION_REQUIRED？

工具不会主动请求系统权限。错误包含 permissionId，请在本机权限页处理后重试。不要把 CLI 所在终端的授权当作 Core、screen helper 或 Codex 执行宿主的授权。FDA 的启发式结果不保证所有卷可访问。

打包 Desktop 的启动链中，完全磁盘访问授权对象为 ARC App：Core 及其启动的 Codex app-server 子进程继承该应用身份。终端单独启动 Core 可能继承终端身份，不能用它的探测结果证明 App 已就绪。

## 限制

电脑需保持唤醒、联网，ARC 需保持运行。自动回访发送到 Claude Code 云端会话，普通 Claude 聊天链接不能接收。离开电脑前，在运行 ARC 的电脑上完成首次 OAuth 同意。连接或通知失败时查看[常见问题](faq.md)。
