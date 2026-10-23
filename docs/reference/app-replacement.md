# Local macOS app replacement

MUST means a requirement. SHOULD means the default. MAY means an option.

Use `arc cli app replace /absolute/path/Agent\ Remote\ Control.app` to install a local build while ARC owns the calling task. The operation is local administration. It does not add or change control-source MCP tools or events. Windows and Linux return `NOT_SUPPORTED`.

## Install

Validate without changing the installation or starting a helper:

```sh
NEW_APP="/absolute/path/Agent Remote Control.app"
"$NEW_APP/Contents/Resources/bin/arc" cli app replace "$NEW_APP" --check
```

Start replacement as the final command of the task:

```sh
"$NEW_APP/Contents/Resources/bin/arc" cli app replace "$NEW_APP"
```

The candidate CLI supports the first upgrade from an installed version without `app replace`. It discovers the running Desktop through authenticated local management instead of treating its own bundle as the installed target. Set `ARC_STATE_DIR` when using a nondefault instance. The target is always the bundle of that instance's running Desktop. Source and target MUST be separate bundles.

The caller MUST save the returned `id`, `statusPath`, and `logPath`.
The calling turn MUST end after receiving the receipt.
The turn MUST NOT continue work depending on ARC or poll for replacement completion.
The control source SHOULD pause new dispatches until replacement reaches a terminal state.
The source bundle MAY be removed after the receipt because staging is complete.
Keep the candidate CLI available if rollback could restore an older version without the replacement status command.

After reconnecting, query from a new turn or independent terminal:

```sh
arc cli app replace --status
arc cli app status
arc cli status
```

`app replace --status` reads local durable state even if Core cannot start. An acceptance receipt means the worker is ready, not that installation succeeded. `succeeded` requires matching Desktop and Core build hashes from authenticated health readback. `rolled-back` means the original bundle was restored and its health verified. `cancelled` means the new bundle was not installed. `failed` includes recovery errors; inspect the recorded backup and log before another attempt. Connection recovery and provider acceptance are separate checks.

After rollback to an older version, use `"$NEW_APP/Contents/Resources/bin/arc" cli app replace --status`.

## Local management contract

| Operation | HTTP route | Arguments |
| --- | --- | --- |
| `app.replace` | `POST /api/app/replace` | `{"body":{"path":"/absolute/candidate.app","check":false}}` |
| `app.replace.status` | `GET /api/app/replace/status` | `{}` |
| `app.replace.ack` | `POST /api/app/replace/ack` | `{"body":{"id":"receipt UUID"}}` |

HTTP sends the contents of `body`, as with other local operations. CLI `call` and local management MCP use the complete argument object. CLI and local management MCP acknowledge only after flushing the response. A raw HTTP caller MUST read the replacement receipt before sending `app.replace.ack`. No acknowledgment within 60 seconds cancels without shutdown. A disconnected caller MUST read status before retrying. Unacknowledged and active jobs prevent duplicate replacements.

While waiting, `waiting` contains `blockingTurns` with `agent`, `taskId` (the Codex thread ID for Codex), `turnId`, `executionOwner`, and `reason`, plus `activeWrites`, `pendingInteractions`, `unknownActivity`, `ownershipError`, `observedAt`, and `idle`. `executionOwner` is `connector` or `unknown` for blockers. Unknown ownership reports `reason: "ownership-unknown"` and prevents shutdown. Missing activity reports `activity-unavailable` or `unknownActivity: true`. Unobserved turn IDs and Core counts are `null`; unknown Core counts also prevent shutdown. `cli app replace --status` returns this persisted snapshot without acknowledgment or other writes, including the last observation after a busy cancellation.

The receipt includes `replacementReceipt`, `id`, `state`, source/target/staged/backup paths, expected package hashes, original process IDs, timestamps, `statusPath`, `logPath`, and an actionable `next`. Errors add `error`. State progresses through `awaiting-receipt`, `waiting-for-turns`, `stopping`, `installing`, `starting`, and `succeeded`, or to `rolling-back` and a terminal failure/recovery result. Records live under `ARC_STATE_DIR/app-replacements`.

## Worker and validation

