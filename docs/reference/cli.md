# CLI reference

[Home](../../README.md) · [Automatic setup](../auto-setup.md)

## Executables

On macOS, use the bundled Core executable for local administration:

```sh
ARC_APP="/Applications/Agent Remote Control.app/Contents/Resources/bin/arc"
"$ARC_APP" cli help
"$ARC_APP" cli guide
```

ARC_APP is a shell convenience variable, not a runtime configuration field. Windows packages include `arc.exe` beside the desktop resources; use the installed executable path. Linux installs `arc` on PATH. The Desktop executable also accepts `cli <command>`.

Commands return a JSON envelope: `schemaVersion: 1`, `ok: true`, and `result`; errors use `ok: false` with code/message/usage. Read `result.markdown` for the guide. Stdin accepts a JSON object up to 16 KiB. `cli guide` embeds this reference. `cli help` is a compact command-group index with one-line descriptions. Full operation schemas and configuration fields are in `capabilities` / `schema`; command syntax and operational notes are in `guide`. Discover operation contracts before invoking them:

```sh
"$ARC_APP" cli capabilities
"$ARC_APP" cli schema app.status
```

Choose the operation name from capabilities; command names and catalog operation names are not interchangeable. `cli call <operation> --stdin` sends JSON input. `cli mcp` exposes the local management catalog over stdio, separate from remote execution tools.

## Local control and condition waits

`cli control <op> [--stdin]` acts as the built-in `local-cli` control source.
Stdin is the op's **args object**, not the MCP envelope. `requestId` can be
provided in that object where the op schema supports it. The existing
control dispatcher chooses guide/query/act, validates the same schemas and
returns the same projected result in the CLI `schemaVersion: 1` envelope.
Control errors retain the remote error object (including code and correction
hints) under `error`; they do not add a CLI usage field.

```sh
arc cli control guide
arc cli control guide codex_create
printf '%s' '{"prompt":"Do not call tools. Reply ARC_ACCEPTANCE_OK.","mode":"read-only"}' | arc cli control codex_create --stdin
printf '%s' '{"timeoutMs":1000}' | arc cli control inbox_wait --stdin
```

Dispatch defaults to `purpose:"self-test"` and `notify:null`. Explicit stdin
values override these defaults. Receipts, task records and live activity use
`origin.ingressId` / `origin.controlSource` = `local-cli`; the UI labels this
source Local CLI. It has no ingress configuration or listener. This command uses
the existing authenticated local Core channel; neither a network ingress nor
`cli mcp` can select it. The remote guide/query/act and notification schemas are
unchanged. `cli capabilities` lists CLI-only descriptors under `cliOnly`;
`cli schema control`, `cli schema wait` and `cli schema install-shim` describe
those commands separately from management operations.

```sh
arc cli wait --op status --until '/core/desktop/state=="ready"' --timeout 20
printf '%s' '{"threadId":"<thread-id>","turnId":"<turn-id>","until":"terminal"}' | arc cli wait --control --op codex_wait --stdin --until '/conditionMet==true' --timeout 60
printf '%s' '{"requestId":"<request-id>"}' | arc cli wait --control --op receipt --stdin --until '/threadId exists' --until '/turnId exists' --timeout 60
```

Conditions address the unwrapped operation result with RFC 6901 JSON Pointers
(`~0` escapes `~`, `~1` escapes `/`). Comparisons are `==`, `!=`, and the suffix
`exists`. Equality operands must be JSON literals: quote strings, leave booleans,
numbers and null unquoted. `exists` includes an explicit null; missing pointers
match neither equality nor inequality. Repeated `--until` conditions are AND.
Flags may appear in any order; repeat only `--until`. Timeout is 1–1800 seconds
(default 60). Management stdin uses the same shape as `cli call`, including
`body` where required; control stdin uses the op args directly.

Waits accept read-only operations, plus `receipt` with omitted action or
`action:"read"`. Native `codex_wait`, `agent_wait`, `inbox_wait` and `state.wait`
retain their existing wait mechanism, bounded by the remaining deadline. Other
reads fall back to 500 ms polling. Success returns `matched` (pointer/value
pairs), `elapsedMs` and `lastResult`. Timeout exits nonzero with `ok:false` and
`error:{code:"WAIT_TIMEOUT",message,elapsedMs,lastResult}`; lastResult is null
if the first read did not complete. Other read errors stop immediately. A wait
does not cancel the dispatched task or re-submit it. Terminal state still needs
to be inspected: failed/cancelled also satisfy native `until:"terminal"`.

