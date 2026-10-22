import test from "node:test";
import assert from "node:assert/strict";
import { mergeActivity, trackActivity, agentPanelSelection, endedActivity, activityLayout, visibleActivity, beginApproval, finishApproval, permissionResponse, interactionKey } from "../ui/state/activityModel.ts";
import type { AgentActivitySession, AgentActivitySnapshot, AgentInteraction } from "../ui/types.ts";
const permission: AgentInteraction = { kind: "permission", summary: "Run example command", respond: { via: "act", op: "agent_respond", args: { agent: "claude", taskId: "task-example", interactionId: 1 } }, options: [{ kind: "allow_once", optionId: "yes" }, { kind: "reject_once", optionId: "no" }] };
function session(id: string, interaction?: AgentInteraction): AgentActivitySession {
  return { id, source: "arc-task", phase: interaction ? "interaction" : "command", phaseSince: "2026-01-01T00:00:00Z", headline: "printf example", timeline: true, interaction };
}
function snapshot(at: number, sessions: AgentActivitySession[]): AgentActivitySnapshot {
  return { observedAt: `2026-01-01T00:00:0${at}Z`, activeAgents: [], agents: { claude: { sessions } } };
}
test("full snapshots update sessions, remove completed ones and reject older observations", () => {
  const first = snapshot(1, [session("one"), session("two")]);
  const next = snapshot(2, [session("two", permission)]);
  assert.equal(mergeActivity(undefined, first), first);
  assert.equal(mergeActivity(first, next), next);
  assert.equal(mergeActivity(next, first), next);
  assert.equal(mergeActivity(next, snapshot(3, [])).agents.claude.sessions.length, 0);
});
test("five tasks stay individual; overflow replaces slot five and counts every hidden task", () => {
  for (let n = 0; n <= 9; n++) {
    const tracked = trackActivity([], Array.from({ length: n }, (_, i) => session(String(i))), 1000);
    const shown = visibleActivity(tracked);
    assert.equal(shown.count, Math.min(n, 5));
    assert.equal(shown.sessions.length, n > 5 ? 4 : n);
    assert.equal(shown.hidden, n > 5 ? n - 4 : 0);
    assert.equal(shown.sessions.length + shown.hidden, n);
  }
  assert.equal(activityLayout.width, 232); assert.equal(activityLayout.height, 54);
});
test("start order is stable across phases, payload order and corrected timestamps; only attention reorders", () => {
  const first = { ...session("first"), startedAt: "2026-01-01T00:00:01Z" };
  const second = { ...session("second"), startedAt: "2026-01-01T00:00:02Z" };
  let tracked = trackActivity([], [second, first], 10);
  assert.deepEqual(tracked.map(s => s.id), ["first", "second"]);
  tracked = trackActivity(tracked, [{ ...second, phase: "thinking", startedAt: "2025-01-01T00:00:00Z" }, { ...first, headline: "changed" }], 20);
  assert.deepEqual(tracked.map(s => s.id), ["first", "second"]);
  tracked = trackActivity(tracked, [first, { ...second, interaction: permission }], 30);
  assert.deepEqual(tracked.map(s => s.id), ["second", "first"]);
  tracked = trackActivity(tracked, [second, first], 40);
  assert.deepEqual(tracked.map(s => s.id), ["first", "second"]);
  const fallback = trackActivity([], [session("b"), session("a")], 100);
  assert.deepEqual(trackActivity(fallback, [session("a"), session("b")], 200).map(s => s.orderAt), [100, 100]);
});
test("missing sessions retain unread completions; read completions expire after two seconds plus fade", () => {
  const active = trackActivity([], [session("one", permission)], 100);
  const ended = trackActivity(active, [], 500);
  assert.equal(ended[0].endedAt, 500);
  assert.equal(ended[0].interaction, undefined);
  assert.equal(trackActivity(ended, [], 2499)[0].endedAt, 500);
  assert.equal(trackActivity([{ ...ended[0], readAt: 500 }], [], 2800).length, 0);
  assert.equal(trackActivity(ended, [], 2799).length, 1);
  assert.equal(trackActivity(ended, [], 2800).length, 1);
  assert.equal(trackActivity(ended, [session("one")], 1000)[0].endedAt, undefined);
  assert.equal(trackActivity(ended, [session("one")], 1000)[0].orderAt, active[0].orderAt);
});
test("an open task keeps its origin and branch for focus restoration, even beyond the visible cap", () => {
  const active = trackActivity([], Array.from({ length: 7 }, (_, i) => session(String(i))), 100);
  const shown = visibleActivity(active, "6");
  assert.deepEqual(shown.sessions.map(s => s.id), ["0", "1", "2", "6"]);
  assert.equal(shown.hidden, 3);
  const ended = trackActivity(active, [], 500).map(s => ({ ...s, readAt: 500 }));
  assert.deepEqual(trackActivity(ended, [], 5000, "6").map(s => s.id), ["6"]);
  assert.equal(trackActivity(ended, [], 5000).length, 0);
});
test("approvals use ACP single-use choices, Pi confirmation and Codex decisions; questions do not submit", () => {
  assert.equal(permissionResponse(permission, "allow")?.args.optionId, "yes");
  assert.equal(permissionResponse(permission, "deny")?.args.optionId, "no");
  assert.equal(permissionResponse({ ...permission, options: [{ kind: "allow_always", optionId: "always" }] }, "allow"), undefined);
  assert.equal(permissionResponse({ ...permission, options: [] }, "deny")?.args.cancelled, true);
  assert.equal(permissionResponse({ ...permission, respond: { op: "agent_respond", args: { agent: "pi" } } }, "allow")?.args.confirmed, true);
  assert.deepEqual(permissionResponse({ ...permission, respond: { op: "codex_respond", args: { id: "interaction" } } }, "deny")?.args.result, { decision: "decline" });
  assert.equal(permissionResponse({ ...permission, kind: "question" }, "allow"), undefined);
  assert.equal(permissionResponse({ ...permission, canRespond: false }, "allow"), undefined);
});
test("submission locks immediately, survives snapshot refresh and retries only the identical UUID/payload", () => {
  const payload = permissionResponse(permission, "allow")!;
  let ids = 0;
  const first = beginApproval(undefined, "allow", payload, () => `request-${++ids}`)!;
  assert.equal(first.status, "submitting");
  assert.equal(beginApproval(first, "allow", payload, () => "unused"), undefined);
  const failed = finishApproval(first, { state: "failed", error: "connection lost" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "connection lost");
  assert.equal(beginApproval(failed, "deny", payload, () => "unused"), undefined);
  const retry = beginApproval(failed, "allow", payload, () => `request-${++ids}`)!;
  assert.equal(retry.payload, first.payload);
  assert.equal(ids, 1);
  const pending = finishApproval(retry, { state: "pending" });
  assert.equal(pending.status, "pending");
  assert.equal(beginApproval(pending, "allow", payload, () => "unused")?.payload, first.payload);
  assert.equal(beginApproval(finishApproval(retry, { state: "completed" }), "allow", payload, () => "unused"), undefined);
  assert.equal(beginApproval(finishApproval(retry, { state: "unconfirmed" }), "allow", payload, () => "unused"), undefined);
  const s = session("task", permission);
  assert.equal(interactionKey("claude", s), interactionKey("claude", { ...s, headline: "updated summary" }));
  assert.notEqual(interactionKey("claude", s), interactionKey("claude", { ...s, phaseSince: "2026-01-01T00:00:01Z" }));
});

test("Pi choice and input answers use the native response and stable retry payload", async () => {
  const { questionResponse } = await import("../ui/state/activityModel.ts");
  const question: AgentInteraction = { kind: "question", summary: "Choose a branch", method: "select", options: ["One", "Two"], respond: { op: "agent_respond", args: { agent: "pi", interactionId: "question-1" } } };
  assert.equal(questionResponse(question, "Other"), undefined);
  assert.equal(questionResponse(question, "Two")?.args.value, "Two");
  assert.equal(questionResponse(question, "", true)?.args.cancelled, true);
  const input = { ...question, method: "input" as const };
  const payload = questionResponse(input, "A response")!;
  const first = beginApproval(undefined, "answer", payload, () => "answer-uuid")!;
  assert.equal(beginApproval(first, "answer", payload, () => "unused"), undefined);
  const failed = finishApproval(first, { state: "failed" });
  assert.equal(beginApproval(failed, "answer", questionResponse(input, "Changed")!, () => "unused")?.payload, first.payload);
  assert.equal(beginApproval(failed, "cancel", payload, () => "unused"), undefined);
});

test("timeline replaces by item id, retains unchanged entries, and orders backfilled items", async () => {
  const { mergeTimeline } = await import("../ui/state/timelineModel.ts");
  const current = timeline([entry("live", 1, "partial", 0)]);
  const next = timeline([entry("old", 2, "history", 0), entry("live", 3, "complete", 1)]);
  const merged = mergeTimeline(current, next);
  assert.deepEqual(merged.entries.map(e => [e.id, e.text]), [["old", "history"], ["live", "complete"]]);
  assert.equal(merged.cursor, 3);
  assert.equal(mergeTimeline(merged, timeline([entry("live", 4, "latest", 1)])).entries.length, 2);
  assert.equal(current.entries[0].text, "partial");
});

test("expired timeline cursor discards old state and retries once without after", async () => {
  const { refreshTimeline } = await import("../ui/state/timelineModel.ts");
  const calls: (number | undefined)[] = [];
  const restored = timeline([entry("restored", 1, "restored", 0)]);
  const result = await refreshTimeline(timeline([entry("old", 50, "stale", 0)]), async after => {
    calls.push(after);
    if (after !== undefined) throw new Error("TIMELINE_CURSOR_EXPIRED: fetch again without after");
    return restored;
  });
  assert.deepEqual(calls, [50, undefined]);
  assert.equal(result, restored);
  assert.deepEqual(result.entries.map(e => e.id), ["restored"]);
  let attempts = 0;
  await assert.rejects(refreshTimeline(restored, async () => { attempts++; throw new Error("offline"); }), /offline/);
  assert.equal(attempts, 1);
});

test("scroll follows live snapshots until upward movement, resumes at bottom, and leaves finished history still", async () => {
  const { followsTimeline, timelineScrollTarget } = await import("../ui/state/timelineModel.ts");
  assert.equal(followsTimeline(600, 400, 1000, 590), true);
  assert.equal(followsTimeline(590, 400, 1000, 600), false);
  assert.equal(followsTimeline(100, 400, 1000, 90), false);
  assert.equal(timelineScrollTarget(true, true, false, 1200), 1200);
  assert.equal(timelineScrollTarget(false, true, false, 1200), undefined);
  assert.equal(timelineScrollTarget(true, false, false, 1200), undefined);
  assert.equal(timelineScrollTarget(true, false, true, 1200), 1200);
});

function entry(id: string, cursor: number, text: string, position: number): import("../ui/types.ts").AgentTimelineEntry {
  return { id, cursor, text, position, type: "text", status: "completed", startedAt: null, updatedAt: "2026-01-01T00:00:00Z", turnId: "turn" };
}
function timeline(entries: import("../ui/types.ts").AgentTimelineEntry[]): import("../ui/types.ts").AgentTimeline {
  return { sessionId: "example", entries, cursor: Math.max(0, ...entries.map(e => e.cursor)), coverage: { state: "complete", truncated: false }, executionEvidence: false };
}

test("file labels are relative only inside the project and keep the filename separate from the elided directory", async () => {
  const { filePathParts } = await import("../ui/state/activityModel.ts");
  assert.deepEqual(filePathParts("/workspace/example/src/deep/file_name.ts", "/workspace/example"), {
    fullPath: "/workspace/example/src/deep/file_name.ts", displayPath: "src/deep/file_name.ts", directory: "src/deep/", filename: "file_name.ts",
  });
  assert.equal(filePathParts("/workspace/example-other/file.ts", "/workspace/example").displayPath, "/workspace/example-other/file.ts");
  assert.equal(filePathParts("/workspace/example/../other/file.ts", "/workspace/example").displayPath, "/workspace/other/file.ts");
  assert.equal(filePathParts("src/file.ts", "/workspace/example/").fullPath, "/workspace/example/src/file.ts");
  assert.equal(filePathParts("/workspace/example/file.ts", "/workspace/example").directory, "");
  assert.equal(filePathParts("C:\\Workspace\\Example\\src\\file.ts", "c:\\workspace\\example\\").displayPath, "src/file.ts");
  assert.equal(filePathParts("D:\\other\\file.ts", "C:\\Workspace\\Example").displayPath, "D:/other/file.ts");
  assert.equal(filePathParts("/example/目录/文件.ts", "/").filename, "文件.ts");
  assert.equal(filePathParts("/example/very/long/directory/file.ts").filename, "file.ts");
});

test("file approvals use path labels in interaction bubbles and timeline cards", async () => {
  const { activityHeadline, filePathParts } = await import("../ui/state/activityModel.ts");
  const project = "/workspace/example";
  const path = `${project}/nested/deep/approval-file.txt`;
  const interaction = { ...permission, path, summary: path };
  const bubble = { ...session("task", interaction), project, headline: interaction.summary };
  const card = { ...bubble, phase: "interaction" as const, headline: interaction.summary, interaction };
  for (const item of [bubble, card]) {
    const label = activityHeadline(item);
    assert.equal(label.path, path);
    assert.equal(label.fullText, path);
    assert.deepEqual(filePathParts(label.path!, item.project), {
      fullPath: path, displayPath: "nested/deep/approval-file.txt", directory: "nested/deep/", filename: "approval-file.txt",
    });
  }
  const relative = activityHeadline({ ...bubble, interaction: { ...interaction, path: "src/approval-file.txt" } });
  assert.equal(relative.fullText, `${project}/src/approval-file.txt`);
  const outside = activityHeadline({ ...bubble, interaction: { ...interaction, path: "/other/approval-file.txt" } });
  assert.equal(filePathParts(outside.path!, project).displayPath, "/other/approval-file.txt");
  const command = activityHeadline({ ...bubble, phase: "file", interaction: permission, headline: permission.summary });
  assert.equal(command.path, undefined);
  assert.equal(command.text, permission.summary);
  assert.equal(activityHeadline({ ...bubble, phase: "file", interaction: undefined, headline: path }).path, path);
});


test("approval projection hides only its unexecuted tool in the same turn and preserves execution results", async () => {
  const { visibleTimelineEntries, interactionTool } = await import("../ui/state/timelineModel.ts");
  const tool = { ...entry("write", 1, "", 1), type: "file" as const, status: "pending" as const, path: "/workspace/example/file.txt", operation: "write" as const };
  const interaction = { ...entry("approval", 2, "", 2), type: "interaction" as const, status: "pending" as const, interaction: { ...permission, path: tool.path } };
  const other = { ...tool, id: "other-turn", turnId: "other" };
  const entries = [other, tool, interaction];
  assert.equal(interactionTool(entries, interaction), tool);
  assert.deepEqual(visibleTimelineEntries(entries).map(e => e.id), ["other-turn", "approval"]);
  for (const status of ["running", "completed", "failed", "cancelled"] as const)
    assert.equal(visibleTimelineEntries([{ ...tool, status }, interaction]).length, 2);
  assert.equal(visibleTimelineEntries([tool, { ...interaction, status: "completed" }]).length, 1);
  assert.equal(visibleTimelineEntries([{ ...tool, path: "/workspace/example/other.txt" }, interaction]).length, 2);
  assert.equal(visibleTimelineEntries([tool, { ...tool, id: "parallel" }, interaction]).length, 3);
  const command = { ...tool, type: "command" as const, path: undefined, command: "printf example" };
  const commandApproval = { ...interaction, interaction: { ...permission, command: command.command } };
  assert.equal(visibleTimelineEntries([command, commandApproval]).length, 1);
  assert.equal(visibleTimelineEntries([command, { ...commandApproval, interaction: { ...permission, summary: command.command } }]).length, 2);
});

test("approval wording uses structured operations and retains generic file access when unknown", async () => {
  const { permissionRequestLabel } = await import("../ui/state/timelineModel.ts");
  const tool = { ...entry("file", 1, "", 1), type: "file" as const };
  assert.equal(permissionRequestLabel({ ...tool, operation: "read" }), "timeline.readRequest");
  for (const operation of ["write", "edit", "create"] as const)
    assert.equal(permissionRequestLabel({ ...tool, operation }), "timeline.writeRequest");
  assert.equal(permissionRequestLabel({ ...tool, type: "command" }), "timeline.commandRequest");
  assert.equal(permissionRequestLabel({ ...tool, title: "Write file.txt" }), "timeline.fileRequest");
  assert.equal(permissionRequestLabel(), "timeline.fileRequest");
});

test("timeline tools only expand when there is detail beyond the summary object", async () => {
  const { expandableTimelineEntry } = await import("../ui/state/timelineModel.ts");
  const file = { ...entry("file", 1, "", 1), type: "file" as const, path: "src/file.ts" };
  assert.equal(expandableTimelineEntry(file), false);
  assert.equal(expandableTimelineEntry({ ...file, changes: [{ path: file.path, operation: "edit" }] }), false);
  assert.equal(expandableTimelineEntry({ ...file, changes: [{ path: "src/other.ts", operation: "edit" }] }), true);
  assert.equal(expandableTimelineEntry({ ...file, exitCode: 0 }), true);
  assert.equal(expandableTimelineEntry({ ...file, output: { text: "result", state: "available", truncated: false, sha256: "example", hashScope: "excerpt" } }), true);
});


test("bubble headlines prefer current content, then recent readable content, then title", async () => {
  const { activityHeadline } = await import("../ui/state/activityModel.ts");
  const base = { ...session("one"), title: "Task title", fallbackHeadline: "Previous readable command" };
  assert.equal(activityHeadline(base).text, "printf example");
  assert.equal(activityHeadline(base).fallback, false);
  const thinking = { ...base, phase: "thinking" as const, headline: " \n " };
  assert.equal(activityHeadline(thinking).text, "Previous readable command");
  assert.equal(activityHeadline(thinking).fallback, true);
  assert.equal(activityHeadline({ ...thinking, fallbackHeadline: " " }).text, "Task title");
  assert.equal(activityHeadline({ ...thinking, phase: "file" }).path, undefined);
  assert.equal(activityHeadline({ ...base, phase: "file", headline: "src/main.rs" }).path, "src/main.rs");
});
test("every source and phase has a visible fallback even before readable content arrives", async () => {
  const { activityHeadline } = await import("../ui/state/activityModel.ts");
  for (const source of ["arc-task", "codex-thread", "transcript"] as const) {
    for (const phase of ["thinking", "command", "file", "tool", "text", "interaction", "idle"] as const) {
      const headline = activityHeadline({ ...session("one"), ...{ source }, phase, headline: "" }, "Task details");
      assert.equal(headline.text, "Task details");
      assert.equal(headline.fallback, true);
    }
  }
});


test("Agent panel toggles the current node, switches peers in place, and returns from bubble detail", () => {
  const first = { ...session("one"), orderAt: 1 };
  let view = agentPanelSelection(undefined, { type: "toggle", agent: "claude" });
  assert.deepEqual(view, { agent: "claude" });
  view = agentPanelSelection(view, { type: "task", agent: "claude", session: first });
  assert.equal(view?.session, first);
  view = agentPanelSelection(view, { type: "back" });
  assert.deepEqual(view, { agent: "claude" });
  view = agentPanelSelection(view, { type: "toggle", agent: "codex" });
  assert.deepEqual(view, { agent: "codex" });
  view = agentPanelSelection(view, { type: "toggle", agent: "codex" });
  assert.equal(view?.closing, true);
  assert.equal(agentPanelSelection(view, { type: "closed" }), undefined);
  view = agentPanelSelection(undefined, { type: "task", agent: "claude", session: first });
  assert.deepEqual(agentPanelSelection(view, { type: "back" }), { agent: "claude" });
  assert.equal(agentPanelSelection(view, { type: "dismiss" })?.session, first);
});
test("ended history retains ARC snapshot data, excludes external sessions and removes resumed tasks", () => {
  const task = session("one", permission), external = { ...session("outside"), source: "transcript" as const };
  const ended = endedActivity([], [task, external], [], 500);
  assert.deepEqual(ended.map(s => [s.id, s.endedAt, s.interaction]), [["one", 500, undefined]]);
  assert.equal(ended[0].headline, task.headline);
  assert.equal(endedActivity(ended, [], [], 5000)[0].endedAt, 500);
  assert.equal(endedActivity(ended, [], [task], 6000).length, 0);
});

test("source dispatches filter ownership and never equate a dispatch receipt with task completion", async () => {
  const { sourceDispatches, dispatchState, isLatestDispatch } = await import("../ui/state/sourceDispatch.ts");
  const row = (id: string, source: string, date: string) => ({ requestId: id, origin: { ingressId: source }, state: "completed", createdAt: date,
    updatedAt: date, approval: { decision: "allowed", source: "local", at: date }, task: { kind: "create", threadId: "thread", prompt: "Fixture", input: {}, settings: {} } });
  const older = row("older", "left", "2026-01-01"), latest = row("latest", "left", "2026-01-02"), other = row("other", "right", "2026-01-03");
  assert.deepEqual(sourceDispatches([older, other, latest], "left").map(r => r.requestId), ["latest", "older"]);
  assert.equal(isLatestDispatch(latest, [older, latest]), true);
  assert.equal(isLatestDispatch(latest, [older, latest, other]), false, "a later dispatch from another source owns current thread state");
  assert.equal(dispatchState(latest, undefined, undefined), "unknown");
  assert.equal(dispatchState(latest, { runtimeStatus: "idle", observedAt: "", stale: true }, undefined), "unknown");
  assert.equal(dispatchState(latest, { runtimeStatus: "idle", observedAt: "" }, undefined), "completed");
  assert.equal(dispatchState(latest, { runtimeStatus: "active", observedAt: "" }, undefined), "running");
  assert.equal(dispatchState(latest, undefined, session("thread", permission)), "pending");
  assert.equal(dispatchState({ ...latest, state: "failed" }, undefined, undefined), "failed");
  assert.deepEqual(sourceDispatches([{ ...latest, origin: undefined, task: { ...latest.task, origin: { ingressId: "left" } } }], "left").length, 1);
});
