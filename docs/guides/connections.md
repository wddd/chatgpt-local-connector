# Manage connections

**English** | [简体中文](../zh-CN/guides/connections.md)

Open **Connections** for the public link's address, state and Start/Stop. If no public link exists, choose **Deploy public link** and sign in to your Cloudflare account. Deployment shows progress, cancellation, account selection when needed and retry. Local shows its state. Connections configured through CLI/AX appear as read-only rows with kind, address and state.

For an outbound proxy or other specialized app settings, ask your Agent to follow [CLI/AX settings](settings.md).

## Add a control source

Open the homepage hub's left half, or **Add account** in a SRC platform panel. The latter preselects the platform.

1. Choose the product.
2. For remote products, deploy the public link if needed, then copy its MCP URL into the client settings shown in ARC and connect.
3. Compare the pairing code in ARC, name the account and approve. Reauthorization can retain an existing source on the same connection. Approval uses the core's default capability profile.

For Claude Code or Claude Desktop, run the displayed local setup command in a terminal on this computer, then restart the client. Completing the command screen is not proof that the client connected. The commands are:

```sh
printf '%s' '{"body":{"target":"code"}}' | arc cli call local-access.install --stdin
printf '%s' '{"body":{"target":"desktop"}}' | arc cli call local-access.install --stdin
```

On Windows PowerShell, use `'{"body":{"target":"desktop"}}' | arc cli call local-access.install --stdin` (or target `code`).

Other MCP clients use the public link because the control-source registry recommends HTTPS for `custom`. The UI has no connection selection or product correction. A client must support the public link's OAuth flow; an alternate transport or authentication method belongs to the Agent workflow below.

## Ask your own Agent to configure other methods

Tell your local Agent which method and target computer you want. It can apply the exact commands from the [CLI reference](../reference/cli.md#additional-connection-methods), using AX for the external login or approval when needed. These methods have no ARC configuration forms. Read `arc cli status` first to identify the instance. Pass credentials through protected stdin; keep them out of chat and logs.

### Custom address

Have the Agent create the ingress, route the public HTTPS hostname to its loopback listener, and forward `/mcp` plus every [OAuth public route](../reference/oauth.md#public-routes). Give each custom listener a distinct port. Keep management private.

```sh
printf '%s' '{"name":"Custom proxy","controlSource":"claude","transport":"https","auth":"oauth","enabled":true,"config":{"httpsProvider":"custom","httpsUrl":"https://arc.example.com","httpsPort":8787}}' | arc cli ingress add --stdin
arc cli ingress start <ingressId>
arc cli ingress probe <ingressId>
```

### Dedicated tunnels

For an existing Cloudflare Tunnel token and assigned hostname:

```sh
printf '%s' '{"name":"Dedicated tunnel","controlSource":"claude","transport":"https","auth":"oauth","enabled":true,"config":{"httpsProvider":"cloudflare","cloudflareMode":"named","cloudflareToken":"<tunnel-token>","httpsUrl":"https://arc.example.com"}}' | arc cli ingress add --stdin
arc cli ingress start <ingressId>
```

For ngrok, Pinggy or LocalXpose, ask the Agent to read `arc cli ingress presets`, `arc cli schema ingress.add` and `arc cli schema ingress.update` and supply the provider config. It can also follow `arc cli setup next`, `arc cli setup apply <stepId> --stdin` and `arc cli setup wait` for the fixed-address setup protocol. Provider credentials establish the tunnel; client authentication controls access through it.

### OpenAI Secure Tunnel

Obtain the Tunnel ID and runtime key with the required OpenAI organization and ChatGPT workspace access. Ask the Agent to configure:

```sh
printf '%s' '{"name":"ChatGPT tunnel","controlSource":"chatgpt","transport":"openai-tunnel","auth":"openai","enabled":true,"config":{"tunnelId":"<tunnel-id>","apiKey":"<runtime-key>"}}' | arc cli ingress add --stdin
arc cli ingress start <ingressId>
arc cli ingress doctor <ingressId>
```

ARC manages the official Tunnel Client. Associate the tunnel with the intended workspace and select it in ChatGPT. See [ChatGPT](chatgpt.md#advanced-openai-secure-tunnel).

### Join a shared relay or host one

Ask the Agent to run only the needed operations:

```sh
arc cli call relay.list
printf '%s' '{"body":{"name":"My computer"}}' | arc cli call relay.create --stdin
arc cli call relay.progress
printf '%s' '{"body":{"id":"<relayId>"}}' | arc cli call relay.share --stdin
printf '%s' '{"body":{"link":"<invite-link>","name":"My computer"}}' | arc cli call relay.join --stdin
printf '%s' '{"body":{"id":"<relayId>"}}' | arc cli call relay.instances --stdin
```

Read `relay.progress` after creating or joining. The CLI reference documents cancellation, retry, invite rotation, member removal, leaving and deletion. A private invite is a credential. Only join a trusted host: the deployer can inspect traffic in Cloudflare. Deleting a hosted relay disconnects all its members.

The UI remembers its public relay. If multiple owned relays predate that choice, all remain read-only until your Agent selects one explicitly, then you reopen ARC:

```sh
printf '%s' '{"body":{"values":{"arc.public-relay-id":"<owned-relayId>"}}}' | arc cli call preferences.set --stdin
```

This does not move existing sources. A joined relay remains an additional read-only connection.

### Move a source or configure capabilities

Connection switching and capability profiles remain CLI/AX operations. To switch, have your Agent select the target, then re-add the connector in the client and approve the matching request:

```sh
arc cli source list
arc cli ingress list
arc cli source switch <sourceId> <ingressId>
arc cli ingress oauth list <ingressId>
printf '%s' '{"id":"<requestId>","allow":true,"sourceId":"<sourceId>"}' | arc cli ingress oauth decision <ingressId> --stdin
```

The source keeps its name and history; the old grant is revoked after the new authorization succeeds. `arc cli source switch <sourceId> --cancel` cancels the pending switch. Capability profiles use `arc cli source update <sourceId> --stdin` with the fields in the [CLI reference](../reference/cli.md#local-code-profile); the pairing UI does not override them.

## Limits

A running listener or deployment receipt is not remote acceptance; verify an authenticated tool response from the intended client. Client plans and workspace policies still apply. ARC uses Streamable HTTP, not a standalone legacy SSE endpoint. LocalXpose temporary mode is unavailable because its first request redirects. Provider accounts, domains, quotas and outbound connectivity remain your responsibility. Local connections cannot be switch targets. Non-OAuth targets carry one source and complete switching on an authenticated request.