## App snapshots and macOS shim

```sh
arc cli app snapshot --out ./output/acceptance/manual
printf '%s' '{"width":1280,"height":800,"panel":{"kind":"agent","id":"codex"}}' | arc cli app snapshot --out ./output/acceptance/agent --stdin
printf '%s' '{"panel":{"kind":"source","id":"<ingress-id>"}}' | arc cli app snapshot --stdin
arc cli schema app.snapshot
arc cli install-shim
```

Snapshot requires an App-owned desktop. It opens the main window, optionally
sets its logical width/height (320–3840 / 320–2160), and optionally opens a panel:
`{kind:"agent",id}`, `{kind:"source",id}`, or `{kind:"none"}`. Panel selection
navigates to the overview. Without `panel`, the current page and panel remain.
The CLI resolves `--out` relative to its working directory; the management
operation `app.snapshot` takes `{body:{out,width,height,panel}}` and requires
an absolute `out`. Without an output path, it creates a unique directory under
`<state>/acceptance/`.

The result includes `directory`, `viewModel` and `png`. `view-model.json` records
the current renderer's animated node/task positions, primitive geometry, SVG
paths (outer arcs and tentacles), task states/text, panel selection, viewport,
theme and language. The UI refreshes its stores and waits for geometry to settle;
`layoutSettled:false` indicates the bounded settling period expired. Capture is
sequential, so live activity can advance between model export and PNG capture.
On macOS `snapshot.png` comes from WKWebView `takeSnapshot`, without screen
recording permission and independently of SSH's TCC identity. Other desktop
platforms still export the model and return `png:{ok:false,code:"NOT_SUPPORTED"}`.
A failed PNG has its own error while preserving the model; inspect `png.ok`.
Headless Linux has no WebView and cannot export a rendered UI model.

`install-shim` is macOS-only and must run from the App-bundled executable. It
creates `~/.local/bin/arc` pointing to that App's `Contents/Resources/bin/arc`.
An identical link succeeds without changes; any other existing file/link fails
with `SHIM_EXISTS`. Uninstall removes the link only when this instance recorded
creating it and its target is unchanged. Add `~/.local/bin` to PATH in your shell
if needed.

## Resource diagnostics

`cli status` (catalog operation `status`) and `cli doctor` expose the same Core
resource observations used by the desktop Settings page. Sampling runs only when
status is read, with no additional monitoring task. It never starts app-server or
asks it to execute a shell. Doctor uses passive permissions and leaves Codex login
and command permission `unknown`; use the permissions page for active probes.

- `core.resources.nofile`: `soft`, `hard`, `state`, `source`, `observedAt`, `error`.
  Values are numbers, `"unlimited"`, or null when unknown/not applicable.
- `core.resources.startup`: `targetSoft` (8192), `original`, `actual`,
  `attemptedSoft`, `platformCeiling`, `state`, `reasons`, `observedAt`.
  macOS/Linux raise only the soft limit, within the hard and platform limits,
  read it back, and keep higher existing limits. Core continues when this fails;
  startup reports `degraded` and the reason. No system-wide limits are changed.
