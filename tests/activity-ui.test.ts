import test from "node:test";
import assert from "node:assert/strict";
import { mergeActivity, visibleActivity, beginApproval, finishApproval, permissionResponse, interactionKey } from "../ui/state/activityModel.ts";
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
test("attention sorts first; at most three bubbles with exact overflow and stable identity order", () => {
  const sessions = [session("e"), session("d"), session("c"), session("b", permission), session("a", permission)];
  const shown = visibleActivity(sessions, 1000);
  assert.deepEqual(shown.sessions.map(s => s.id), ["a", "b", "c"]);
  assert.equal(shown.hidden, 2);
  assert.equal(shown.width, 220);
  assert.equal(sessions[0].id, "e");
});
test("narrow widths hide all bubbles; exact thresholds respect minimum width and gaps", () => {
  const sessions = [session("one"), session("two"), session("three")];
  for (const available of [-30, 0, 179]) assert.equal(visibleActivity(sessions, available).sessions.length, 0);
  assert.equal(visibleActivity(sessions, 180).sessions.length, 1);
  assert.equal(visibleActivity(sessions, 367).sessions.length, 1);
  assert.equal(visibleActivity(sessions, 368).sessions.length, 2);
  assert.equal(visibleActivity(sessions, 556).sessions.length, 3);
  assert.equal(visibleActivity(sessions, 180).hidden, 2);
  assert.equal(visibleActivity([session("one")], 1000).width, 220);
  assert.equal(visibleActivity([], 1000).width, 0);
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
