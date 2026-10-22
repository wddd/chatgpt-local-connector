# Claude + Codex: close the Loop

**English** | [简体中文](../zh-CN/guides/claude.md)

Let Claude inspect the project, agree on a plan with you, and delegate implementation to local Codex. ARC brings the result back to the initiating Claude Code cloud session, so Claude can review it and continue.

Call `guide` first for this connection’s workflow, enabled ops, and examples. Use `guide({"op":"codex_create"})` for the full schema. Invoke operations through `query({"op":"…","args":{…}})` or `act({"op":"…","args":{…}})`; reread `guide` when a result’s `arcVersion` changes.

## Prepare

- Install ARC and sign in to Codex Desktop on the execution computer.
- Install and sign in to Claude Code CLI on that computer. Its cloud messaging command delivers follow-ups.
- Use a Claude account/workspace that can add custom connectors.
- Open a Claude Code cloud session on claude.ai. Claude can read its own session ID from its environment, for example the `cse_…` value in `CLAUDE_CODE_REMOTE_SDK_URL`, and bind itself as the notification target.

If Claude cannot read its own ID, paste the cloud session URL or ID instead.

Claude on the web, mobile, and desktop can use the remote connector. Start with [Getting started](../getting-started.md) if ARC is not installed.

## Connect with a remote link

Enable a remote link in ARC by creating your relay or joining a trusted shared relay. Add Claude, copy the link, and paste it into **Settings → Connectors → Add custom connector** in Claude. Return to ARC, compare the four-character pairing codes, and approve. The browser returns automatically.

For use on this computer only, choose local mode to add Claude Code or Claude Desktop. See [Getting started](../getting-started.md) for instructions and shared-relay trust boundaries. Existing own-address configurations remain under **Settings → Remote link → Advanced**.

## Start with current facts

> Use ARC to inspect this project's files, Git state, and recent Codex tasks. Explain the current implementation, propose the smallest complete change, and agree on the acceptance criteria with me before dispatching work.

Give a project name or absolute directory. Then dispatch one concrete round:

> Ask Codex to implement the agreed change in this project and run its existing checks. Use a fresh requestId. Set notify to {channel: "claude-session", target: your own Claude Code cloud session ID or URL}. Keep the returned threadId and turnId. When notified, read the task and inspect its changes against our acceptance criteria.

Call `act` with op `codex_create`, place `project`, `prompt`, and `notify` in args, and supply requestId at the outer level. Retain the receipt and task IDs. Use `query codex_wait` for an immediate check; after a timeout, continue with the same IDs and the returned snapshotHash as expectedHash.

## Receive, review, continue

Check `notify_status({target})` after binding a new session. `unverified` means receipt has not been confirmed; `failed` means a delivery failed or a handshake expired. Subscription status and available tokens do not prove reachability.

Call `notify_control({action:"verify",target})`. ARC sends a one-time code to that session; after receiving it, Claude calls `notification_ack({target,code})` within five minutes. Only `verified` with available delivery allows ending the turn to wait for a notification. The local Claude Code login must be able to reach that cloud session.

If unverified, failed or unbound, use the receipt's wait arguments. If Claude can schedule a return to the same conversation, use `next.revisitAfterMinutes` from matching historical duration samples; no samples means no minute recommendation. Only short tasks use segmented waits within the turn. Each Claude wait is at most 170000 ms; after timeout follow `next`.

ARC sends a fixed status message when a bound turn completes, fails, is interrupted, or needs approval/input. The message identifies the project, task, and turn. Claude then reads the actual output through `query codex_read` / `query codex_items`, and the changes through `query codex_changes` or `query git`.

Ask Claude to compare the result with the acceptance criteria, explain any remaining issue, and use `act codex_send` for the next round. Include `notify` on each new round. An input added to the current round retains its binding when the field is omitted. Set it to `null` to unbind. A confirmed native Codex retry immediately after a failed/interrupted round can inherit the binding within ten minutes; explicit binding or unbinding takes precedence. ARC records that retry for review. New Desktop messages and retries with unknown provenance do not inherit.

Read `notification` in the task result for delivery status. A binding failure appears as `bind-failed` in the dispatch receipt. Check **Records** if delivery fails. ARC retries with backoff and attempts one system notification for breaker or sustained token-starvation episodes.

## A useful working agreement

Agree on scope, existing checks, and which actions need your decision. Let Claude read the repository before planning, give Codex one clear round at a time, and review the diff before continuing. Keep approvals and questions visible; answer them through the original task's interaction flow. You can follow the conversation from your phone while the computer remains available.

The notification health line reports counts, without deciding whether a task is looping. Inspect `query notify_status` for buckets, backlog, recent batches and thread ownership. If needed, use `codex_send` to ask the Agent to combine questions or decide within its existing authority. `act notify_control` can mute a thread, enable hourly digests, rebind/unbind it, or trip a target breaker; each control is reversible. See the [tool reference](../reference/tools.md#control-source-notifications).

## Limits

Automatic follow-ups require a Claude Code cloud session and the local CLI's cloud messaging support/login. An ordinary `claude.ai/chat/…` URL is not a target. ARC retains pending deliveries across restart and retries uncertain sends with the same eventId; ignore duplicate IDs. A needs-input event includes the question, options or approval details. Use the notification’s `respond` parameters directly with a result; refresh `codex_pending` only if the callback is missing or stale; asynchronous questions use `result: {answer: "your answer"}`. Follow `canRespond` and `next`; unsupported interactions require Desktop. A completion notification includes the last message verbatim and a full-text query when truncated. Read the diff when needed for review, and its cloud session must be able to continue. Keep ARC, its connection, and the computer running.
