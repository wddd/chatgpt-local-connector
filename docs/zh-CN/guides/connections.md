# 管理连接

[English](../../guides/connections.md) | **简体中文**

打开**连接**可复制公网链接地址、查看状态及启动/停止。没有公网链接时，点击**部署公网链接**并登录自己的 Cloudflare 账号。部署保留进度、取消、必要时的账号选择及重试。本地只显示状态；通过 CLI/AX 配置的其他连接以只读行显示类型、地址和状态。

## 添加控制源

点击首页中心标志左半部分，或 SRC 平台面板中的**添加账号**；后者会预选平台。

1. 选择产品。
2. 远程产品先在需要时部署公网链接，再复制其 MCP URL 到 ARC 显示的客户端设置中并连接。
3. 在 ARC 核对配对码、填写账号名称并批准。重新授权可保留同一连接上的已有来源。批准使用核心默认的能力配置。

Claude Code 或 Claude Desktop 显示本地配置命令：在这台电脑的终端运行后重启客户端。完成命令页面不代表已观察到客户端接入。命令如下：

```sh
printf '%s' '{"body":{"target":"code"}}' | arc cli call local-access.install --stdin
printf '%s' '{"body":{"target":"desktop"}}' | arc cli call local-access.install --stdin
```

Windows PowerShell 使用 `'{"body":{"target":"desktop"}}' | arc cli call local-access.install --stdin`（也可将 target 改为 `code`）。

其他 MCP 客户端走公网链接，因为控制源注册表为 `custom` 推荐 HTTPS。UI 不提供连接选择或产品修正。客户端必须支持公网链接的 OAuth 流程；其他传输或认证方式由下面的 Agent 流程配置。

## 让自己的 Agent 配置其他方式

告诉本机 Agent 需要的方式和目标电脑。它可按 [CLI 参考](../../reference/cli.md#additional-connection-methods)的精确命令操作，并在外部登录或批准需要时使用 AX。这些方式没有 ARC 配置表单。先用 `arc cli status` 确认实例。凭据通过受保护的 stdin 输入，不放进聊天或日志。

### 自定义地址

让 Agent 创建入口，将公网 HTTPS 域名反向代理到本地监听端口，转发 `/mcp` 及全部 [OAuth 公共路由](../../reference/oauth.md#public-routes)。每个自定义监听使用独立端口，不要公开管理 API。

```sh
printf '%s' '{"name":"Custom proxy","controlSource":"claude","transport":"https","auth":"oauth","enabled":true,"config":{"httpsProvider":"custom","httpsUrl":"https://arc.example.com","httpsPort":8787}}' | arc cli ingress add --stdin
arc cli ingress start <ingressId>
arc cli ingress probe <ingressId>
```

### 专用隧道

已有 Cloudflare Tunnel token 和分配好的域名时：

```sh
printf '%s' '{"name":"Dedicated tunnel","controlSource":"claude","transport":"https","auth":"oauth","enabled":true,"config":{"httpsProvider":"cloudflare","cloudflareMode":"named","cloudflareToken":"<tunnel-token>","httpsUrl":"https://arc.example.com"}}' | arc cli ingress add --stdin
arc cli ingress start <ingressId>
```

ngrok、Pinggy 或 LocalXpose 由 Agent 读取 `arc cli ingress presets`、`arc cli schema ingress.add`、`arc cli schema ingress.update` 后填写对应配置。固定地址也可跟随 `arc cli setup next`、`arc cli setup apply <stepId> --stdin` 和 `arc cli setup wait` 的配置协议。提供商凭据建立隧道，客户端认证控制入口访问。

### OpenAI Secure Tunnel

取得 Tunnel ID、运行时密钥及所需 OpenAI 组织和 ChatGPT 工作区权限后，让 Agent 配置：

```sh
printf '%s' '{"name":"ChatGPT tunnel","controlSource":"chatgpt","transport":"openai-tunnel","auth":"openai","enabled":true,"config":{"tunnelId":"<tunnel-id>","apiKey":"<runtime-key>"}}' | arc cli ingress add --stdin
arc cli ingress start <ingressId>
arc cli ingress doctor <ingressId>
```

ARC 管理官方 Tunnel Client。将隧道关联到目标工作区，并在 ChatGPT 选择该隧道，见 [ChatGPT](chatgpt.md#高级openai-secure-tunnel)。

### 加入共享中继或托管中继

让 Agent 只执行任务需要的操作：

```sh
arc cli call relay.list
printf '%s' '{"body":{"name":"My computer"}}' | arc cli call relay.create --stdin
arc cli call relay.progress
printf '%s' '{"body":{"id":"<relayId>"}}' | arc cli call relay.share --stdin
printf '%s' '{"body":{"link":"<invite-link>","name":"My computer"}}' | arc cli call relay.join --stdin
printf '%s' '{"body":{"id":"<relayId>"}}' | arc cli call relay.instances --stdin
```

创建或加入后读取 `relay.progress`。CLI 参考说明取消、重试、轮换邀请、移除成员、退出和删除。私人邀请是凭据，只加入可信主机：部署者可在 Cloudflare 查看流量。删除托管中继会断开所有成员。

UI 会记住公网 relay。如果此前配置了多个自有 relay，全部保持只读，直到 Agent 明确指定一个，然后重新打开 ARC：

```sh
printf '%s' '{"body":{"values":{"arc.public-relay-id":"<owned-relayId>"}}}' | arc cli call preferences.set --stdin
```

此操作不迁移已有来源。加入他人的 relay 始终作为额外的只读连接。

### 切换来源连接或配置能力

更换连接和能力配置保留在 CLI/AX。让 Agent 指定目标，再在客户端重新添加连接器，批准匹配的请求：

```sh
arc cli source list
arc cli ingress list
arc cli source switch <sourceId> <ingressId>
arc cli ingress oauth list <ingressId>
printf '%s' '{"id":"<requestId>","allow":true,"sourceId":"<sourceId>"}' | arc cli ingress oauth decision <ingressId> --stdin
```

来源名称和历史保留，新授权成功后才撤销旧授权。`arc cli source switch <sourceId> --cancel` 取消待完成切换。能力配置通过 `arc cli source update <sourceId> --stdin` 使用 [CLI 参考](../../reference/cli.md#local-code-profile)中的字段；配对 UI 不覆盖它们。

## 限制

监听器运行或部署回执不等于远端验收，需从目标客户端验证已认证的工具响应。客户端套餐和工作区策略仍适用。ARC 使用 Streamable HTTP，不提供独立旧版 SSE 入口。LocalXpose 临时模式因首个请求重定向而不可用。提供商账号、域名、配额和出网由使用者负责。本地连接不能作为切换目标。非 OAuth 目标只承载一个来源，并在已认证请求到达时完成切换。
