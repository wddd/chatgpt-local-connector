# Your first Claude + Codex loop

**English** | [简体中文](zh-CN/getting-started.md)

Call `guide` first for this connection’s workflow, enabled ops, and examples. Use `guide({"op":"codex_create"})` for the full schema. Invoke operations through `query({"op":"…","args":{…}})` or `act({"op":"…","args":{…}})`; reread `guide` when a result’s `arcVersion` changes.

## Install and connect

[Install ARC](installation.md), open it and sign in to Codex. Welcome's local and remote choices both open Add SRC. Later, click the homepage hub's left half or **Add account** in a SRC platform panel.

### Add a control source

1. Choose the product.
2. Remote products use the public link. If missing, choose **Deploy public link** and sign in to your Cloudflare account. Copy its MCP URL into the client's settings and connect.
3. Return to ARC, compare the pairing code, name the account and approve. Choose reauthorization when an existing source is offered. Finish after the client actually connects.

Claude Code and Claude Desktop show the local setup command directly. Run it in a terminal on this computer and restart the client. They need no connection selection or pairing. Command success does not prove that the client has connected.

### Manage sources and connections

Manage sources in the homepage SRC panels. **Connections** shows the public link's address, state and Start/Stop. Local shows state only. Other connections configured through CLI/AX show read-only kind, address and state.

Your own Agent configures custom addresses, dedicated tunnels, OpenAI Secure Tunnel, shared-relay joining, relay hosting, invites and source connection switching through CLI/AX. See [Connections](guides/connections.md) for exact commands. These features have no configuration UI.

### Configure settings

Use Settings for everyday task behavior, appearance, system permissions and updates. Ask your own Agent to apply routing delay, proxy, quota policy or display tuning through [CLI/AX settings](guides/settings.md).

### Dispatch and receive a notification

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

Before remote use, open ARC **Settings → System permissions** locally and choose **Check again**. Use **Grant access** where needed. Returning from System Settings refreshes the page.

Accessibility enables screen tree / press / show / key / raise. Screen recording enables capture and windows titles; macOS may require reopening ARC. Use Full Disk Access for file tools: projects in Documents, Desktop, Downloads, external disks or network volumes can otherwise prompt or fail. Core uses a read-only heuristic with granted / missing / unknown results; unknown is not permission. command checks FDA through its executor only when cwd is in a protected location.

Notification permission is checked in ARC Desktop for closed-loop fallback delivery; without Desktop only a log is recorded. Login readiness checks registration and disabled state. Codex, Claude and ingress verification appear on the same page. Inapplicable Windows/Linux permissions do not require action.

### Why does a remote tool return PERMISSION_REQUIRED?

Tools never request system consent. The error includes permissionId; use the local permissions page and retry. A terminal's grants do not establish permissions for Core, screen helper or the Codex executor. The FDA heuristic does not guarantee access to every volume.

For the bundled Desktop launch chain, grant Full Disk Access to ARC App: Core and its Codex app-server children inherit that responsible application. A standalone Core launched by a terminal can instead inherit that terminal's identity; its probe does not prove the App is ready.

## Limits

Keep the computer awake, online, and ARC running. Automatic follow-ups target a Claude Code cloud session; ordinary Claude chat URLs cannot receive them. Complete initial OAuth consent on the computer running ARC before leaving it. See [FAQ](faq.md) if the connector or notification fails.
