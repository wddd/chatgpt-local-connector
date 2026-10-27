# 让本机 Agent 自动配置 ARC

[English](../auto-setup.md) | **简体中文**

全新 Mac 上，只要已登录本机 Agent，就可以从这一句话开始：

> 在这台电脑上配置 Agent Remote Control，按照 https://raw.githubusercontent.com/whzxc/agent-remote-control/main/skills/arc-setup/SKILL.md 操作。

skill 会检测 ARC，缺失时运行 release 安装脚本，给当前 Agent 安装配置 skill，再按本机模式或共享中继路径继续。macOS 安装脚本会校验 App 压缩包、安装并打开 ARC，等待 Core 就绪，无需挂载 DMG 或自行拼装命令。

远端验证通过 `act({"op":"connector_verify","args":{"code":"<验证码>"}})`；任务验收先读 `guide`，再通过 `act` 派发、`query` 等待与读取。若缓存的 guide 参数不接受 op，使用 `query({"op":"guide","args":{"op":"codex_create"}})`。MCP 工具固定为 guide / query / act，连接里的档位作用于 op。

## 在 App 中继续

点击首页中心标志左半部分并选择产品。远程产品共用公网链接：没有时一键部署到自己的 Cloudflare 账号，复制 MCP URL 后在本机核对配对码并批准。本地客户端显示配置命令，运行后重启客户端。详见[上手](getting-started.md)。

自定义地址、专用隧道、OpenAI Secure Tunnel、加入共享中继和中继托管由自己的 Agent 按[连接指南](guides/connections.md)的 CLI 命令操作，必要时使用 AX 完成外部登录；App 只读显示产生的连接。需要登录、密码、2FA、付款或策略要求的批准时由你参与。

## 限制

共享中继部署者在 ARC 内只看得到电脑列表，但技术上可在 Cloudflare 后台看到经过中继的流量；仅加入你信任的人。账号与工作区仍须允许添加相应连接。已批准只证明授权完成，真实远端工具响应才证明连接可用；本机命令成功不能替代它。保持电脑唤醒且 ARC 运行。自动回访还需本机 Claude Code 登录和发起方云端会话。
