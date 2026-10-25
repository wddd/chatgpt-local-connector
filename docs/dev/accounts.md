# Accounts

[UI conventions](ui.md) · [Coding lanes](worktrees.md) · [Architecture](architecture.md) · [Tools](../reference/tools.md)

Status: design approved 2026-10-25 from an interactive prototype. This page is the shared contract for the parallel lanes `accounts-core`, `accounts-ui` and `topology-accounts`. Only the control source changes it.

## Model

ARC manages control sources and Agents by Platform → Account → Task.

- Platform: a control-source product (Claude, ChatGPT, ...) or an Agent (claude, codex, dsh, ...). Unchanged.
- Account: one provider identity, independent of side.
  - `id` (stable ARC ID), `provider` (`anthropic`, `openai`, `deepseek`, `other`), `identityKey` (provider account ID when known, else a hash of normalized email + organization), `alias` (user-editable; defaults to the organization name or `Personal`), optional `email`, `orgName`, `plan`, plus `createdAt` and `observedAt`.
  - `sources`: control-source IDs authorized as this account. Several connections or devices of one account are several sources sharing one `accountId`; they never add account nodes.
  - `agentProfiles`: list of `{ agent, profileId, kind, state, default }` with kind `cli-profile`, `codex-home` or `api-key` and state `signed-in`, `signed-out`, `unfinished` or `invalid`. The isolated Claude CLI profiles in `native/src/claude_accounts` become `claude` profiles. Codex's current login is one `codex-home` profile. Key-based Agents expose one `api-key` profile.
  - `notifications`: Claude routes and bound cloud sessions move under the account. ChatGPT accounts report MCP Events reachability. Agent-only accounts report `n/a`.
  - `quota`: subscription windows belong to the account. An account with both sources and agent profiles shows one shared quota.
- Same identity: an account with both `sources` and `agentProfiles`. This includes a ChatGPT account and the Codex login of the same ChatGPT identity.
- Default account: at most one default profile per Agent; dispatch without an explicit account uses it.

Identity resolution: ARC derives a source's account from facts captured at authorization (OAuth grant, email, organization, provider IDs). A source without resolvable facts gets its own `Unidentified` account until reauthorization; never infer identity from client self-reported names. Agent profiles resolve from the CLI's own auth status.

Migration: existing Claude accounts become accounts with `claude` profiles and their routes. Sources and profiles with the same `identityKey` merge into one account. Records keep their source IDs; history is never rewritten.

Lifecycle: removing an account with running tasks lets them finish (or the user cancels them) and keeps a tombstone so history reads `Removed account · <alias>`. Signing out one profile keeps the account and its sources.

## AX operations

Every UI action has an op; no account operation is UX-only. Ops join the frozen `guide`/`query`/`act` tools through the catalog and `docs/reference/tools.md`.

Queries:

- `whoami`: the calling control source's account (`id`, `alias`, `provider`, `email`, `orgName`, `plan`), its `sourceId` and platform, linked agent profiles and notification reachability. ARC resolves it from the connection's authorization; the source's platform, device or environment is not ARC's concern.
- `accounts({ id?, agent? })`: accounts with sources, agent profiles, health, default flags and quota summaries. The list omits `email` and `orgName`; `id` returns full detail. Privacy mode never changes AX results.
- `dispatch_policy` reports per-account quota and health for each Agent.

Actions:

- `account_update({ id, alias?, defaultFor? })`: rename; `defaultFor` names an Agent whose default becomes this account's profile.
- `account_add({ kind, browserId? })` with kind `claude`, `codex`, `api-key` or `detect`: starts a login and returns `{ loginId, state, loginUrl? }`. Agents run the whole flow; only the sign-in itself needs the user.
- `account_login({ loginId, action, code? })` with action `code` or `cancel`.
- `account_reauth({ id, agent })` restarts login for one profile.
- `account_remove({ id, running })` with running `finish` or `cancel`.
- `codex_create`, `codex_send`, `agent_create` and `agent_send` accept optional `account` (account ID or alias). Omitted means the Agent's default. Receipts, tasks and activity record `agentAccountId`; origins record `origin.accountId` beside `origin.sourceId`.

The management API mirrors these ops for the UI under `accounts/*` and replaces `claude-accounts/*`. Notification send/test stays under the account.

## UI

### Entry

The bottom-left capsule becomes horizontal: Tasks, Records, Remote link, Accounts, Permissions & readiness, Settings. Accounts is a first-level workspace. Claude accounts leave Settings.

### Accounts workspace