- `core.appServer`: `pid`, `startedAt` (Core's spawn timestamp), `state`
  (communication only), `observedAt`, and `resources`. These describe the shared
  background RPC instance, not temporary account readers or Codex Desktop.
- `core.appServer.resources`: `nofile`, `fd` (`count`, `sampledAt`, `attemptedAt`,
  `state`, `error`), `usageRatio`, `warningRatio` (0.9), and resource `state`.
  No process, exit during sampling, or a failed read leaves fd count null and
  state `unknown`, never a fabricated zero. PID/start time and inherited limits
  may remain as historical evidence after exit.

Limit sources are `self-measured` (Core getrlimit), `child-measured` (Linux prlimit),
`inherited-at-spawn` (Core's verified limit immediately before spawn), or
`unavailable`. Inherited limits are not proof that a child has not changed them.
Linux falls back to the inheritance record with `measurementError` if prlimit
fails. macOS uses inheritance for limits and enumerates fd records with libproc;
Linux counts `/proc/<pid>/fd`. Windows reports `not_applicable` with null values.

`diagnostics.checks.resources` contains the same snapshots. Resource states are
`ok`, `degraded`, `pressure`, `unknown`, or `not_applicable`, independently of
communication `ready`. `diagnostics.findings` uses `CORE_NOFILE_DEGRADED`,
`APP_SERVER_NOFILE_DEGRADED`, and `APP_SERVER_FD_PRESSURE` (fd count at least 90%
of the known soft limit), with source evidence and a read-only next action.
These observations do not establish a leak and do not trigger restarts or thread
unsubscriptions. Doctor exposes Core resources at `resources` and the same
app-server object at `appServer`.

## Uninstall

Run the installed binary's `cli uninstall` to stop ARC and move its App/Core,
current state directory (including managed dependencies), login registration,
platform caches, and Codex/Claude Code `arc-setup` skills to Trash. Use
`cli uninstall --purge` for permanent deletion. ARC resets macOS TCC permissions
before removing the App; failures appear in `warnings` and make the result
`incomplete`. This includes the historical `~/.local/bin/tunnel-client` only when
this instance's configuration or upgrade record identifies it; unrelated Agent
installations and histories remain intact. Remote tunnels, DNS, plugins and API
keys are not deleted by local uninstall.

Use the same `ARC_STATE_DIR` as the installation. Windows finishes after the CLI
exits and returns `state: scheduled` with `resultPath`; read that JSON receipt for
completion or errors. Linux uses the freedesktop Trash layout; a cross-filesystem
move that cannot be completed leaves the source and reports an error. The command
is local-only and is not exposed through MCP.

## Agent-driven setup

`cli setup` returns the next step for `claude-loop` (recommended) or
`chatgpt-chat`. Without a saved goal it returns `choose-goal`; submit the user's
choice with `cli setup apply choose-goal --stdin` and
`{"option":"claude-loop"}` or `{"option":"chatgpt-chat"}`. `setup next --goal`
previews a goal without persisting it. Apply decisions as `{"option":"<id>"}`;
auto actions use `{}`. `claude-code-ready` and `permissions` accept an explicit
`{"option":"skip"}`. Skipping Claude Code reports a notification limitation and
checks the completed task's `ARC_ONBOARDING_OK` reply instead.

The five step kinds are `auto`, `decide`, `authorize`, `secret`, and `remote-ui`.
The response includes `goal`, `progress`, `complete`, `steps` (the full selected
sequence as `{id,title,kind,done}`), and `step` with localized
`title`, `explain`, option labels, `apply`, `openUrl`, `doneWhen`, and `playbook`.
Goal explanations share the App’s selected-goal copy. User-facing titles,
explanations, and completion descriptions contain no internal field names or commands;
use the structured fields and playbooks for execution details.
`next`, `apply`, and `wait` accept `--locale zh-CN|en` (catalog: `body.locale`)
to localize this response without changing saved preferences. If omitted,
App language preferences apply; Auto uses the locale resolved by the App, or
terminal locale when no App locale has been saved. `onboarding` supplies the
selected ingress URL and current verification prompt. `cliPath` and `stateDir`
identify the current instance for copied prompts; `hasState` reports whether
`setup.json` exists; `dispatch` contains a saved requestId, threadId and desktopUrl
when setup has been sent to Codex. `nextAction.command` is executable in a POSIX
shell (PowerShell on Windows), includes this instance's CLI and state directory,
and supplies JSON stdin for automatic actions. Findings carry their own executable
next actions. Decisions still require the user's choice; their next action reads
the matching playbook.

`setup wait` defaults to 60 seconds (0–3600 accepted); timeout returns the
current step successfully. `setup reset` clears only setup choices, its start
time and dispatch reference, leaving ingresses intact. Repeated apply reuses an existing matching
ingress. Fixed-address choice and ChatGPT prerequisite confirmation prepare an
unstarted ingress before credential entry. Fixed addresses add `choose-provider`: `cloudflare` (recommended) or
`other-provider`. Cloudflare uses `cloudflare-login` (apply `{}` to start
authorization) and `cloudflare-tunnel` (apply `{}` to reuse/create a locally
managed tunnel and route DNS). Login state is derived from the origin certificate
in `<stateDir>/cloudflare/.cloudflared/cert.pem`; the child process has an isolated
home directory. Other providers retain the connection form.
`setup apply tunnel-credentials --stdin` accepts the non-secret
`{"tunnelId":"..."}`. Both `address-secret` and `tunnel-credentials` also accept
`{"source":"clipboard"}`. Core reads the system clipboard, extracts a
credential from plain text, common provider commands or JSON, and saves it through
ingress update, then clears the clipboard only after saving succeeds. The result contains only the relevant `hasXxx` flag; call next
again afterward. An empty clipboard with an already-saved credential is a no-op.
Extraction or save failures preserve the clipboard and return the original error without echoing its content. Agents click official
Copy controls but never inspect secrets or read the clipboard. The ARC form
opened by `openUrl` remains a fallback. Linux requires wl-clipboard or xclip and
an active desktop clipboard.

`claude-code-ready` with `{}` returns installation guidance when the CLI is
missing, or opens an interactive sign-in terminal when installed but signed out.
Its step carries `installCommand` only when missing. Login remains user-driven.

`setup playbook protocol` returns bundled protocol Markdown in `result.markdown`;
UI step IDs return their matching playbook; auto/decide-only IDs return the protocol.
The Markdown is read from the same resources installed with the skill. The local catalog exposes
`setup.next`, `setup.apply`, `setup.wait`, and `setup.dispatch`, also accessible through `cli mcp`.
Catalog inputs follow the usual `body` wrapper; apply takes
`{"body":{"stepId":"choose-goal","input":{"option":"claude-loop"}}}`.

Ingress `verification` includes `firstOAuthRequestAt` (accepted remote
DCR/authorize), `firstMcpRequestAt` (authenticated MCP dispatch), and `lastProbe`
(`observedAt`, `url`, `passed`). These are observations, not challenge verification;
setup requires a challenge newer than its saved start time and a completed task
from the selected ingress. Claude completion additionally requires delivered
notification evidence unless Claude Code was skipped.

`cli call setup.dispatch --stdin` accepts `{"body":{"goal":"claude-loop"}}`
(or `chatgpt-chat`). It saves the goal, installs the Codex skill, creates
`setup-workspace/` under the state directory, and submits the localized setup
prompt through the existing Codex task path. Explicit dispatch approves this task;
model, reasoning effort and execution ownership use existing defaults. It returns
`requestId`, `threadId` and `desktopUrl`, saved in setup.json. Repeated dispatch
reuses its durable receipt; unconfirmed or failed creation reports an error and
retains the requestId. Prompts specify ARC_STATE_DIR to keep the same instance.

`cli skill install --target codex|claude-code` installs the bundled `arc-setup`
skill to `~/.codex/skills/arc-setup/` or `~/.claude/skills/arc-setup/`, replacing
that skill directory with the current version. This command and playbook reads
work offline without starting Core. macOS loads Resources/skills/arc-setup;
Windows loads skills/arc-setup under the installation directory; Linux loads
skills/arc-setup beside arc. Debug builds fall back to the repository sources.

Permissions require Full Disk Access and applicable command Full Disk Access.
Accessibility, screen recording, and notifications are optional. Claude delivery
records expose `taskState` (raw task state, e.g. `completed`) independently of the
localized `state` display label and delivery `status`.

The local setup agent prepares and sends the loop-test prompt through ARC from
a Claude Code cloud session or ChatGPT conversation, using the available UI
tools. If no usable UI is available, the user sends it there. Completion is
observed with `setup wait`, not inferred from screenshots or local task creation.

### ChatGPT setup recovery

ChatGPT setup assumes access and starts at Tunnel configuration; it does not
inspect local Codex/ChatGPT credentials to probe permissions. Report an observed
block with `setup apply chatgpt-fallback --stdin` and
`{"reason":"platform-denied"}`, `{"reason":"chatgpt-denied"}`, or
`{"reason":"runtime-key-rejected"}`. The returned decide offers
`{"option":"https-oauth"}` or `{"option":"retry"}`. HTTPS keeps the ChatGPT goal
and reuses address/provider selection, Cloudflare login, public probing and OAuth.
It does not bypass ChatGPT workspace policy. `next.fallback` describes the
alternative while on the Tunnel path; reports and choices live in `setup.json`.

OpenAI ingress summaries include `controlPlane.state` (`unknown`, `authenticated`,
`rejected`) and `httpStatus` when observed, or null before observation. Readiness
requires a successful control-plane poll as well as the local startup check.
401/403 produces `RUNTIME_KEY_REJECTED` and returns setup to `tunnel-credentials`.
Clipboard apply checks the credential's minimum shape before saving: OpenAI
`sk-` and 32+ characters, Cloudflare `eyJ` and 64+, ngrok/LocalXpose 20+, Pinggy
16+. A failed extraction/save preserves the clipboard; success returns flags
only and clears it. Empty clipboard retries do not accept a known rejected key.

## Command groups

| Group | Commands after `cli` |
| --- | --- |
| Discover | help, guide, capabilities, schema `<operation>` |
| Invoke | call `<operation>` [--stdin], mcp |
| App | app start/status/quit/restart |
| Setup | setup [next] [--goal `<goal>`] [--locale zh-CN\|en], setup apply `<stepId>` --stdin [--locale zh-CN\|en], setup wait [--timeout `<sec>`] [--locale zh-CN\|en], setup playbook `<id>`, setup reset |
| Skill | skill install --target codex\|claude-code |
| Diagnose | status, doctor, onboarding, context --stdin, watch |
| Logs | logs, logs --stdin, logs --follow, logs --offline |
| Ingress | ingress list/presets, add --stdin, update `<id>` --stdin, remove/start/stop/restart/probe/doctor `<id>`, start-all, stop-all |
| Verification | ingress verify `<id>` [--fresh], verify [--fresh] |
| OAuth | ingress oauth list `<id>`, request `<id> <request-id>`, decision/register/revoke `<id>` --stdin |
| Bearer | ingress token rotate `<id>` |
| Settings | configure --stdin, network --stdin, connect, disconnect |
| Quota | subscriptions get/set --stdin/refresh [providerId]/open [providerId] |
| Storage | storage compact |

help, guide, capabilities, schema, ingress presets, and logs --offline do not need Core running. Other commands use the target instance's Core/Desktop. app start can launch an installed app. Prefer ingress commands for multi-connection administration; configure/network/connect/disconnect address the primary connection projection.

## Configure an ingress

```sh
printf '%s\n' '{"name":"Claude","controlSource":"claude","transport":"https","auth":"oauth","enabled":true,"config":{"httpsProvider":"cloudflare","cloudflareMode":"quick"}}' | "$ARC_APP" cli ingress add --stdin
"$ARC_APP" cli ingress list
"$ARC_APP" cli ingress start <returned-id>
"$ARC_APP" cli onboarding
```

add accepts optional id and name. id is immutable; update takes it as a command argument, not in stdin. Updates partially merge settings and restart only that running ingress. Fields include controlSource, transport (`openai-tunnel` / `https`), auth (`openai` / `none` / `bearer` / `oauth`), enabled, toolPolicy (`all` or `{allowlist:[…]}`), and config.

config fields include httpsProvider, cloudflareMode, cloudflareAuth (token by default, or login), cloudflareTunnelId, httpsUrl, httpsHost, httpsPort, cloudflareToken, ngrokAuthtoken, pinggyMode, pinggyToken, localxposeMode, localxposeAccessToken, localxposeRegion, tunnelId, apiKey, and tunnelBinary. Use `cli help` for current modes and requirements. A Bearer token is at least 32 printable ASCII characters. Secret input uses stdin or a protected file; status/list do not reveal it.

For OpenAI Tunnel, use controlSource chatgpt, transport openai-tunnel, auth openai, and config.tunnelId/apiKey. Register the identity through the official OpenAI flow. For HTTPS, choose a client-supported auth method and [provider](../guides/connections.md).

## Verify from the client

Read `cli onboarding` for the ingress's stage, URL/Tunnel ID, verificationPrompt, and executionPrompt. Ask the actual client to call `act({"op":"connector_verify","args":{"code":"<displayed code>"}})`. Then dispatch a harmless task and read its final result. `--fresh` creates a new verification challenge; retain it for that client round.

For OAuth, read the pending request before deciding. [OAuth](oauth.md#local-management) specifies the request/decision fields. Token rotation prints the new Bearer secret once; redirect it to a private file with `umask 077` rather than collecting it in chat logs.

## Subscription settings

Read subscriptions get first. subscriptions set replaces enabled and refreshMinutes (1/3/5/10; defaults to 3). Providers participate automatically with their Agent; home rings use weekly quota windows. refresh starts an online refresh; inspect observedAt/state/error for its result. open activates Agent details.


## State and environment

| Platform / purpose | Location or variable |
| --- | --- |
| macOS state | `~/.local/state/agent-remote-control` |
| Windows state | `%LOCALAPPDATA%/agent-remote-control` |
| Linux state | `${XDG_STATE_HOME:-$HOME/.local/state}/agent-remote-control` |
| Linux environment file | `${XDG_CONFIG_HOME:-$HOME/.config}/agent-remote-control/environment` |
| Explicit instance | ARC_STATE_DIR; Desktop also accepts `--state-dir <path>` |
| Desktop development (`npm run dev`) | `agent-remote-control-dev` under the platform state base; passed to its Vite child |
| Standalone Dev Web (`npm run dev:ui`) | Installed app state directory; connects to its existing Core and shares its data |
| Isolated preview | Set ARC_STATE_DIR to `agent-remote-control-preview` under that base |
| Build version | ARC_BUILD_VERSION; otherwise nearest reachable v-tag, then 0.0.0 |
| Linux installer | ARC_VERSION (v-prefixed tag), ARC_INSTALL_DIR |

ARC_NATIVE_PORT, ARC_NATIVE_TOKEN, and ARC_INGRESS_ID are private forwarding-process inputs. ARC_DEV_SUPERVISED is owned by the desktop development runner; ARC_FIXTURE_* belongs to test fixtures. Upstream variables such as CODEX_HOME retain their own meaning. See [Development](../dev/development.md) for builds and [Linux](linux.md) for daemon commands.

## Limits

Manage only the selected instance. An app restart/quit can stop the CLI's own host; reconnect before readback. Do not expose the authenticated local management API through a public tunnel. A successful settings write or local listener start still needs verification from the intended remote client.

## Permissions and readiness

`cli doctor` includes passive `permissions.items` with stable IDs, state, owning process and observation time. The existing `overview` tool uses the permission page's active report, including Codex login and command probes. Detection never requests consent. Use ARC Permissions & readiness locally to request access and open System Settings. FDA is heuristic (granted / missing / unknown); Codex command execution is probed separately from Core. No additional MCP tool is required.

For the bundled Desktop launch chain, grant Full Disk Access to ARC App: Core and its Codex app-server children inherit that responsible application. A standalone Core launched by a terminal can instead inherit that terminal's identity; its probe does not prove the App is ready.

### Tunnel dependency and error diagnostics

Before starting an OpenAI Tunnel ingress, ARC checks the selected Tunnel Client
against minimum version `0.0.16`. Missing/older clients are installed into the
state directory. ARC first reuses a managed cache containing both executables at
a qualifying version. If none qualifies, it downloads the supported `v0.0.16`
release directly from the official repository and verifies its SHA256SUMS.txt.
Startup does not call the anonymous GitHub releases API. A running
ingress is stopped only when an upgrade is needed and restarted by the same start
operation. External executables are not overwritten; the ingress switches to the
managed executable. An unrecognized version blocks startup with
`TUNNEL_VERSION_UNKNOWN`; an unsuccessful install reports `TUNNEL_UPGRADE_FAILED`.
`ingress doctor` and `setup next` include the reason, observed/minimum versions,
redacted client error summary and executable next action. To explicitly reinstall
for a selected ingress, call `ingress.dependencies.install` with
`{"id":"<ingress-id>","body":{"component":"tunnel"}}` on stdin; the original
`dependencies.install` operation targets the primary ingress. Both manage the
necessary stop/start themselves.

A tunnel must be associated with the intended ChatGPT workspace in Platform.
ARC does not query a separate workspace-association API: control-plane
polling proves runtime authentication, and the first authenticated remote MCP
request remains the ChatGPT enablement signal. Follow `tunnel-credentials` and
`enable-in-chatgpt` to associate the workspace. The setup protocol requests one
scope confirmation after goal selection, and replaces/revokes only identified
ARC-created keys after replacement authentication succeeds.

## Local control sources

`cli call local-access.status` reports Claude client availability and installed configuration.
Use `cli call local-access.install --stdin` with `{"body":{"target":"code"}}` or
`{"body":{"target":"desktop"}}`. Claude Code is added in user scope with `claude mcp add`;
Claude Desktop receives a dedicated entry in its official configuration file and requires a restart.
Other servers are preserved; a conflicting same-name entry is rejected.

The installed command is `arc cli local-mcp <ingressId>` with the instance's `ARC_STATE_DIR`.
It leases the local Core and forwards the existing `guide`, `query`, `act` and `notification`
contracts through authenticated loopback IPC. A local ingress has `transport: "local"`,
`auth: "none"`; it exposes no public listener. Its enabled state and tool policy still apply.
