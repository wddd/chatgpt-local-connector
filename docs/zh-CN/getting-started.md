# 完成第一个 Claude + Codex 闭环

[English](../getting-started.md) | **简体中文**

先调用 `guide` 读取当前入口的编排指南、可用 op 和调用示例；`guide({"op":"codex_create"})` 可查看完整参数。所有操作通过 `query({"op":"…","args":{…}})` 或 `act({"op":"…","args":{…}})` 调用；结果中的 `arcVersion` 变化时重新读取 `guide`。

## 安装与连接

[安装 ARC](installation.md)，打开应用并登录 Codex。通过状态入口检查权限，然后点击**添加第一个控制来源**。之后可从首页左侧圆点或**远程链接 → 添加控制源**进入。

### 添加控制来源

1. 选择产品。
2. 选择已有连接或新建连接。已有 Relay 链接会标为推荐。**创建我的 Relay** 会登录 Cloudflare、部署并连接；**粘贴 Relay 链接**可加入可信任的共享 Relay。**专用隧道**打开提供商配置；ChatGPT 还可选择 **OpenAI Secure Tunnel**。
3. 复制地址，按 ARC 显示的产品设置路径添加连接，也可点击打开设置按钮。
4. 回到 ARC，核对四位配对码、客户端自报名称和回调地址。选择**新来源**或**重新授权**该连接上的已有来源。新来源可填写名称，然后批准，浏览器会自动返回。

### 本地客户端

选择 **Claude Code** 或 **Claude Desktop**，再选择**本地**并点击**继续**。ARC 添加独立配置条目，保留其他条目。安装后重启 Claude。本地连接不需要网络配置或配对码批准。

### 管理来源与连接

**远程链接**单独列出每个来源。打开来源可修改名称或产品、复制连接地址、查看派发记录或断开。**全部 / 按平台**切换分组。下方连接列表包含未使用的连接，可打开专用隧道并编辑。自定义地址和**发送到 Codex**位于添加流程第二步的**高级**中。

Relay 拥有者在**设置 → Relay 托管**管理共享链接、成员和删除。加入的 Relay 可在连接详情中退出。部署者技术上可在 Cloudflare 后台查看经过 Relay 的流量，请仅加入你信任的人。

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
