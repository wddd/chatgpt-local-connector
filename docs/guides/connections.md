# Manage connections

**English** | [简体中文](../zh-CN/guides/connections.md)

Open **Remote link → Connections → Add connection**. Add control source and Change connection also open this dialog above the current step. A connection supplies the address and access method; an OAuth connection can carry multiple named control sources.

## Add a connection

Choose a method, complete Configure, then finish on Ready.

| Method | Configuration |
| --- | --- |
| Create my relay | Sign in to Cloudflare; ARC deploys the relay and connects this computer. |
| Paste relay link | Paste an invite link and name this computer. Only join a host you trust. |
| Use your own address | Choose Cloudflare Tunnel, ngrok, Pinggy, LocalXpose, or another reverse proxy; enter the provider credentials, domain and connection name. |
| OpenAI Secure Tunnel | Enter a Tunnel ID and runtime API key. See [ChatGPT](chatgpt.md#advanced-openai-secure-tunnel). |
| Claude Code / Claude Desktop | Install the local client configuration, then restart the client. No network setup is needed. |

Own-address setup keeps authentication and tool permissions under **Advanced**. Use OAuth for approval in ARC, or Bearer for clients that send an Authorization header. Provider credentials establish the tunnel; client authentication controls access through it. A fixed domain must already be assigned in the provider account. Choose **Save and start**; ARC manages the required provider process.

When stacked, choose **Continue with this connection** to return with it selected. Standalone setup offers **Done** or **Add a source for it**. Closing the stacked dialog returns without changing the parent selection.

## Add a control source

Welcome offers **This computer** for local Claude clients and **Phone and web** for remote platforms. Both open Add control source; later, use **Remote link → Add control source**.

1. Choose the platform.
2. Select a compatible connection, or add one.
3. Copy the address and follow the platform settings in Configure. Connect in the client.
4. In Approval, compare the pairing code, check the client and permissions, and enter an account name. Choose **Reauthorize** if you want to keep an existing source on that connection. Approve and finish.

Opening **Add a source for it** from Connection detail preselects that connection and skips connection selection. Local clients and connections without OAuth complete after the client connects, without pairing-code approval.

## Connection detail

Open a row under **Remote link → Connections** to see its address, provider, online state and sources using it. Copy the address, open a source, or add a source for this connection. Non-local, non-relay connections offer **Edit**.

**Remove connection** disconnects its sources and retains their names and history. Reconnect them with Change connection. Joined relays offer **Leave relay**. A hosted relay has a link to its management page in Settings; deleting the relay itself happens there.

## Change a source's connection

1. Open the source detail and choose **Change connection**. Select a compatible target or add one, then continue.
2. In the client, remove the old ARC connector and add it again with the displayed address. Editing the URL also works if the platform supports it.
3. Return to ARC, compare the pairing code and check **Claim as <account name>**, the old connection and remaining sources. Choose **Approve and switch**.

The next authorization on the target connection claims the source even when re-adding registers a new client. The source keeps its name, history and notification settings; the old grant is revoked after the new authorization completes. Other sources on the old connection stay there. If the five-minute switch window expires, start Change connection again. Canceling or denying leaves the original connection unchanged.

For daily use, choose a fixed address. If a temporary address changes, remove and re-add the client's connector with the new address, or edit its URL where supported, and authorize again. Use Connection detail and Records for provider errors; see [FAQ](../faq.md) for client issues.

## Use a custom reverse proxy

Route the public HTTPS hostname to ARC's loopback listener. Give each fixed Cloudflare or custom connection a distinct local port. Forward `/mcp` and every route in the [OAuth reference](../reference/oauth.md#public-routes) for OAuth. Keep ARC's management API private.

## Host a relay for others

Open **Settings → Extras → Relay hosting** and choose **Deploy new relay**. Sign in to Cloudflare and wait for deployment and connection. **Copy invite link** invites another computer. **Reset** invalidates the old invite without disconnecting joined devices.

**Connected devices** lists names, joined time and last seen. **This computer** has no Remove action. Removing another device disconnects it; it can rejoin with a valid invite. **Delete…** disconnects every device, including this computer, and deletes the hosted relay. Removal and deletion require confirmation.

Joined relays stay under **Remote link → Connections**. The homepage topology switch is under **Settings → Extras → Experimental**.

## Limits

Only join trusted relays: their deployer can technically inspect relayed traffic in Cloudflare. ARC uses Streamable HTTP, not a standalone legacy SSE endpoint. LocalXpose temporary mode is unavailable because the first request is redirected. Provider accounts, domains, quotas and outbound connectivity remain your responsibility. None authentication allows anyone who can reach the endpoint to use its allowed tools. Local connections cannot be switch targets; a non-OAuth target must have no source and completes the switch on an authenticated client request rather than OAuth approval.
