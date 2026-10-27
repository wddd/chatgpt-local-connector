# Let a local Agent set up ARC

**English** | [简体中文](zh-CN/auto-setup.md)

On a fresh Mac with a signed-in local Agent, start with this instruction:

> Set up Agent Remote Control on this computer. Follow https://raw.githubusercontent.com/whzxc/agent-remote-control/main/skills/arc-setup/SKILL.md

The skill detects ARC, runs the release installer when needed, installs its setup
skill for your Agent, and continues through local mode or shared-relay setup. The macOS
installer checks the App tarball’s checksum, installs and opens ARC, and waits
for Core. No DMG mounting or command assembly is needed.

Remote verification uses `act({"op":"connector_verify","args":{"code":"<code>"}})`. Task acceptance starts with `guide`, then dispatches through `act` and waits/reads through `query`. If cached guide parameters reject op, use `query({"op":"guide","args":{"op":"codex_create"}})`. The MCP tools stay fixed at guide / query / act; connection levels apply to ops.

## Continue in the App

Click the homepage hub's left half and choose the product. Remote products share the public link: deploy it to your own Cloudflare account when missing, copy the MCP URL, then compare the pairing code and approve locally. Local clients show a setup command; run it and restart the client. See [Getting started](getting-started.md).

Your own Agent applies the CLI commands in [Connections](guides/connections.md) for custom addresses, dedicated tunnels, OpenAI Secure Tunnel, joining shared relays and relay hosting, using AX for external login when needed. The App displays the resulting connections read-only. You assist with login, passwords, 2FA, payment and policy-required approval.

## Limits

The shared-relay deployer only sees a computer list in ARC, but can technically
inspect relayed traffic in Cloudflare. Only join someone you trust. Your account
and workspace must permit the client connection. A grant proves authorization;
a real remote tool response proves connectivity. A local command does not replace
that evidence. Keep the computer awake and ARC running. Automatic follow-ups also
need a signed-in local Claude Code and the initiating cloud session.