- Title bar: Accounts, count line, Privacy toggle, primary Add account, close.
- Left list (about 330px) grouped by provider. Rows: avatar initial in the account color, alias, email (blurred in privacy mode), role chips SRC / AGENT, and a warning dot when notifications or a profile need attention.
- Detail: header with inline-editable alias, `email · org`, plan pill.
- Where this account works: two cards. Control source lists connections with state dots and last seen, plus Open source panel. Agent shows profile state and kind, a Default for new dispatches switch and Sign in again. An empty side says so and offers to add that role.
- Same identity notice: dispatching to this Agent draws from the same subscription quota.
- Notifications card: state pill (Verified, Not bound, MCP Events, n/a), bound sessions with last delivery, Send test, and a secondary Bind manually. Sessions bind themselves through `notify_control`; nobody pastes IDs in the normal path.
- Quota card: shared windows with bars and reset times.
- Bottom: Remove with its consequence (running tasks finish first; history keeps the tombstone).

### Add account

Centered dialog, no scrim, three steps: Account type (Claude, ChatGPT / Codex, API key, Detect on this computer) → Sign in (waiting state, browser choice as pills inside this step, Copy login link, Paste a code instead, one line noting that `account_add` lets Agents run the flow) → Confirm (detected identity, alias field, an identity-match notice when it matches an existing source, Use this account for checkboxes).

### Privacy mode

One persisted preference, toggled from the Accounts title bar and the source panel header. It blurs emails, organizations, identity keys, session names and connection addresses everywhere they render. `cli app snapshot` and UI scenario screenshots default to privacy on. The topology shows aliases only, so it needs no blurring.

### Control source panel

One side panel replaces the source panel layer one plus the Remote link source detail. Remote link keeps the source and connection lists; opening a source opens this panel.

- Header: product icon with a small account-initial badge, `Platform · Alias`, `email · org`, connection enable switch, privacy toggle, close. Chips: state, connection, notification state.
- Tabs: Activity (needs you / running / today counts, recent dispatches with pending rows first), Account (identity card, `whoami` line, link to the same-identity Agent with quota, notification binding with Copy bind prompt and Bind manually), Connection (connection card with Change, address copy, authorized / last seen / client reports / tools facts, collapsed Advanced with product correction, Disconnect at the bottom).

### Topology

- Modes: Tree (default) and Flat, a persisted preference with a top-right segmented control. Switching never reorders nodes.
- Tree: L1 is the platform. A platform with more than one account grows L2 account nodes (about 36px, white fill, platform-color ring, alias label). Agent tasks attach to their account node (L3). A single-account platform has no L2; tasks attach to the platform.
- Flat: L1 is `Platform · Alias` (platform name alone for single-account platforms); same-platform nodes stay adjacent.
- Same identity: account labels carry a small link icon; hovering one also lights its counterpart on the other side.
- Collapse: a hover-only 20px filled circle in the side's theme color (control sources orange, Agents blue-purple) with a white minus or plus, placed between the node and its outer arc, nearer the node. It collapses or expands the node's whole outer arc and children. Hovering the toggle keeps the node's path lit. Keyboard focus counts as hover.
- Auto rules: L2 expands when a platform has more than one account; L3 expands when an account has tasks; manual choices persist and win. A collapsed node shows a badge with the hidden task count, in warning color when any is pending. Pending work is never hidden without that badge.
- Path highlight: hovering a task or node lights the union of its paths (source account → source platform → hub → agent platform → agent account → task). Everything else dims (lines about 0.18, nodes 0.32, bubbles 0.35). Lit nodes scale slightly with a soft ring; lit bubbles shift about 6px outward with a stronger shadow. When the target is collapsed, the nearest visible ancestor lights.
- Geometry stays in `ui/topology/solve.ts` and the existing animator; no per-frame React renders.

## Fixtures

Fixtures, scenarios and docs use invented identities on `example.com` and placeholder organizations. No real emails, organization names or session IDs.

## Lanes

- `accounts-core`: native model, identity resolution, migration, ops, management API, dispatch `account` parameter, task and activity attribution, reference docs.
- `accounts-ui`: capsule, Accounts workspace, Add account, privacy mode, control source panel. Builds against this contract with `?scenario=accounts` and `?scenario=source-panel` mocks until core lands.
- `topology-accounts`: modes, L2/L3, collapse, path highlight. Builds against this contract with a `?scenario=topology-accounts` mock until core lands.

Shared files such as `ui/types.ts` and locale JSON are expected to conflict lightly; resolve on landing.
