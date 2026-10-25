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
"$NEW_APP/Contents/Resources/bin/arc" cli app replace "$NEW_APP" --now
```

The candidate CLI supports the first upgrade from an installed version without `app replace`. It discovers the running Desktop through authenticated local management instead of treating its own bundle as the installed target. Set `ARC_STATE_DIR` when using a nondefault instance. The target is always the bundle of that instance's running Desktop. Source and target MUST be separate bundles. For an isolated acceptance instance, use its reported state directory and a separate candidate copy with the exact same acceptance bundle ID. The selected state must retain its matching `acceptance-instance.json` marker. `--check` validates that pair without launching a worker or creating a backup; it cannot target the installed production or ordinary Dev identity through isolated state.

Use `--now` for an explicit user request to build and replace the local installation immediately. It skips task-idle checks and the scheduled countdown; active ARC-owned tasks may be interrupted. Receipt acknowledgment, package validation, owner identity, process exit and rollback remain required. Without `--now`, the helper waits for idle work, validates the prepared packages, then announces a ten-second restart countdown. `--check`, `--now` and `--stdin` may be combined in any order. JSON callers set `immediate:true`.

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

`app replace --status` reads local durable state even if Core cannot start. An acceptance receipt means the worker is ready, not that installation succeeded. `succeeded` requires matching Desktop and Core build hashes from authenticated health readback. `rolled-back` means the original bundle was restored and its health verified. `cancelled` means the new bundle was not installed. `failed` includes recovery errors; inspect the recorded backup and log before another attempt. Connection recovery and provider acceptance are separate checks. Terminal receipts replace the handoff instruction in `next` with the outcome and recovery action. Desktop shows cancellation, failure, or rollback after reconnecting, retains the reason in Settings, and offers a validated retry from the original candidate. A missing candidate is reported as a retry error. A cancelled receipt whose intended Desktop build is already installed does not show an obsolete failure alert.

After rollback to an older version, use `"$NEW_APP/Contents/Resources/bin/arc" cli app replace --status`.

## Local management contract

| Operation | HTTP route | Arguments |
| --- | --- | --- |
| `app.replace` | `POST /api/app/replace` | `{"body":{"path":"/absolute/candidate.app","check":false,"immediate":false}}` |
| `app.replace.status` | `GET /api/app/replace/status` | `{}` |
| `app.replace.ack` | `POST /api/app/replace/ack` | `{"body":{"id":"receipt UUID"}}` |

HTTP sends the contents of `body`, as with other local operations. CLI `call` and local management MCP use the complete argument object. CLI and local management MCP acknowledge only after flushing the response. A raw HTTP caller MUST read the replacement receipt before sending `app.replace.ack`. No acknowledgment within 60 seconds cancels without shutdown. A disconnected caller MUST read status before retrying. Unacknowledged and active jobs prevent duplicate replacements.

While waiting, `waiting` contains `blockingTurns` with `agent`, `taskId` (the Codex thread ID for Codex), `turnId`, `executionOwner`, and `reason`, plus `activeWrites`, `pendingInteractions`, `unknownActivity`, `ownershipError`, `observedAt`, and `idle`. `executionOwner` is `connector` or `unknown` for blockers. Unknown ownership reports `reason: "ownership-unknown"` and prevents shutdown. Missing activity reports `activity-unavailable` or `unknownActivity: true`. Unobserved turn IDs and Core counts are `null`; unknown Core counts also prevent shutdown. `cli app replace --status` returns this persisted snapshot without acknowledgment or other writes, including the last observation after a busy cancellation.

The receipt includes `replacementReceipt`, `id`, `state`, source/target/staged/backup paths, expected package hashes, original process IDs, timestamps, `statusPath`, `logPath`, and an actionable `next`. Errors add `error`. State progresses through `preparing`, `awaiting-receipt`, `waiting-for-turns`, `verifying`, `countdown`, `stopping`, `installing`, `starting`, and `succeeded`, or to `rolling-back` and a terminal failure/recovery result. Records live under `ARC_STATE_DIR/app-replacements`. `immediate` records the selected mode; `waitDeadline` bounds idle waiting, `restartAt` provides the actual countdown deadline, and `phaseStartedAt` identifies each phase. Other phases have no estimated completion time. Desktop shows active progress and terminal outcomes. The independent helper posts native phase notifications, including while Desktop is stopped; OS notification settings can suppress banners, and `notificationError` records delivery errors without aborting installation.

## Worker and validation

ARC submits a one-shot `RunAtLoad` job using `launchctl bootstrap gui/<uid>`. The worker is a copied native Core executable outside both app bundles. A launchd-owned supervisor starts it with `setsid` before exec, giving the worker a separate POSIX session and process group. launchd jobs alone can share session 1; the supervisor closes that remaining lifecycle boundary. Its input and logs are independent of ARC, Codex, the command executor, and MCP clients. This avoids the process-tree cleanup that defeats `nohup`, subshells, and background forks. The plist lives in the job directory, not `~/Library/LaunchAgents`; it is not a login item. The worker writes its terminal result before booting out its supervisor job. See [Apple's launchd lifecycle documentation](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html).

Before executing candidate code, ARC verifies the bundle ID and signatures. Production bundles require the pinned local self-signed certificate used by `check:package`; ad-hoc production signatures are rejected. Dev bundles require valid signatures and the same Dev bundle ID. Isolated state admits only `com.whzxc.agent-remote-control.dev.acceptance-<instanceId>` matching its selected 8-32 character lowercase alphanumeric instance ID; ordinary state does not admit acceptance IDs. Production certificate checks remain unchanged. The candidate Core verifies its own version, Desktop/Core version agreement, packaged skill bytes against its compiled sources, native icon appearances and ICNS, absence of Node/npm runtime resources, and signatures of the bundle, Core, and screen helper. Links and special files are rejected. The package is ditto-copied to a unique sibling staging bundle and validated again before the receipt. The installed copy is validated again before launch. These are the native equivalents of `npm run check:package`; local Xcode tools including `assetutil` are required.

After acknowledgment in normal mode, the worker waits for three consecutive quiet samples, for up to five minutes. It completes package checks before starting a ten-second visible restart countdown. Immediate mode bypasses these waits and does not query task activity, writes, interactions, or updater idle state. Only work ARC would interrupt blocks the turn drain: Codex turns with `executionOwner: "connector"` and live non-Codex `arc-task` processes. Codex `executionOwner: "desktop"` and external `transcript` sessions do not block. Ownership comes from the existing task records used by the task UI and the activity source that distinguishes owned processes from transcript observations; titles and `origin` are not ownership evidence. Unknown ownership blocks and is identified in `waiting.blockingTurns`. A temporary Desktop/Core endpoint loss remains in the bounded waiting phase. If Desktop exits, the helper can relaunch the validated original package. It reconnects to restarted owners only when the Core and Desktop build hashes and installed bundle path still match the original package. Different running code cancels the handoff. Normal mode never overrides an active turn, write, or pending interaction. Immediate mode is an explicit instruction to interrupt ARC-owned work through graceful application shutdown. In normal mode, Core active writes and pending interactions must be zero and missing observations fail closed. The helper reads the existing `tasks` and `agents/activity` operations, so it can classify work on the older installed Core before upgrading it. Live activity supplies the current turn ID; older Core responses use the newest matching task receipt when available. The new Core refuses new task dispatches and pauses durable queued sends while replacement is pending. A first upgrade from an older Core cannot enforce that admission gate; the control source MUST keep dispatch paused during that handoff.

During preparation, the helper copies the old app into the private `ARC_STATE_DIR/app-replacements/backups/<id>` directory and verifies its signature and binary fingerprints. The receipt records `backupDirectory`, `backup`, and `backupReady`. No backup is created beside the installed app. Staging the new app still uses a unique sibling `.replacement-<id>.app` so the final move stays on one filesystem.

The worker requests `app quit`, waits for the captured Desktop and Core PIDs to exit, and acquires the Core lifecycle lock before changing files. Long-lived `arc stdio` and `cli mcp` forwarding processes are not owners and do not block replacement. `cli local-mcp` holds a Core lease; close that leased client first or replacement will cancel when Core cannot exit. The worker journals `backupMoved:true` before removing the old installed bundle, then renames the validated staging bundle into place. This field means the installation has been touched and backup recovery may be necessary. It verifies installed signatures and binary hashes, releases the lock, and relaunches with the same state directory. Success requires matching live Desktop and Core hashes.

On installation or startup failure, the worker stops the failed build, waits for process exit, copies it to `failed.app` in the private backup directory, restores the verified backup, and checks the old build after relaunch. Copies support a state directory on another filesystem. If graceful termination or recovery fails, the backup remains available and the receipt reports recovery failure. After verified success, ARC retains only the latest backup under its state directory and removes older receipt-owned backups for the same installed target. Successful rollback removes the recovery backup and `failed.app`; cancellation removes its unused backup. Failed recovery preserves its backup. Cleanup also removes authenticated legacy `<installed-app>.backup-*` sibling bundles after success or recovery. It never deletes another target's backups or active recovery copies. `backupCleanup` reports the retained path, removed directories and cleanup errors without rolling back a healthy app. Older temporary-directory receipts remain eligible for this cleanup. User data is never deleted or rolled back over newer data, and application rollback cannot undo a state migration.

## Limits

ARC-owned Codex app-server processes use parent-owned stdin/stdout RPC pipes, pending callbacks, and backend session identity. Keeping the child alive alone would not reconnect those channels. Core therefore retains its existing child shutdown behavior. Normal replacement lets the current turn finish before shutdown; immediate replacement may interrupt it. Neither mode migrates a running turn. Following restart, continue an existing conversation with a new turn when needed. Codex Desktop owns its own process lifecycle.

Receipt flush proves delivery to the caller's transport, not that a human read it. The additional task drain prevents the dispatching turn from being killed during ordinary completion. In normal mode, busy or unobservable tasks cancel installation. Immediate mode skips that wait while still requiring process exit before changing application files.

The user must have a logged-in macOS GUI launchd domain and permission to write beside the installed app. The helper does not request elevation. Logout, reboot, forced worker termination, disk failure, and incompatible user-state migrations are not transactional recovery guarantees. A nonterminal status after such an interruption requires checking its log, job, and backup before manual recovery. Do not run another installer or manually relaunch ARC during the handoff.

## Continue after recovery

Pass a continuation through stdin when preparing replacement:

```sh
printf '%s' '{"continuation":{"threadId":"<existing-thread>","prompt":"Continue the original task from its recorded state."}}' | arc cli app replace /absolute/Candidate.app --stdin
```

Use `--check --stdin` to validate the same input without installing or sending. Optional continuation fields are `model`, `turn` and `notify`, using the `codex_send` contract. ARC validates the existing thread before staging, records a generated continuation `requestId`, and queues the explicit message in that same thread only after the new Core and Desktop fingerprints pass the existing health check. Existing queue approval and prior-turn failure rules still apply; queue acceptance does not claim the next turn has begun or finished.

The replacing turn MUST end after receiving its replacement receipt. No control-source polling is needed to trigger the continuation. `cli app replace --status` exposes `continuationState`, the original `continuation.requestId`, and `continuationReceipt` or `continuationError`. If submission is uncertain, read that ID with `cli control receipt --stdin`; do not submit another message with a new ID. A worker crash after recording submission intent may require reconciliation through that receipt. Continuation failure does not roll back a healthy installation. Cancelled, failed and rolled-back replacements do not deliver the continuation.
