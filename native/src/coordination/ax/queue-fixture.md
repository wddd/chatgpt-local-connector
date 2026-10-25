# ARC pending queue (Claude control source)

Updated 2026-10-25 13:50Z.

Policy (User, 2026-10-25):
- UI-layer acceptance uses browser fixtures + screenshots only (real-shaped, sanitized fixture data). No real-device UI acceptance; real experience issues surface in User's daily use. Keep acceptance cost low.
- Accessibility / reduced-motion polish is out of scope during fast iteration (keep cheap basics only).
- Acceptance never changes host OS settings; use app_env overrides or report a gap.
- Any dev:isolated launch goes through <local-memory-wrapper>.
- Freeze lifted by User at ~14:00Z (new version 9eb6819 installed). Landing allowed again.

Landed today (unpushed until User pushes): footer/header cleanup, request countdown, bubble mark-read + persistence, notification noise/restart fixes, ui-polish (ripple, origin icon layering, nested wheel routing, short-window dock), acceptance-overrides (app_env).

Done: fixture + screenshot UI acceptance on eaee72a (thread fixture-thread; evidence output/fixture-report).

DONE 2026-10-25 15:40Z: fixture-gaps (4fb2cdd..6322a10) and approval-preview (51c866b..b80581b) landed; fixture re-check on b80581b clean. Nothing pending from Claude's queue except the backlog ideas below.

History — fixture-gaps scope (completed):
- 320 px question sheet exceeds 60% cap (474/544 px); apply cap to narrow sheet.
- Pending dock shows raw `SCENARIO_ACTION_UNAVAILABLE: tasks/request-routing` and drops routing text: neutral localized fallback in product; fixture harness implements tasks/request-routing and app/env routes; scenarioReady reports missing routes.
- Add real-shaped sanitized fixtures: ownership connector vs desktop+history; routing deferred/paused/routed/not-routable; failed (Retry) and interrupted (Resume) turns; long question + long approval preview; horizontally overflowing table/code block; name task dialogs by task title in AX tree; document scenario names in acceptance docs.
- AX friction: REPLACE_PENDING error's next points to guide instead of app.replace.status.

Backlog ideas (not dispatched):
- native/src/catalog.json conflicts on almost every land; consider splitting per op.
- A control source's own send to an idle thread produced a self-triggered 'unheld -> connector' handoff notice; should not notify the triggering source.
- Update notices (2026-10-25/26): 'ARC update settling / will interrupt / succeeded' messages arrive without the standard '⟢ ARC receipt — automated' header (read like user messages); 'settling: no blockers' with nothing to do is noise; per-turn interruption notices went to every verified target even when the affected turn belonged to another source/session. Send impact notices only to owners of affected turns; others get at most the recovery summary.
- Optional thin real-instance smoke (pending routing, queue/steer, notifications, restart recovery) only before push/release, memwatch-wrapped.

## AX frictions from the multi-account release session (Claude source, 2026-10-25/26)

Interim entries until the AX store ships (see docs/dev/control-plane-proposal.md, phase 1 `coordination-ax`).
- Interrupted receipts delivered after the resumed turn completed, including one for a completed thread.
- 'No verified push' hint contradicting a verified notification field on same-origin sends.
- Missing completion push for a first turn (fixture-task).
- A control-source MCP connection did not recover after an ARC restart.
- codex_read/codex_resume stuck on DESKTOP_REQUEST_TIMEOUT thread-owner-discovery for an unheld thread; next only points to guide.
- command-op background processes are killed when the command returns; no detach option.
- Long foreground command receipt stuck at reserved/progressStalled while the command ran fine.
- app snapshot had no concurrency or memory bound; acceptance loops could endanger the host (bounded in 909c86c).
- codex_send without model uses the policy default instead of the thread's last model; app-replace continuations inherited it (continuation now accepts model).
- SOURCE_REVOKED surfaced as 'Correct usage' (fixed in 1eec642).
- Local CLI revocable from the control-source list with no restore (fixed in 1eec642).
- logs since:'2m' fails with 'premature end of input'.
- whoami/notification data retains empty-target and stale failed sessions.
- Update notices delivered out of order ('N turns will be interrupted' after 'update succeeded').
- Recovery summary '14 tasks affected' counted non-interrupted tasks (see 4ffbe47).

Follow-ups (not dispatched):
- Installed Core idles at ~15% CPU after 2f77284 + 9e956a0 (was 195%); remaining pollers: writer-lock probes, upstream requests.
- Core footprint grew from ~126 MB to ~400 MB after the polling cache (9e956a0); confirm cache bounds.
- D3: WebContent RSS creeps slowly at idle (~2 MB/min over 10 min).
- D2 edge: a selection spanning a privacy stand-in and normal text copies only the sensitive value.
