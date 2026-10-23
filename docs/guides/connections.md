# Choose an HTTPS connection

**English** | [简体中文](../zh-CN/guides/connections.md)

Start with **Add control source** and choose a product, then an existing connection or a new relay link or dedicated tunnel. ChatGPT also supports [Secure Tunnel](chatgpt.md). Each connection has its own provider, credentials, URL, and allowed tools; OAuth connections may carry multiple sources.

| Provider | What to enter | Address |
| --- | --- | --- |
| Cloudflare Temporary | Nothing | Generated temporary hostname |
| Cloudflare Fixed | Tunnel token and configured public domain | Fixed hostname |
| ngrok | Authtoken; configured domain for fixed mode | Assigned or fixed hostname |
| Pinggy Temporary | Nothing | Temporary hostname |
| Pinggy Fixed | Token and assigned domain | Fixed hostname |
| LocalXpose | Access token and reserved/custom domain | Fixed hostname |
| Custom | Public MCP URL and local listener address/port | Your reverse proxy |

## Connect

1. To create a connection, choose **Dedicated tunnel** in step two of **Add control source**. To edit one, open **Remote link → Connections**, select it, and choose **Edit**.
2. Choose the provider and enter the required fields. Use **Get token** links when offered.
3. Select the client's authentication: OAuth for Claude, or Bearer for clients supporting the `Authorization` header. Keep the Default op list to begin.
4. Save to return to the connection view and connect automatically. ARC downloads the provider component when needed and manages its process.
5. Copy the displayed MCP URL into the client. For OAuth, return to ARC to compare the pairing code and approve. Choose a new source or reauthorize an existing source when prompted.

Provider credentials connect the tunnel; MCP authentication controls access through it. They are separate fields. A fixed domain must already be assigned in your provider account.

The homepage and Remote link source detail show recent Codex dispatches for that source ID. Open a running row to switch to the Agent task detail. Source details also let you edit the label or product and disconnect with confirmation. Relay-owner sharing, member management, and deletion are in **Settings → Extras → Relay hosting**; joined relays can be left from their connection detail.

## Use a custom reverse proxy

Route the public HTTPS hostname to ARC's loopback listener. Each fixed Cloudflare or custom ingress needs a distinct local port. Forward `/mcp` and every route listed in [OAuth reference](../reference/oauth.md#public-routes) when using OAuth. ARC's management API stays private.

## Keep the connection usable

For daily use, choose a fixed address. If a temporary address changes, update the connector's URL and authorize again. Use the connection details and Records to diagnose provider errors; use [FAQ](../faq.md) for client-side issues.

## Limits

ARC uses Streamable HTTP, not a standalone legacy SSE endpoint. LocalXpose temporary mode is unavailable because the first request is redirected. Provider accounts, domains, quotas, and outbound connectivity remain your responsibility. Choosing None authentication lets anyone who can reach the endpoint use its allowed tools.

## Host a relay for others

Open **Settings → Extras → Relay hosting** and choose **Deploy new relay**. Sign in to Cloudflare and wait for deployment and connection to finish. Use **Copy invite link** to invite another computer. **Reset** invalidates the old invite link without disconnecting devices that already joined.

**Connected devices** shows device names, joined time, and last seen. **This computer** identifies the local instance and has no Remove action. Removing another device disconnects its relay link; it can join again with a valid invite link. **Delete…** at the bottom disconnects every device, including this computer, and deletes the hosted relay. These actions require confirmation.

Joined relays never appear here. Manage their connections in **Remote link → Connections**. The homepage topology switch is under **Settings → Extras → Experimental**.
