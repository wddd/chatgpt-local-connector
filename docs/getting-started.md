# Your first Claude + Codex loop

**English** | [简体中文](zh-CN/getting-started.md)

Call `guide` first for this connection’s workflow, enabled ops, and examples. Use `guide({"op":"codex_create"})` for the full schema. Invoke operations through `query({"op":"…","args":{…}})` or `act({"op":"…","args":{…}})`; reread `guide` when a result’s `arcVersion` changes.

## Install and connect

[Install ARC](installation.md), open it, and sign in to Codex. Use the status shortcuts to review permissions, then choose **Add control source**. Later, use the homepage left dot or **Remote link → Add control source**.

### Add a control source

1. Choose a platform in the centered panel.
2. Select an existing connection. If needed, choose **Add connection**, complete that separate flow, and return with the new connection selected.
3. Copy the address and follow the platform settings path shown in ARC. Use **Open settings** to open the platform.
4. Return to ARC, compare the four-character pairing codes and check the client name and callback. Choose **New source** or **Reauthorize** an existing source. Optionally name a new source, then approve.
5. ARC shows the added source. Choose **Done**.

### Add a connection

Open **Remote link → Connections → Add connection**. Choose **Create my relay**, **Paste relay link**, **Dedicated tunnel**, **Own address**, **OpenAI Secure Tunnel**, **Claude Code**, or **Claude Desktop**. Follow the chosen method's configuration and finish on the connection success screen. Creating a connection is separate from authorizing a control source.

### Local clients

Choose **Claude Code** or **Claude Desktop** when adding a source, then select its local connection. If none exists, use **Add connection** to install it. ARC preserves other configuration entries. Restart Claude after installation. Local connections do not need network configuration or pairing-code approval; source setup waits for the client to connect.

### Manage sources and connections

**Remote link** lists each source separately. Open a source to change its label or product, copy its connection address, view its dispatches, or disconnect it. **All / By platform** changes grouping. The Connections section includes unused connections; open a dedicated tunnel there to edit it. Use **Add connection** to configure an own address or OpenAI Secure Tunnel.

Relay owners manage sharing, members, and deletion under **Settings → Extras → Relay hosting**. Joined relays have **Leave** in their connection detail. The deployer can technically inspect relayed traffic in the Cloudflare dashboard; only join someone you trust.

### 3. Dispatch and receive a notification

Open a Claude Code cloud session on claude.ai and send this prompt. Claude can read its own session ID from its environment, for example the `cse_…` value in `CLAUDE_CODE_REMOTE_SDK_URL`:

> Through ARC, create a Codex task that uses no tools, reads no files, and only replies ARC_LOOP_OK. Use a fresh requestId and set notify to {channel: "claude-session", target: your own Claude Code cloud session ID or URL}. Read the receipt and retain threadId and turnId, then end your turn. When the completion notification wakes this session, read the result and confirm it matches.

If Claude cannot read its own session ID, paste the cloud session URL or ID instead.

When Codex completes, ARC sends a status notification that wakes the same Claude session to read the result; for real work it can inspect the diff and continue the same task. The [Claude guide](guides/claude.md) covers task prompts, approvals, and the next round.

## Next

- Let a local Agent configure ARC: [Automatic setup](auto-setup.md).
- Understand task ownership and tool access: [Concepts](concepts.md).
- Prefer ChatGPT Chat: [ChatGPT guide](guides/chatgpt.md).
- Use Windows, Homebrew, or Linux: [Installation](installation.md).

## Check permissions and readiness

Before remote use, open ARC **Permissions & readiness** locally and choose **Check again**. Use **Grant access** where needed. Returning from System Settings refreshes the page.

Accessibility enables screen tree / press / show / key / raise. Screen recording enables capture and windows titles; macOS may require reopening ARC. Use Full Disk Access for file tools: projects in Documents, Desktop, Downloads, external disks or network volumes can otherwise prompt or fail. Core uses a read-only heuristic with granted / missing / unknown results; unknown is not permission. command checks FDA through its executor only when cwd is in a protected location.

Notification permission is checked in ARC Desktop for closed-loop fallback delivery; without Desktop only a log is recorded. Login readiness checks registration and disabled state. Codex, Claude and ingress verification appear on the same page. Inapplicable Windows/Linux permissions do not require action.

### Why does a remote tool return PERMISSION_REQUIRED?

Tools never request system consent. The error includes permissionId; use the local permissions page and retry. A terminal's grants do not establish permissions for Core, screen helper or the Codex executor. The FDA heuristic does not guarantee access to every volume.

For the bundled Desktop launch chain, grant Full Disk Access to ARC App: Core and its Codex app-server children inherit that responsible application. A standalone Core launched by a terminal can instead inherit that terminal's identity; its probe does not prove the App is ready.

## Limits

Keep the computer awake, online, and ARC running. Automatic follow-ups target a Claude Code cloud session; ordinary Claude chat URLs cannot receive them. Complete initial OAuth consent on the computer running ARC before leaving it. See [FAQ](faq.md) if the connector or notification fails.