ARC submits a one-shot `RunAtLoad` job using `launchctl bootstrap gui/<uid>`. The worker is a copied native Core executable outside both app bundles. A launchd-owned supervisor starts it with `setsid` before exec, giving the worker a separate POSIX session and process group. launchd jobs alone can share session 1; the supervisor closes that remaining lifecycle boundary. Its input and logs are independent of ARC, Codex, the command executor, and MCP clients. This avoids the process-tree cleanup that defeats `nohup`, subshells, and background forks. The plist lives in the job directory, not `~/Library/LaunchAgents`; it is not a login item. The worker writes its terminal result before booting out its supervisor job. See [Apple's launchd lifecycle documentation](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html).

Before executing candidate code, ARC verifies the bundle ID and signatures. Production bundles require the pinned local self-signed certificate used by `check:package`; ad-hoc production signatures are rejected. Dev bundles require valid signatures and the same Dev bundle ID. The candidate Core verifies its own version, Desktop/Core version agreement, packaged skill bytes against its compiled sources, native icon appearances and ICNS, absence of Node/npm runtime resources, and signatures of the bundle, Core, and screen helper. Links and special files are rejected. The package is ditto-copied to a unique sibling staging bundle and validated again before the receipt. The installed copy is validated again before launch. These are the native equivalents of `npm run check:package`; local Xcode tools including `assetutil` are required.

After acknowledgment, the worker allows ten seconds for the enclosing command receipt to reach the turn. It then waits for three consecutive quiet samples, for up to five minutes. Only work ARC would interrupt blocks the turn drain: Codex turns with `executionOwner: "connector"` and live non-Codex `arc-task` processes. Codex `executionOwner: "desktop"` and external `transcript` sessions do not block. Ownership comes from the existing task records used by the task UI and the activity source that distinguishes owned processes from transcript observations; titles and `origin` are not ownership evidence. Unknown ownership blocks and is identified in `waiting.blockingTurns`. Core active writes and pending interactions must still be zero. Missing observations fail closed. The helper reads the existing `tasks` and `agents/activity` operations, so it can classify work on the older installed Core before upgrading it. Live activity supplies the current turn ID; older Core responses use the newest matching task receipt when available. The new Core refuses new task dispatches and pauses durable queued sends while replacement is pending. A first upgrade from an older Core cannot enforce that admission gate; the control source MUST keep dispatch paused during that handoff.

The worker requests `app quit`, waits for the captured Desktop and Core PIDs to exit, and acquires the Core lifecycle lock before changing files. Long-lived `arc stdio` and `cli mcp` forwarding processes are not owners and do not block replacement. `cli local-mcp` holds a Core lease; close that leased client first or replacement will cancel when Core cannot exit. It moves the installed bundle to `<app>.backup-<UTC timestamp>-<id>`, ditto-copies the staged bundle, validates it, releases the lock, and relaunches through LaunchServices with the same state directory. It verifies the new Desktop and Core hashes rather than accepting an open port or a successful `open` command as health.

On installation or startup failure, the worker stops the failed build, waits for process exit, retains it as `<app>.failed-<id>`, restores the backup, and verifies the old build after relaunch. If graceful termination fails, it preserves the backup and reports recovery failure instead of overwriting live code. Backups and failed bundles are retained for explicit cleanup. User state is never deleted or restored over newer state; package rollback cannot undo a state migration performed by the new build.

## Limits

ARC-owned Codex app-server processes use parent-owned stdin/stdout RPC pipes, pending callbacks, and backend session identity. Keeping the child alive alone would not reconnect those channels. Core therefore retains its existing child shutdown behavior. Replacement lets the current turn finish before shutdown; it does not migrate a running turn. Following restart, continue an existing conversation with a new turn when needed. Codex Desktop owns its own process lifecycle.

Receipt flush proves delivery to the caller's transport, not that a human read it. The additional task drain prevents the dispatching turn from being killed during ordinary completion. Busy or unobservable tasks cancel installation instead of being forcibly interrupted.

The user must have a logged-in macOS GUI launchd domain and permission to write beside the installed app. The helper does not request elevation. Logout, reboot, forced worker termination, disk failure, and incompatible user-state migrations are not transactional recovery guarantees. A nonterminal status after such an interruption requires checking its log, job, and backup before manual recovery. Do not run another installer or manually relaunch ARC during the handoff.
