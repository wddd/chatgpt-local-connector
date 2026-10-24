import test from "node:test";
import assert from "node:assert/strict";
import { changedFiles, processRows, processOpen, projectTurn, taskState } from "../ui/state/taskProjection.ts";
import type { AgentTimelineEntry } from "../ui/types.ts";
const entry = (id: string, type: AgentTimelineEntry["type"], extra: Partial<AgentTimelineEntry> = {}): AgentTimelineEntry => ({ id, type, status: "completed", turnId: "turn", startedAt: null, updatedAt: "", cursor: 1, ...extra });
test("tool runs merge without absorbing narrative or interaction boundaries", () => {
  // Property: grouping preserves tool order and narrative boundaries without duplicating entries.
  const entries = [entry("a", "file"), entry("b", "command"), entry("c", "text"), entry("d", "tool"), entry("e", "interaction"), entry("f", "command")];
  const rows = processRows(entries);
  assert.deepEqual(rows.map(row => row.kind), ["tools", "entry", "tools", "entry", "tools"]);
  assert.deepEqual(rows.flatMap(row => row.kind === "tools" ? row.entries : [row.entry]), entries);
});
test("only the latest plan and live thinking survive projection", () => {
  // Property: plan replacement and thinking removal are independent of historical item count.
  const entries = [entry("p1", "plan"), entry("t1", "thinking", { text: "First" }), entry("p2", "plan"), entry("t2", "thinking", { text: "Latest" }), entry("answer", "text", { phase: "final_answer", text: "Result" })];
  const live = projectTurn(entries, "running");
  assert.equal(live.plan?.id, "p2");
  assert.equal(live.thinking?.id, "t2");
  assert.deepEqual(live.rows.map(row => row.id), ["p2"]);
  assert.equal(projectTurn(entries, "done").thinking, undefined);
  assert.equal(projectTurn(entries, "done").final?.id, "answer");
});
test("terminal state and process folding do not mistake a failed command for a failed turn", () => {
  // Property: authoritative turn state governs folding and failed or interrupted processes stay visible.
  assert.equal(taskState("completed", false), "done");
  assert.equal(taskState("failed", false), "failed");
  assert.equal(taskState("cancelled", false), "interrupted");
  assert.equal(taskState(undefined, false), "unknown");
  assert.equal(taskState("completed", true), "running");
  assert.equal(taskState("running", true, true), "needsYou");
  assert.equal(processOpen("done"), false);
  assert.equal(processOpen("done", true), true);
  assert.equal(processOpen("failed", false), true);
  assert.equal(processOpen("interrupted", false), true);
  assert.equal(projectTurn([entry("failed-command", "command", { status: "failed" }), entry("final", "text")], "done").final?.id, "final");
});
test("changed files omit failed writes and never invent missing counts", () => {
  // Property: only completed writes contribute changes and unknown line counts stay unknown.
  assert.deepEqual(changedFiles([entry("read", "file", { path: "a", operation: "read" }), entry("fail", "file", { path: "b", operation: "edit", status: "failed" })]), []);
  const files = changedFiles([entry("edit", "file", { changes: [{ path: "a", added: 2, removed: 1 }] }), entry("edit2", "file", { changes: [{ path: "a", added: 3, removed: 0 }, { path: "b" }] })]);
  assert.deepEqual(files, [{ path: "a", added: 5, removed: 1 }, { path: "b", added: undefined, removed: undefined }]);
});
